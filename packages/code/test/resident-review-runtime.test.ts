import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import {
	createMemoryReviewContentStore,
	createResidentReviewRuntime,
	REVIEW_BODY_INLINE_LIMIT,
	reviewStreamId,
} from "../src/review/resident-review-runtime.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_PARTITION,
	type ReviewCommandEnvelope,
	type ReviewTarget,
} from "../src/review/review-ports.js";
import { createReviewRegistry } from "../src/review/review-registry.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-review-rt-"));
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

function ids(prefix = "id"): () => string {
	let n = 0;
	return () => `${prefix}-${++n}`;
}

function reviewLockPath(dataDir: string, reviewId: string): string {
	return join(
		dataDir,
		"review-locks",
		`${createHash("sha256").update(reviewId).digest("hex")}.lock`,
	);
}

async function collectTypes(
	dataDir: string,
	reviewId: string,
	partition = REVIEW_PARTITION,
): Promise<string[]> {
	const store = createRuntimeLocalEventStore({
		dataDir,
		partitionId: partition,
	});
	const types: string[] = [];
	for await (const event of store.read(reviewStreamId(reviewId))) {
		types.push(event.type);
	}
	store.close();
	return types;
}

describe("resident review runtime", () => {
	it("starts a review and records generation created/activated events", async () => {
		const dataDir = tempRoot();
		const runtime = createResidentReviewRuntime({
			dataDir,
			id: ids(),
			now: () => "2026-08-12T00:00:00.000Z",
		});
		const result = await runtime.execute(
			envelope("review-1", "cmd-start", 0n, {
				kind: "start-review",
				sessionId: "session-9",
				target: commitTarget(),
			}),
		);
		expect(result.replayed).toBe(false);
		expect(result.revision).toBe(3n);
		expect(result.snapshot.sessionId).toBe("session-9");
		expect(result.snapshot.currentGenerationId).toBe("id-1");
		expect(result.snapshot.closed).toBe(false);
		expect(await collectTypes(dataDir, "review-1")).toEqual([
			"code.ReviewStarted",
			"code.ReviewGenerationCreated",
			"code.ReviewGenerationActivated",
		]);
		runtime.close();
	});

	it("replays a duplicate commandId without appending", async () => {
		const dataDir = tempRoot();
		const runtime = createResidentReviewRuntime({ dataDir, id: ids() });
		const command = envelope("review-dup", "cmd-start", 0n, {
			kind: "start-review",
			target: commitTarget(),
		});
		const first = await runtime.execute(command);
		const second = await runtime.execute(command);
		expect(second.replayed).toBe(true);
		expect(second.revision).toBe(first.revision);
		expect(second.snapshot).toEqual(first.snapshot);
		expect(await collectTypes(dataDir, "review-dup")).toHaveLength(3);
		runtime.close();
	});

	it("rejects a stale expectedRevision with a typed error", async () => {
		const runtime = createResidentReviewRuntime({ dataDir: tempRoot() });
		await runtime.execute(
			envelope("review-stale", "cmd-start", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		await expect(
			runtime.execute(
				envelope("review-stale", "cmd-close", 0n, { kind: "close-review" }),
			),
		).rejects.toMatchObject({
			name: "ReviewError",
			code: "stale-revision",
		});
		await expect(
			runtime.execute(
				envelope("review-stale", "cmd-close", 0n, { kind: "close-review" }),
			),
		).rejects.toBeInstanceOf(ReviewError);
		runtime.close();
	});

	it("keeps review events off the session partition and out of session snapshots", async () => {
		const dataDir = tempRoot();
		const sessions = createRuntimeLocalEventStore({
			dataDir,
			partitionId: "hobo-code-sessions",
		});
		await sessions.append(
			"code-session:session-keep",
			[
				{
					type: "code.SessionCreated",
					data: { snapshot: { revision: "1", sessionId: "session-keep" } },
				},
			],
			{
				expectedSeq: 0,
				actor: { kind: "system", id: "test" },
				tenant: "local",
			},
		);
		const runtime = createResidentReviewRuntime({ dataDir });
		const started = await runtime.execute(
			envelope("review-keep", "cmd-start", 0n, {
				kind: "start-review",
				sessionId: "session-keep",
				target: commitTarget(),
			}),
		);
		await runtime.execute(
			envelope("review-keep", "cmd-close", started.revision, {
				kind: "close-review",
			}),
		);
		runtime.close();

		const sessionEvents = [];
		for await (const event of sessions.read("code-session:session-keep")) {
			sessionEvents.push(event);
		}
		expect(sessionEvents).toHaveLength(1);
		expect(JSON.stringify(sessionEvents[0]?.data)).not.toMatch(
			/ReviewStarted|threadIds|code-review:/u,
		);
		expect(sessions.getStreamHead("code-session:session-keep")?.revision).toBe(
			1,
		);
		sessions.close();
	});

	it("advances review revision independently of a session stream", async () => {
		const dataDir = tempRoot();
		const sessions = createRuntimeLocalEventStore({
			dataDir,
			partitionId: "hobo-code-sessions",
		});
		await sessions.append(
			"code-session:session-indep",
			[{ type: "code.SessionCreated", data: { revision: 1 } }],
			{
				expectedSeq: 0,
				actor: { kind: "system", id: "test" },
				tenant: "local",
			},
		);
		const runtime = createResidentReviewRuntime({ dataDir });
		const started = await runtime.execute(
			envelope("review-indep", "cmd-start", 0n, {
				kind: "start-review",
				sessionId: "session-indep",
				target: commitTarget(),
			}),
		);
		expect(started.revision).toBe(3n);
		expect(sessions.getStreamHead("code-session:session-indep")?.revision).toBe(
			1,
		);
		sessions.close();
		runtime.close();
	});

	it("persists compact snapshots and hashes large bodies", async () => {
		const dataDir = tempRoot();
		const content = createMemoryReviewContentStore();
		const runtime = createResidentReviewRuntime({
			dataDir,
			contentStore: content,
			id: ids(),
			inlineLimit: 16,
		});
		const started = await runtime.execute(
			envelope("review-body", "cmd-start", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const body = "x".repeat(REVIEW_BODY_INLINE_LIMIT);
		await runtime.execute(
			envelope("review-body", "cmd-thread", started.revision, {
				kind: "create-thread",
				body,
				visibility: "private",
			}),
		);
		const loaded = await runtime.load("review-body");
		expect(
			JSON.stringify(loaded, (_key, value) =>
				typeof value === "bigint" ? value.toString() : value,
			),
		).not.toMatch(/diff|patch|xxxxx/u);
		expect(Object.keys(loaded).join(",")).not.toMatch(/body|manifest|diff/u);

		const store = createRuntimeLocalEventStore({
			dataDir,
			partitionId: REVIEW_PARTITION,
		});
		const added = [];
		for await (const event of store.read(reviewStreamId("review-body"))) {
			if (event.type === "code.ReviewMessageAdded") added.push(event.data);
		}
		const payload = added[0] as {
			bodyInline?: string;
			message?: { bodyHash: string };
		};
		expect(payload.bodyInline).toBeUndefined();
		expect(payload.message?.bodyHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(await content.has(payload.message?.bodyHash ?? "")).toBe(true);
		const snapshot = await store.loadSnapshot(reviewStreamId("review-body"));
		expect(JSON.stringify(snapshot?.state)).not.toContain(body);
		store.close();
		runtime.close();
	});

	it("covers thread and message CRUD, pending publication, and inbox close", async () => {
		const runtime = createResidentReviewRuntime({
			dataDir: tempRoot(),
			id: ids(),
			now: () => "2026-08-12T00:00:00.000Z",
		});
		const started = await runtime.execute(
			envelope("review-crud", "c1", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const created = await runtime.execute(
			envelope("review-crud", "c2", started.revision, {
				kind: "create-thread",
				body: "first",
				visibility: "private",
			}),
		);
		const replied = await runtime.execute(
			envelope("review-crud", "c3", created.revision, {
				kind: "add-message",
				threadId: created.snapshot.threadIds[0] ?? "",
				body: "second",
			}),
		);
		const edited = await runtime.execute(
			envelope("review-crud", "c4", replied.revision, {
				kind: "edit-draft-message",
				messageId: "id-4",
				body: "second-edit",
			}),
		);
		const deleted = await runtime.execute(
			envelope("review-crud", "c5", edited.revision, {
				kind: "delete-draft-message",
				messageId: "id-4",
			}),
		);
		const resolved = await runtime.execute(
			envelope("review-crud", "c6", deleted.revision, {
				kind: "resolve-thread",
				threadId: created.snapshot.threadIds[0] ?? "",
			}),
		);
		const prepared = await runtime.execute(
			envelope("review-crud", "c7", resolved.revision, {
				kind: "prepare-submission",
				decision: "comment",
				summaryBody: "lgtm later",
				selectedMessageIds: ["id-3"],
				selectedThreadOperations: [
					{ kind: "resolve", threadId: created.snapshot.threadIds[0] ?? "" },
				],
			}),
		);
		expect(prepared.snapshot.pendingReviewId).toBe("id-5");
		const published = await runtime.execute(
			envelope("review-crud", "c8", prepared.revision, {
				kind: "publish-submission",
				pendingReviewId: "id-5",
				approvalDigest: "digest",
			}),
		);
		expect(published.snapshot.pendingReviewId).toBeUndefined();
		const closed = await runtime.execute(
			envelope("review-crud", "c9", published.revision, {
				kind: "close-review",
			}),
		);
		expect(closed.snapshot.closed).toBe(true);
		runtime.close();
	});

	it("rejects coverage against a stale generation", async () => {
		const runtime = createResidentReviewRuntime({
			dataDir: tempRoot(),
			id: ids(),
		});
		const started = await runtime.execute(
			envelope("review-gen", "c1", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const refreshed = await runtime.execute(
			envelope("review-gen", "c2", started.revision, {
				kind: "refresh-review",
			}),
		);
		await expect(
			runtime.execute(
				envelope("review-gen", "c3", refreshed.revision, {
					kind: "mark-coverage",
					generationId: started.snapshot.currentGenerationId ?? "",
					unit: { kind: "file", fileId: "a.ts", contentIdentity: "x" },
					state: "reviewed",
				}),
			),
		).rejects.toMatchObject({ code: "stale-generation" });
		runtime.close();
	});

	it("recovers a stale review lock left by a dead owner", async () => {
		const dataDir = tempRoot();
		const runtime = createResidentReviewRuntime({ dataDir });
		const created = await runtime.execute(
			envelope("review-lock", "c1", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const path = reviewLockPath(dataDir, "review-lock");
		const marker = "hobo:2147483647-deadbeef\n";
		writeFileSync(path, marker);
		writeFileSync(`${path}.hobo-2147483647-deadbeef`, marker);
		const closed = await runtime.execute(
			envelope("review-lock", "c2", created.revision, { kind: "close-review" }),
		);
		expect(closed.snapshot.closed).toBe(true);
		runtime.close();
	});

	it("recovers when a stale-lock claimant crashes during takeover", async () => {
		const dataDir = tempRoot();
		const runtime = createResidentReviewRuntime({ dataDir });
		const created = await runtime.execute(
			envelope("review-reclaim", "c1", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const path = reviewLockPath(dataDir, "review-reclaim");
		const deadOwnerId = "2147483647-deadbeef";
		const marker = `hobo:${deadOwnerId}\n`;
		writeFileSync(path, marker);
		writeFileSync(
			`${path}.hobo-${deadOwnerId}.reclaim-2147483646-cafebabe`,
			marker,
		);
		const closed = await runtime.execute(
			envelope("review-reclaim", "c2", created.revision, {
				kind: "close-review",
			}),
		);
		expect(closed.snapshot.closed).toBe(true);
		runtime.close();
	});

	it("fails closed when a lock owner is malformed", async () => {
		const dataDir = tempRoot();
		const runtime = createResidentReviewRuntime({ dataDir });
		const created = await runtime.execute(
			envelope("review-bad-lock", "c1", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const path = reviewLockPath(dataDir, "review-bad-lock");
		writeFileSync(path, "not-an-owner");
		await expect(
			runtime.execute(
				envelope("review-bad-lock", "c2", created.revision, {
					kind: "close-review",
				}),
			),
		).rejects.toThrow("busy");
		expect(readFileSync(path, "utf8")).toBe("not-an-owner");
		runtime.close();
	});

	it("loads through the local control parse boundary and registry", async () => {
		const hoboHome = tempRoot();
		const control = createLocalReviewControl({
			hoboHome,
			id: ids("ctl"),
			now: () => "2026-08-12T00:00:00.000Z",
		});
		const started = await control.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "parsed-start",
			actorId: "actor-1",
			reviewId: "review-control",
			expectedRevision: "0",
			command: { kind: "start-review", target: commitTarget() },
		});
		const registry = createReviewRegistry({ runtime: control.runtime });
		expect((await registry.load("review-control")).revision).toBe(
			started.revision,
		);
		expect(await registry.list()).toHaveLength(1);
		control.close();
	});
});
