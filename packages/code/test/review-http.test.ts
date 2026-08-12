import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import { handleReviewHttp } from "../src/review/review-http.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-http-"));
	roots.push(root);
	return root;
}

async function listen(hoboHome: string): Promise<{
	url: string;
	close: () => Promise<void>;
}> {
	const reviews = createLocalReviewControl({ hoboHome });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (!(await handleReviewHttp({ request, response, url, reviews }))) {
			response.writeHead(404).end(JSON.stringify({ error: "not found" }));
		}
	});
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("review http test server has no port");
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise((resolve, reject) => {
				reviews.close();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
}

describe("review http", () => {
	it("starts, lists, and loads a durable review through the browser routes", async () => {
		const server = await listen(tempRoot());
		const command = {
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "http-start",
			actorId: "browser-1",
			reviewId: "review-http-1",
			expectedRevision: "0",
			command: {
				kind: "start-review",
				sessionId: "session-1",
				target: {
					kind: "commit",
					repositoryId: "repo-1",
					repositoryRoot: "/tmp/repo",
					parentCommitOid: "a".repeat(40),
					commitOid: "b".repeat(40),
				},
			},
		};
		const created = await fetch(`${server.url}/code/reviews/commands`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ command }),
		});
		expect(created.status).toBe(200);
		const body = (await created.json()) as {
			reviewId: string;
			revision: string;
			replayed: boolean;
		};
		expect(body.reviewId).toBe("review-http-1");
		expect(body.replayed).toBe(false);
		expect(Number(body.revision)).toBeGreaterThan(0);

		const listed = await fetch(`${server.url}/code/reviews`);
		const reviews = (await listed.json()) as { reviewId: string }[];
		expect(reviews.map((item) => item.reviewId)).toContain("review-http-1");

		const inbox = await fetch(`${server.url}/code/reviews/inbox`);
		const items = (await inbox.json()) as { reviewId: string }[];
		expect(items.map((item) => item.reviewId)).toContain("review-http-1");

		const loaded = await fetch(`${server.url}/code/reviews/review-http-1`);
		expect(loaded.status).toBe(200);
		const snapshot = (await loaded.json()) as { reviewId: string };
		expect(snapshot.reviewId).toBe("review-http-1");

		const view = await fetch(`${server.url}/code/reviews/review-http-1/view`);
		expect(view.status).toBe(200);
		const detail = (await view.json()) as {
			snapshot: { reviewId: string };
			threads: unknown[];
		};
		expect(detail.snapshot.reviewId).toBe("review-http-1");
		expect(Array.isArray(detail.threads)).toBe(true);

		const missing = await fetch(`${server.url}/code/reviews/missing`);
		expect(missing.status).toBe(404);

		const malformed = await fetch(`${server.url}/code/reviews/commands`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{",
		});
		expect(malformed.status).toBe(400);
		await server.close();
	});
});
