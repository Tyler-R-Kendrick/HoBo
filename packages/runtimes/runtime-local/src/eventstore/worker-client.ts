/**
 * Main-thread client for the storage worker. Serializes all ops through one
 * Worker so DatabaseSync never races and never monopolizes the event loop.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

import type {
	AppendOptions,
	AppendResult,
	DurableCommitRequest,
	DurableCommitResult,
	EventEnvelope,
	EventInput,
	ReadAllOptions,
	SnapshotRecord,
} from "@hobo/core";
import { StorageWorkerTerminatedError } from "@hobo/core";

import type {
	StorageWorkerRequest,
	StorageWorkerResponse,
} from "./storage-worker.js";

export interface StorageWorkerClientOptions {
	readonly dbPath: string;
	readonly partitionId?: string;
}

export class StorageWorkerClient {
	private worker: Worker | null = null;
	private readonly pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
		}
	>();
	private seq = 0;
	private readonly options: StorageWorkerClientOptions;

	constructor(options: StorageWorkerClientOptions) {
		this.options = options;
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		const workerPath = fileURLToPath(
			new URL("./storage-worker.js", import.meta.url),
		);
		const worker = new Worker(workerPath, {
			workerData: {
				dbPath: this.options.dbPath,
				partitionId: this.options.partitionId,
			},
		});
		worker.on("message", (msg: StorageWorkerResponse) => {
			const slot = this.pending.get(msg.id);
			if (!slot) return;
			this.pending.delete(msg.id);
			if (msg.ok) {
				slot.resolve(reviveBigints(msg.result));
			} else {
				const err = new Error(msg.error.message);
				err.name = msg.error.name;
				if (msg.error.code) {
					(err as { code?: string }).code = msg.error.code;
				}
				slot.reject(err);
			}
		});
		worker.on("error", (error: Error) => {
			this.failAll(error);
			this.worker = null;
		});
		worker.on("exit", (code) => {
			if (code !== 0) {
				this.failAll(
					new StorageWorkerTerminatedError(
						`storage worker exited with code ${code}`,
					),
				);
			}
			this.worker = null;
		});
		this.worker = worker;
		return worker;
	}

	private failAll(error: Error): void {
		for (const [, slot] of this.pending) {
			slot.reject(error);
		}
		this.pending.clear();
	}

	private call(request: StorageWorkerRequest): Promise<unknown> {
		const worker = this.ensureWorker();
		return new Promise((resolve, reject) => {
			this.pending.set(request.id, { resolve, reject });
			worker.postMessage(request);
		});
	}

	private nextId(): string {
		return `req-${++this.seq}`;
	}

	append(
		streamId: string,
		events: EventInput[],
		options: AppendOptions,
	): Promise<AppendResult> {
		return this.call({
			id: this.nextId(),
			op: "append",
			streamId,
			events,
			options,
		}) as Promise<AppendResult>;
	}

	commit(request: DurableCommitRequest): Promise<DurableCommitResult> {
		return this.call({
			id: this.nextId(),
			op: "commit",
			request,
		}) as Promise<DurableCommitResult>;
	}

	async read(streamId: string, fromSeq?: number): Promise<EventEnvelope[]> {
		const req: StorageWorkerRequest =
			fromSeq === undefined
				? { id: this.nextId(), op: "read", streamId }
				: { id: this.nextId(), op: "read", streamId, fromSeq };
		return this.call(req) as Promise<EventEnvelope[]>;
	}

	async readAll(options?: ReadAllOptions): Promise<unknown[]> {
		const req: StorageWorkerRequest =
			options === undefined
				? { id: this.nextId(), op: "readAll" }
				: { id: this.nextId(), op: "readAll", options };
		return this.call(req) as Promise<unknown[]>;
	}

	snapshot(
		streamId: string,
		state: unknown,
		seq: number,
	): Promise<SnapshotRecord> {
		return this.call({
			id: this.nextId(),
			op: "snapshot",
			streamId,
			state,
			seq,
		}) as Promise<SnapshotRecord>;
	}

	loadSnapshot(streamId: string): Promise<SnapshotRecord | undefined> {
		return this.call({
			id: this.nextId(),
			op: "loadSnapshot",
			streamId,
		}) as Promise<SnapshotRecord | undefined>;
	}

	async close(): Promise<void> {
		if (!this.worker) return;
		try {
			await this.call({ id: this.nextId(), op: "shutdown" });
		} catch {
			// ignore
		}
		await this.worker.terminate();
		this.worker = null;
	}
}

function reviveBigints(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reviveBigints);
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (
			Object.keys(obj).length === 1 &&
			typeof obj.$bigint === "string" &&
			/^-?\d+$/.test(obj.$bigint)
		) {
			return BigInt(obj.$bigint);
		}
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = reviveBigints(v);
		}
		return out;
	}
	return value;
}
