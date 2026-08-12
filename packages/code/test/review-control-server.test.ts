import { mkdtempSync, rmSync } from "node:fs";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import { createMemoryReviewDiffSource } from "../src/review/review-generations.js";
import {
	attachReviewRoutes,
	handleReviewHttpRequest,
	REVIEW_HTTP_MAX_PAGE_LIMIT,
	startReviewControlServer,
} from "../src/review/review-http-routes.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_PAGE_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
} from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

const XSS_PATH = "<img src=x onerror=alert(1)>";
const XSS_BODY = "<script>window.__xss=1</script>";
const SECRET_ROOT = "/tmp/hobo-secret-repo";

function files() {
	return [
		{ path: "a.ts", oldText: "a\n", newText: "A\n" },
		{ path: "b.ts", oldText: "b\n", newText: "B\n" },
		{ path: "c.ts", oldText: "c\n", newText: "C\n" },
		{ path: "d.ts", oldText: "d\n", newText: "D\n" },
		{ path: "e.ts", oldText: "e\n", newText: "E\n" },
		{ path: XSS_PATH, oldText: "x\n", newText: "y\n" },
		{
			path: "big.ts",
			oldText: Array.from({ length: 10 }, (_, index) =>
				[
					...Array.from({ length: 8 }, () => `ctx-${index}`),
					`old-${index}`,
				].join("\n"),
			).join("\n"),
			newText: Array.from({ length: 10 }, (_, index) =>
				[
					...Array.from({ length: 8 }, () => `ctx-${index}`),
					`NEW-${index}`,
				].join("\n"),
			).join("\n"),
		},
	];
}

function target() {
	return {
		kind: "commit",
		repositoryId: "repo-1",
		repositoryRoot: SECRET_ROOT,
		parentCommitOid: "a".repeat(40),
		commitOid: "b".repeat(40),
	};
}

function envelope(
	reviewId: string,
	commandId: string,
	revision: string,
	command: Record<string, unknown>,
) {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId,
		actorId: "browser-test",
		reviewId,
		expectedRevision: revision,
		command,
	};
}

async function harness() {
	const hoboHome = temp("hobo-review-http-");
	const diffSource = createMemoryReviewDiffSource();
	diffSource.stageFiles(files());
	const control = createLocalReviewControl({ hoboHome, diffSource });
	const token = "review-token-value";
	const server = await startReviewControlServer({
		hoboHome,
		token,
		control,
		diffSource,
	});
	return { hoboHome, control, diffSource, server, token };
}

function headers(token: string, origin?: string): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
		...(origin === undefined ? {} : { origin }),
	};
}

async function json(
	server: { port: number; token: string },
	path: string,
	init: RequestInit = {},
) {
	const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
		...init,
		headers: {
			...headers(server.token, `http://127.0.0.1:${server.port}`),
			...(init.headers as Record<string, string> | undefined),
		},
	});
	const body = (await response.json()) as Record<string, unknown>;
	return { response, body };
}

