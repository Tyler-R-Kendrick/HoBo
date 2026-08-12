import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";
import {
	createMemoryReviewContentStore,
	createResidentReviewRuntime,
	hashReviewText,
	reviewStreamId,
} from "../src/review/resident-review-runtime.js";
import {
	applyReviewEvent,
	emptyReviewAggregate,
} from "../src/review/review-aggregate.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	parseReviewEvent,
	REVIEW_EVENT_STARTED,
} from "../src/review/review-events.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_PARTITION,
	type ReviewCommandEnvelope,
	type ReviewTarget,
} from "../src/review/review-ports.js";
import {
	projectReviewEvents,
	reviewSnapshotJson,
} from "../src/review/review-projections.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-review-replay-"));
	roots.push(root);
	return root;
}

function commitTarget(): ReviewTarget {
	return {
		kind: "commit",
		repositoryId: "repo-1",
		repositoryRoot: "/tmp/repo",
		parentCommitOid: "a".repeat(40),
		commitOid: "b".repeat(40),
	};
}

function envelope(
	reviewId: string,
	commandId: string,
	expectedRevision: bigint,
	command: ReviewCommandEnvelope["command"],
): ReviewCommandEnvelope {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId,
		actorId: "actor-1",
		reviewId,
		expectedRevision,
		command,
	};
}

function ids(): () => string {
	let n = 0;
	return () => `id-${++n}`;
}

describe("review replay", () => {
	it("folds persisted events into the same snapshot load returns", async () => {
		const dataDir = tempRoot();
		const content = createMemoryReviewContentStore();
		const runtime = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
			id: ids(),
			now: () => "2026-08-12T00:00:00.000Z",
		});
		const started = await runtime.execute(
			envelope("review-replay", "cmd-start", 0n, {
				kind: "start-review",
				sessionId: "session-1",
				target: commitTarget(),
			}),
		);
		const threaded = await runtime.execute(
			envelope("review-replay", "cmd-thread", started.revision, {
				kind: "create-thread",
				body: "please look at this",
				visibility: "session",
			}),
		);
		const covered = await runtime.execute(
			envelope("review-replay", "cmd-cover", threaded.revision, {
				kind: "mark-coverage",
				generationId: threaded.snapshot.currentGenerationId ?? "",
				unit: {
					kind: "file",
					fileId: "src/a.ts",
					contentIdentity: "blob-1",
				},
				state: "reviewed",
			}),
		);
		const inbox = await runtime.execute(
			envelope("review-replay", "cmd-inbox", covered.revision, {
				kind: "set-inbox-disposition",
				disposition: "deferred",
			}),
		);
		await runtime.execute(
			envelope("review-replay", "cmd-close", inbox.revision, {
				kind: "close-review",
			}),
		);
		runtime.close();

		const store = createRuntimeLocalEventStore({
			dataDir,
			partitionId: REVIEW_PARTITION,
		});
		const events = [];
		for await (const event of store.read(reviewStreamId("review-replay"))) {
			events.push(parseReviewEvent(event));
		}
		store.close();

		let folded = emptyReviewAggregate("review-replay");
		for (const event of events) folded = applyReviewEvent(folded, event);
		const projected = projectReviewEvents("review-replay", events);
		const reopened = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
		});
		const loaded = await reopened.load("review-replay");
		reopened.close();

		expect(reviewSnapshotJson(folded.snapshot)).toEqual(
			reviewSnapshotJson(loaded),
		);
		expect(reviewSnapshotJson(projected)).toEqual(reviewSnapshotJson(loaded));
		expect(loaded.closed).toBe(true);
		expect(loaded.inboxDisposition).toBe("deferred");
		expect(loaded.threadIds).toHaveLength(1);
		expect(loaded.coverageIds).toHaveLength(1);
	});

	it("replays an event written after the last SQLite snapshot", async () => {
		const dataDir = tempRoot();
		const content = createMemoryReviewContentStore();
		const runtime = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
			now: () => "2026-08-12T00:00:00.000Z",
			id: ids(),
		});
		await runtime.execute(
			envelope("review-tail", "cmd-start", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		runtime.close();

		const store = createRuntimeLocalEventStore({
			dataDir,
			partitionId: REVIEW_PARTITION,
		});
		await store.append(
			reviewStreamId("review-tail"),
			[
				{
					type: "code.ReviewInboxDispositionSet",
					data: {
						commandId: "cmd-tail",
						actorId: "actor-1",
						reviewId: "review-tail",
						at: "2026-08-12T01:00:00.000Z",
						disposition: "ignored",
					},
				},
			],
			{
				expectedSeq: 3,
				actor: { kind: "system", id: "test" },
				tenant: "local",
			},
		);
		store.close();

		const reopened = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
		});
		const loaded = await reopened.load("review-tail");
		expect(loaded.revision).toBe(4n);
		expect(loaded.inboxDisposition).toBe("ignored");
		reopened.close();
	});

	it("throws a typed corrupted-state error when a content hash does not match", async () => {
		const dataDir = tempRoot();
		const content = createMemoryReviewContentStore();
		const runtime = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
			id: ids(),
			now: () => "2026-08-12T00:00:00.000Z",
			inlineLimit: 8,
		});
		const started = await runtime.execute(
			envelope("review-corrupt", "cmd-start", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		await runtime.execute(
			envelope("review-corrupt", "cmd-thread", started.revision, {
				kind: "create-thread",
				body: "this body is large enough to live only as a hash",
				visibility: "private",
			}),
		);
		runtime.close();

		const hash = hashReviewText(
			"this body is large enough to live only as a hash",
		);
		content.blobs.set(hash, new TextEncoder().encode("tampered-bytes"));

		const reopened = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
			inlineLimit: 8,
		});
		await expect(reopened.load("review-corrupt")).rejects.toMatchObject({
			name: "ReviewError",
			code: "corrupted-state",
		});
		await expect(reopened.load("review-corrupt")).rejects.toBeInstanceOf(
			ReviewError,
		);
		reopened.close();
	});

	it("starts from the ReviewStarted event without embedding a snapshot payload", () => {
		const event = parseReviewEvent({
			type: REVIEW_EVENT_STARTED,
			data: {
				commandId: "c",
				actorId: "a",
				reviewId: "r",
				at: "2026-08-12T00:00:00.000Z",
				target: commitTarget(),
			},
		});
		expect(event.type).toBe(REVIEW_EVENT_STARTED);
		expect("snapshot" in event.data).toBe(false);
	});
});
