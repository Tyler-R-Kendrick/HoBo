import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	createRuntimeLocalEventStore,
	OptimisticSequenceConflictError,
} from "@hobo/runtime-local";

import {
	applyReviewEvent,
	decideReviewEvents,
	emptyReviewAggregate,
	type ReviewAggregate,
	type ReviewDecideContext,
} from "./review-aggregate.js";
import { parseReviewSnapshot } from "./review-contract.js";
import { reviewError } from "./review-errors.js";
import {
	parseReviewEvent,
	type ReviewDomainEvent,
	reviewEventInput,
} from "./review-events.js";
import type { PendingReview } from "./review-ports.js";
import {
	REVIEW_PARTITION,
	type ReviewCommandEnvelope,
	type ReviewCommandResult,
	type ReviewContentStore,
	type ReviewDiffSource,
	type ReviewReanchorEngine,
	type ReviewRuntime,
	type ReviewSnapshot,
} from "./review-ports.js";
import { reviewSnapshotJson } from "./review-projections.js";

// public-contract: EventStore stream name prefix for a review aggregate.
export const REVIEW_STREAM_PREFIX = "code-review:";

export function reviewStreamId(reviewId: string): string {
	if (!reviewId)
		throw reviewError("malformed-input", "reviewId must not be empty");
	return `${REVIEW_STREAM_PREFIX}${reviewId}`;
}

export function hashReviewBytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function hashReviewText(value: string): string {
	return hashReviewBytes(new TextEncoder().encode(value));
}

export const REVIEW_BODY_INLINE_LIMIT = 256;

export function createMemoryReviewContentStore(
	initial?: Iterable<readonly [string, Uint8Array]>,
): ReviewContentStore & { readonly blobs: Map<string, Uint8Array> } {
	const blobs = new Map<string, Uint8Array>(initial);
	return {
		blobs,
		async put(bytes) {
			const hash = hashReviewBytes(bytes);
			if (!blobs.has(hash)) blobs.set(hash, bytes);
			return hash;
		},
		async get(hash) {
			const stored = blobs.get(hash);
			if (!stored) {
				throw reviewError("corrupted-state", `missing review content ${hash}`, {
					hash,
				});
			}
			if (hashReviewBytes(stored) !== hash) {
				throw reviewError(
					"corrupted-state",
					`review content hash mismatch for ${hash}`,
					{ hash },
				);
			}
			return stored;
		},
		async has(hash) {
			return blobs.has(hash);
		},
	};
}