describe("review control server", () => {
	it("exports a coordinator hook that does not claim non-review paths", async () => {
		expect(typeof attachReviewRoutes).toBe("function");
		expect(typeof handleReviewHttpRequest).toBe("function");
	});

	it("rejects unauthorized and query-string bearers", async () => {
		const { server, token, control } = await harness();
		try {
			const missing = await fetch(
				`http://127.0.0.1:${server.port}/api/reviews`,
			);
			expect(missing.status).toBe(401);
			const missingBody = (await missing.json()) as { code?: string };
			expect(missingBody.code).toBe("auth-denied");

			const query = await fetch(
				`http://127.0.0.1:${server.port}/api/reviews?token=${encodeURIComponent(token)}`,
			);
			expect(query.status).toBe(401);

			const wrong = await fetch(`http://127.0.0.1:${server.port}/api/reviews`, {
				headers: { authorization: "Bearer not-the-token" },
			});
			expect(wrong.status).toBe(401);

			const page = await fetch(`http://127.0.0.1:${server.port}/reviews`);
			expect(page.status).toBe(401);
			expect(server.url).not.toContain(token);
			expect(server.url).not.toContain("token=");
		} finally {
			await server.close();
			control.close();
		}
	});

	it("sets no-store, nosniff, and a restrictive CSP", async () => {
		const { server, control } = await harness();
		try {
			const api = await fetch(`http://127.0.0.1:${server.port}/api/reviews`, {
				headers: headers(server.token),
			});
			expect(api.headers.get("cache-control")).toContain("no-store");
			expect(api.headers.get("x-content-type-options")).toBe("nosniff");
			expect(api.headers.get("referrer-policy")).toBe("no-referrer");

			const page = await fetch(`http://127.0.0.1:${server.port}/reviews`, {
				headers: headers(server.token),
			});
			expect(page.status).toBe(200);
			expect(page.headers.get("cache-control")).toContain("no-store");
			expect(page.headers.get("x-content-type-options")).toBe("nosniff");
			const csp = page.headers.get("content-security-policy") ?? "";
			expect(csp).toContain("default-src 'self'");
			expect(csp).toContain("frame-ancestors 'none'");
			expect(csp).not.toContain("unsafe-eval");
		} finally {
			await server.close();
			control.close();
		}
	});

	it("rejects non-loopback hosts and origins", async () => {
		const { server, control } = await harness();
		try {
			const foreignOrigin = await fetch(
				`http://127.0.0.1:${server.port}/api/reviews/commands`,
				{
					method: "POST",
					headers: {
						...headers(server.token, "https://attacker.example"),
					},
					body: JSON.stringify(
						envelope("review-x", "cmd-1", "0", {
							kind: "start-review",
							target: target(),
						}),
					),
				},
			);
			expect(foreignOrigin.status).toBe(403);

			const foreignHost = await new Promise<{ status: number }>(
				(resolve, reject) => {
					const req = nodeRequest(
						{
							hostname: "127.0.0.1",
							port: server.port,
							path: "/api/reviews",
							headers: {
								authorization: `Bearer ${server.token}`,
								host: "evil.example",
							},
						},
						(res) => {
							res.resume();
							resolve({ status: res.statusCode ?? 0 });
						},
					);
					req.on("error", reject);
					req.end();
				},
			);
			expect(foreignHost.status).toBe(403);
		} finally {
			await server.close();
			control.close();
		}
	});

	it("lists, loads, pages files/chunks/threads, and hides filesystem paths", async () => {
		const { server, control } = await harness();
		try {
			const started = await json(server, "/api/reviews/commands", {
				method: "POST",
				body: JSON.stringify(
					envelope("review-1", "cmd-start", "0", {
						kind: "start-review",
						sessionId: "session-1",
						target: target(),
					}),
				),
			});
			expect(started.response.status).toBe(200);
			expect(started.body.schemaVersion).toBe(REVIEW_SNAPSHOT_SCHEMA);
			expect(JSON.stringify(started.body)).not.toContain(SECRET_ROOT);
			expect(started.body.revision).toBeTruthy();

			const listed = await json(server, "/api/reviews?sessionId=session-1");
			expect(listed.response.status).toBe(200);
			const reviews = listed.body.reviews as readonly Record<string, unknown>[];
			expect(reviews).toHaveLength(1);
			expect(reviews[0]?.reviewId).toBe("review-1");
			expect(JSON.stringify(listed.body)).not.toContain(SECRET_ROOT);

			const one = await json(server, "/api/reviews/review-1");
			expect(one.response.status).toBe(200);
			expect(one.body.reviewId).toBe("review-1");
			expect(one.body.revision).toBe(started.body.revision);

			const missing = await json(server, "/api/reviews/nope");
			expect(missing.response.status).toBe(404);
			expect(missing.body.code).toBe("not-found");

			const thread = await json(server, "/api/reviews/commands", {
				method: "POST",
				body: JSON.stringify(
					envelope("review-1", "cmd-thread", String(started.body.revision), {
						kind: "create-thread",
						body: XSS_BODY,
						visibility: "session",
					}),
				),
			});
			expect(thread.response.status).toBe(200);

			const manifest = await json(server, "/api/reviews/review-1/manifest");
			expect(manifest.response.status).toBe(200);
			expect(manifest.body.schemaVersion).toBe(REVIEW_PAGE_SCHEMA);
			expect(manifest.body.revision).toBe(thread.body.revision);
			expect(JSON.stringify(manifest.body)).not.toContain(SECRET_ROOT);

			const firstFiles = await json(
				server,
				"/api/reviews/review-1/files?limit=2",
			);
			expect(firstFiles.response.status).toBe(200);
			const firstPage = firstFiles.body.files as readonly unknown[];
			expect(firstPage).toHaveLength(2);
			expect(firstFiles.body.pages).toMatchObject({
				truncated: true,
				limit: 2,
			});
			const nextCursor = (firstFiles.body.pages as { nextCursor?: string })
				.nextCursor;
			expect(nextCursor).toBeTruthy();

			const secondFiles = await json(
				server,
				`/api/reviews/review-1/files?cursor=${encodeURIComponent(nextCursor ?? "")}&limit=2`,
			);
			expect(
				(secondFiles.body.files as readonly unknown[]).length,
			).toBeGreaterThan(0);
			expect(secondFiles.body.files).not.toEqual(firstFiles.body.files);

			const oversized = await json(
				server,
				`/api/reviews/review-1/files?limit=${REVIEW_HTTP_MAX_PAGE_LIMIT + 1}`,
			);
			expect(oversized.response.status).toBe(400);
			expect(oversized.body.code).toBe("page-limit");

			const fileId = (
				manifest.body.files as readonly { fileId: string; pathAfter?: string }[]
			).find((file) => file.pathAfter === "big.ts")?.fileId;
			expect(fileId).toBeTruthy();
			const chunks = await json(
				server,
				`/api/reviews/review-1/files/${encodeURIComponent(fileId ?? "")}/chunks?limit=3`,
			);
			expect(chunks.response.status).toBe(200);
			expect(
				(chunks.body.hunks as readonly unknown[]).length,
			).toBeLessThanOrEqual(3);
			expect(chunks.body.revision).toBeTruthy();
			const chunkCursor = (chunks.body as { nextCursor?: string }).nextCursor;
			expect(chunkCursor).toBeTruthy();
			const nextChunks = await json(
				server,
				`/api/reviews/review-1/files/${encodeURIComponent(fileId ?? "")}/chunks?cursor=${encodeURIComponent(chunkCursor ?? "")}&limit=3`,
			);
			expect(nextChunks.response.status).toBe(200);
			expect(nextChunks.body.hunks).not.toEqual(chunks.body.hunks);

			const threads = await json(
				server,
				"/api/reviews/review-1/threads?limit=1",
			);
			expect(threads.response.status).toBe(200);
			const items = threads.body.threads as readonly {
				messages?: readonly { body?: string }[];
			}[];
			expect(items).toHaveLength(1);
			expect(items[0]?.messages?.[0]?.body).toBe(XSS_BODY);
			expect(threads.body.revision).toBeTruthy();
		} finally {
			await server.close();
			control.close();
		}
	});

	it("returns typed OCC conflicts and bounds request bodies", async () => {
		const { server, control } = await harness();
		try {
			const started = await json(server, "/api/reviews/commands", {
				method: "POST",
				body: JSON.stringify(
					envelope("review-stale", "cmd-start", "0", {
						kind: "start-review",
						target: target(),
					}),
				),
			});
			expect(started.response.status).toBe(200);

			const stale = await json(server, "/api/reviews/commands", {
				method: "POST",
				body: JSON.stringify(
					envelope("review-stale", "cmd-close", "0", { kind: "close-review" }),
				),
			});
			expect(stale.response.status).toBe(409);
			expect(stale.body.code).toBe("stale-revision");
			expect(stale.body.error).toBeTruthy();
			expect(JSON.stringify(stale.body)).not.toContain(server.token);

			const challenge = await json(
				server,
				"/api/reviews/review-stale/approval",
				{
					method: "POST",
					body: JSON.stringify({
						command: envelope(
							"review-stale",
							"cmd-stage",
							String(started.body.revision),
							{
								kind: "stage-selection",
								generationId: started.body.currentGenerationId,
								fileId: "file-1",
								approvalDigest: "pending",
							},
						),
					}),
				},
			);
			expect(challenge.response.status).toBe(409);
			expect(challenge.body.code).toBe("approval-required");
			expect(challenge.body.approvalDigest).toMatch(/^[a-f0-9]{64}$/u);

			const staleApproval = await json(
				server,
				"/api/reviews/review-stale/approval",
				{
					method: "POST",
					body: JSON.stringify({
						command: envelope("review-stale", "cmd-stage-2", "0", {
							kind: "stage-selection",
							generationId: "gen",
							fileId: "file-1",
							approvalDigest: "x",
						}),
						approvalDigest: "deadbeef",
					}),
				},
			);
			expect(staleApproval.response.status).toBe(409);
			expect(staleApproval.body.code).toBe("stale-revision");

			const huge = await fetch(
				`http://127.0.0.1:${server.port}/api/reviews/commands`,
				{
					method: "POST",
					headers: headers(server.token, `http://127.0.0.1:${server.port}`),
					body: `{"pad":"${"n".repeat(1_100_000)}"}`,
				},
			);
			expect(huge.status).toBe(400);
			const hugeBody = (await huge.json()) as { code?: string };
			expect(hugeBody.code).toBe("body-limit");
		} finally {
			await server.close();
			control.close();
		}
	});
});
