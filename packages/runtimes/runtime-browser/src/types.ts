import type {
	AppendOptions,
	DurableCommitRequest,
	EventInput,
	ReadAllOptions,
} from "@hobo/core";

export type BrowserPersistenceMode =
	| "opfs-sahpool"
	| "transient-memory"
	| "unavailable";

export interface BrowserStorageOpenOptions {
	/** Logical partition name (maps to OPFS file name). */
	readonly partitionId: string;
	/**
	 * When true and OPFS is missing, open an in-memory store.
	 * When false (default), fail with PERSISTENCE_UNAVAILABLE.
	 */
	readonly allowTransient?: boolean;
	/** Prefer multi-tab VFS when implemented; default single-owner sahpool. */
	readonly multiTab?: boolean;
}

export type BrowserStorageRequest =
	| {
			id: string;
			op: "append";
			streamId: string;
			events: EventInput[];
			options: AppendOptions;
	  }
	| { id: string; op: "commit"; request: DurableCommitRequest }
	| { id: string; op: "read"; streamId: string; fromSeq?: number }
	| { id: string; op: "readAll"; options?: ReadAllOptions }
	| {
			id: string;
			op: "snapshot";
			streamId: string;
			state: unknown;
			seq: number;
	  }
	| { id: string; op: "loadSnapshot"; streamId: string }
	| { id: string; op: "ping" }
	| { id: string; op: "shutdown" };

export type BrowserStorageResponse =
	| { id: string; ok: true; result: unknown }
	| {
			id: string;
			ok: false;
			error: { name: string; message: string; code?: string };
	  };