export function createFileReviewContentStore(root: string): ReviewContentStore {
	mkdirSync(root, { recursive: true });
	return {
		async put(bytes) {
			const hash = hashReviewBytes(bytes);
			const path = join(root, hash);
			if (existsSync(path)) return hash;
			try {
				writeFileSync(path, bytes, { flag: "wx" });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
			return hash;
		},
		async get(hash) {
			const path = join(root, hash);
			let stored: Uint8Array;
			try {
				stored = readFileSync(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					throw reviewError(
						"corrupted-state",
						`missing review content ${hash}`,
						{ hash },
					);
				}
				throw error;
			}
			if (hashReviewBytes(stored) !== hash) {
				throw reviewError(
					"corrupted-state",
					`review content hash mismatch for ${hash}`,
					{ hash },
				);
			}
			return stored;
		},
		async has(hash) {
			return existsSync(join(root, hash));
		},
	};
}

export async function assertReviewEventContent(
	event: ReviewDomainEvent,
	content: ReviewContentStore,
): Promise<void> {
	const hashed =
		event.type === "code.ReviewMessageAdded"
			? {
					hash: event.data.message.bodyHash,
					inline: event.data.bodyInline,
				}
			: event.type === "code.ReviewMessageEdited"
				? { hash: event.data.bodyHash, inline: event.data.bodyInline }
				: undefined;
	if (!hashed) return;
	if (hashed.inline !== undefined) {
		if (hashReviewText(hashed.inline) !== hashed.hash) {
			throw reviewError(
				"corrupted-state",
				`inline review body does not match ${hashed.hash}`,
				{ hash: hashed.hash },
			);
		}
		return;
	}
	await content.get(hashed.hash);
}

export interface ResidentReviewRuntimeOptions {
	readonly dataDir: string;
	readonly now?: () => string;
	readonly id?: () => string;
	readonly contentStore?: ReviewContentStore;
	readonly diffSource?: ReviewDiffSource;
	readonly reanchor?: ReviewReanchorEngine;
	readonly inlineLimit?: number;
}

export interface ReviewView {
	readonly snapshot: ReviewSnapshot;
	readonly aggregate: ReviewAggregate;
	readonly pending?: PendingReview;
}

export interface ResidentReviewRuntime extends ReviewRuntime {
	loadView(reviewId: string): Promise<ReviewView>;
	close(): void;
}

const reviewQueues = new Map<string, Promise<unknown>>();

function enqueueReview<T>(key: string, work: () => Promise<T>): Promise<T> {
	const previous = reviewQueues.get(key) ?? Promise.resolve();
	const next = previous.then(work, work);
	reviewQueues.set(
		key,
		next.then(
			() => undefined,
			() => undefined,
		),
	);
	return next;
}

export function createResidentReviewRuntime(
	options: ResidentReviewRuntimeOptions,
): ResidentReviewRuntime {
	const now = options.now ?? (() => new Date().toISOString());
	const id = options.id ?? (() => randomUUID());
	const content =
		options.contentStore ??
		createFileReviewContentStore(join(options.dataDir, "review-blobs"));
	const inlineLimit = options.inlineLimit ?? REVIEW_BODY_INLINE_LIMIT;
	const store = createRuntimeLocalEventStore({
		dataDir: options.dataDir,
		clock: { now },
		partitionId: REVIEW_PARTITION,
	});
	const lockDir = join(options.dataDir, "review-locks");
	mkdirSync(lockDir, { recursive: true });

	function lockPath(reviewId: string): string {
		return join(
			lockDir,
			`${createHash("sha256").update(reviewId).digest("hex")}.lock`,
		);
	}

	function processAlive(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code === "EPERM";
		}
	}

	function clearStaleLock(path: string, reviewId: string): void {
		let marker: string;
		try {
			marker = readFileSync(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		const owner = /^hobo:(\d+)-([0-9a-f-]+)\n$/u.exec(marker);
		const legacyOwner = /^(\d+)$/u.exec(marker);
		const pid = Number(owner?.[1] ?? legacyOwner?.[1]);
		if (!Number.isSafeInteger(pid) || processAlive(pid)) {
			throw new Error(`review ${reviewId} is busy`);
		}
		const ownerPath = owner
			? `${path}.hobo-${owner[1]}-${owner[2]}`
			: `${path}.hobo-${pid}-legacy`;
		const claimPrefix = `${basename(ownerPath)}.reclaim-`;
		let claimSource = ownerPath;
		const findClaims = (): string[] =>
			readdirSync(dirname(ownerPath)).filter((entry) =>
				entry.startsWith(claimPrefix),
			);
		if (legacyOwner && !existsSync(ownerPath) && findClaims().length === 0) {
			try {
				writeFileSync(ownerPath, marker, { flag: "wx", mode: 0o600 });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		}
		if (!existsSync(claimSource)) {
			const claims = findClaims();
			if (claims.length !== 1) throw new Error(`review ${reviewId} is busy`);
			claimSource = join(dirname(ownerPath), claims[0] ?? "");
			const claimant = /\.reclaim-(\d+)-/u.exec(claimSource);
			if (!claimant || processAlive(Number(claimant[1]))) {
				throw new Error(`review ${reviewId} is busy`);
			}
		}
		const claimPath = `${ownerPath}.reclaim-${process.pid}-${randomUUID()}`;
		try {
			renameSync(claimSource, claimPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(`review ${reviewId} is busy`);
			}
			throw error;
		}
		let released = false;
		try {
			if (readFileSync(path, "utf8") !== marker) {
				throw new Error(`review ${reviewId} is busy`);
			}
			unlinkSync(path);
			released = true;
		} finally {
			if (released) rmSync(claimPath, { force: true });
		}
	}

	async function locked<T>(
		reviewId: string,
		work: () => Promise<T>,
	): Promise<T> {
		const path = lockPath(reviewId);
		const ownerId = `${process.pid}-${randomUUID()}`;
		const marker = `hobo:${ownerId}\n`;
		const ownerPath = `${path}.hobo-${ownerId}`;
		writeFileSync(ownerPath, marker, { flag: "wx", mode: 0o600 });
		let acquired = false;
		const release = (): void => {
			try {
				if (readFileSync(path, "utf8") === marker) unlinkSync(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		};
		try {
			for (let attempt = 0; attempt < 2; attempt += 1) {
				try {
					linkSync(ownerPath, path);
					acquired = true;
					break;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					clearStaleLock(path, reviewId);
				}
			}
			if (!acquired) throw new Error(`could not acquire review ${reviewId}`);
			try {
				const result = await work();
				release();
				return result;
			} catch (error) {
				try {
					release();
				} catch (releaseError) {
					throw new AggregateError(
						[error, releaseError],
						`review ${reviewId} failed and its lock could not be released`,
					);
				}
				throw error;
			}
		} finally {
			rmSync(ownerPath, { force: true });
		}
	}

	async function fold(reviewId: string): Promise<ReviewAggregate> {
		let state = emptyReviewAggregate(reviewId);
		for await (const event of store.read(reviewStreamId(reviewId))) {
			const domain = parseReviewEvent(event);
			await assertReviewEventContent(domain, content);
			state = applyReviewEvent(state, domain);
		}
		return state;
	}

	const decideContext = (): ReviewDecideContext => ({
		now,
		id,
		content,
		hashText: hashReviewText,
		inlineLimit,
		...(options.diffSource ? { diffSource: options.diffSource } : {}),
		...(options.reanchor ? { reanchor: options.reanchor } : {}),
	});

	async function persist(
		reviewId: string,
		expectedSeq: number,
		actorId: string,
		events: readonly ReviewDomainEvent[],
		snapshot: ReviewSnapshot,
	): Promise<void> {
		const revision = Number(snapshot.revision);
		if (!Number.isSafeInteger(revision) || revision < 1) {
			throw new RangeError("review revision exceeds the SQLite sequence range");
		}
		try {
			await store.append(
				reviewStreamId(reviewId),
				events.map(reviewEventInput),
				{
					expectedSeq,
					actor: { kind: "user", id: actorId },
					tenant: "local",
					correlationId: reviewId,
				},
			);
		} catch (error) {
			if (error instanceof OptimisticSequenceConflictError) {
				throw reviewError(
					"stale-revision",
					`expected revision ${expectedSeq}, found ${error.actualSeq}`,
					{
						reviewId,
						expectedRevision: expectedSeq,
						actualRevision: error.actualSeq,
					},
				);
			}
			throw error;
		}
		await store.snapshot(
			reviewStreamId(reviewId),
			reviewSnapshotJson(snapshot),
			revision,
		);
	}

	async function loadUnlocked(reviewId: string): Promise<ReviewSnapshot> {
		const state = await fold(reviewId);
		if (!state.exists) {
			throw reviewError("not-found", `review ${reviewId} does not exist`, {
				reviewId,
			});
		}
		return state.snapshot;
	}

	return {
		async execute(
			command: ReviewCommandEnvelope,
		): Promise<ReviewCommandResult> {
			if (!command.reviewId) {
				throw reviewError("malformed-input", "reviewId must not be empty");
			}
			return enqueueReview(`${options.dataDir}:${command.reviewId}`, () =>
				locked(command.reviewId, async () => {
					const state = await fold(command.reviewId);
					const replayed = state.processed[command.commandId];
					if (replayed) {
						return {
							reviewId: command.reviewId,
							revision: replayed.revision,
							snapshot: cloneFrozen(replayed),
							replayed: true,
						};
					}
					if (state.snapshot.revision !== command.expectedRevision) {
						if (!state.exists && command.command.kind !== "start-review") {
							throw reviewError(
								"not-found",
								`review ${command.reviewId} does not exist`,
								{ reviewId: command.reviewId },
							);
						}
						throw reviewError(
							"stale-revision",
							`expected revision ${command.expectedRevision}, found ${state.snapshot.revision}`,
							{
								reviewId: command.reviewId,
								expectedRevision: command.expectedRevision.toString(),
								actualRevision: state.snapshot.revision.toString(),
							},
						);
					}
					const events = await decideReviewEvents(
						state,
						command,
						decideContext(),
					);
					if (events.length === 0) {
						return {
							reviewId: command.reviewId,
							revision: state.snapshot.revision,
							snapshot: cloneFrozen(state.snapshot),
							replayed: false,
						};
					}
					let next = state;
					for (const event of events) {
						await assertReviewEventContent(event, content);
						next = applyReviewEvent(next, event);
					}
					await persist(
						command.reviewId,
						Number(state.snapshot.revision),
						command.actorId,
						events,
						next.snapshot,
					);
					return {
						reviewId: command.reviewId,
						revision: next.snapshot.revision,
						snapshot: cloneFrozen(next.snapshot),
						replayed: false,
					};
				}),
			);
		},

		async load(reviewId: string): Promise<ReviewSnapshot> {
			return cloneFrozen(await loadUnlocked(reviewId));
		},

		async loadView(reviewId: string): Promise<ReviewView> {
			const state = await fold(reviewId);
			if (!state.exists) {
				throw reviewError("not-found", `review ${reviewId} does not exist`, {
					reviewId,
				});
			}
			const pendingId = state.snapshot.pendingReviewId;
			const pending =
				pendingId === undefined ? undefined : state.pending[pendingId];
			return {
				snapshot: cloneFrozen(state.snapshot),
				aggregate: state,
				...(pending === undefined ? {} : { pending }),
			};
		},

		async list(input) {
			const reviews = new Map<string, ReviewSnapshot>();
			for await (const positioned of store.readAll({
				filter: { type: "code.ReviewStarted" },
			})) {
				const domain = parseReviewEvent(positioned.event);
				const reviewId = domain.data.reviewId;
				if (reviews.has(reviewId)) continue;
				try {
					const snapshot = await loadUnlocked(reviewId);
					if (input?.sessionId && snapshot.sessionId !== input.sessionId) {
						continue;
					}
					reviews.set(reviewId, snapshot);
				} catch (error) {
					if (error instanceof Error && /does not exist/u.test(error.message)) {
						continue;
					}
					throw error;
				}
			}
			return [...reviews.values()]
				.map(cloneFrozen)
				.sort((left, right) => left.reviewId.localeCompare(right.reviewId));
		},

		close() {
			store.close();
		},
	};
}

function cloneFrozen(snapshot: ReviewSnapshot): ReviewSnapshot {
	return parseReviewSnapshot(reviewSnapshotJson(snapshot));
}
