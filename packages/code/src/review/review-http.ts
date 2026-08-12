import type { IncomingMessage, ServerResponse } from "node:http";

import type { LocalReviewControl } from "./local-review-control.js";
import { ReviewApprovalRequiredError } from "./review-approval.js";
import { parseReviewCommand } from "./review-contract.js";
import { ReviewError } from "./review-errors.js";
import { reviewSnapshotJson } from "./review-projections.js";
import type { ReviewCommandResult, ReviewSnapshot } from "./review-ports.js";

export interface ReviewHttpContext {
	readonly request: IncomingMessage;
	readonly response: ServerResponse;
	readonly url: URL;
	readonly reviews: LocalReviewControl;
}

function json(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer",
		"x-content-type-options": "nosniff",
	});
	response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > 1_048_576) {
			throw new ReviewError("body-limit", "review request body exceeds 1 MiB");
		}
		chunks.push(bytes);
	}
	const raw = Buffer.concat(chunks).toString("utf8") || "{}";
	try {
		return JSON.parse(raw);
	} catch {
		throw new ReviewError("malformed-input", "review request must be JSON");
	}
}

function commandResultJson(result: ReviewCommandResult): unknown {
	return {
		reviewId: result.reviewId,
		revision: result.revision.toString(),
		snapshot: reviewSnapshotJson(result.snapshot),
		replayed: result.replayed,
	};
}

function inboxItem(snapshot: ReviewSnapshot): Record<string, unknown> {
	return {
		itemId: `inbox:${snapshot.reviewId}`,
		reviewId: snapshot.reviewId,
		targetLabel:
			snapshot.target?.kind === "pull-request"
				? `${snapshot.target.repository}#${snapshot.target.number}`
				: (snapshot.target?.kind ?? "review"),
		manualDisposition: snapshot.inboxDisposition,
		derivedState: snapshot.closed ? "closed" : "needs-review",
		attentionReasons: snapshot.closed ? [] : ["unreviewed"],
		progress: {
			reviewedFiles: 0,
			totalFiles: 0,
			reviewedHunks: 0,
			totalHunks: 0,
			staleUnits: 0,
			excludedUnits: 0,
		},
		lastUpdatedAt: snapshot.updatedAt,
	};
}

function fail(response: ServerResponse, error: unknown): void {
	if (error instanceof ReviewApprovalRequiredError) {
		json(response, 409, {
			error: error.message,
			code: error.code,
			approval: error.effect,
			approvalDigest: error.effect.digest,
		});
		return;
	}
	if (error instanceof ReviewError) {
		json(response, error.code === "not-found" ? 404 : 400, {
			error: error.message,
			code: error.code,
			details: error.details,
		});
		return;
	}
	json(response, 400, {
		error: error instanceof Error ? error.message : String(error),
	});
}

export async function handleReviewHttp(
	context: ReviewHttpContext,
): Promise<boolean> {
	const { request, response, url, reviews } = context;
	if (!url.pathname.startsWith("/code/reviews")) return false;
	try {
		if (request.method === "GET" && url.pathname === "/code/reviews") {
			const sessionId = url.searchParams.get("sessionId") ?? undefined;
			const snapshots = await reviews.list(
				sessionId === undefined ? undefined : { sessionId },
			);
			json(response, 200, snapshots.map(reviewSnapshotJson));
			return true;
		}
		if (request.method === "GET" && url.pathname === "/code/reviews/inbox") {
			const snapshots = await reviews.list();
			json(response, 200, snapshots.map(inboxItem));
			return true;
		}
		if (request.method === "POST" && url.pathname === "/code/reviews/commands") {
			const body = (await readJson(request)) as {
				readonly command?: unknown;
			};
			const result = await reviews.execute(
				parseReviewCommand(body.command ?? body),
			);
			json(response, 200, commandResultJson(result));
			return true;
		}
		const viewMatch = /^\/code\/reviews\/([^/]+)\/view$/u.exec(url.pathname);
		if (request.method === "GET" && viewMatch) {
			const reviewId = decodeURIComponent(viewMatch[1] ?? "");
			const view = await reviews.loadView(reviewId);
			json(response, 200, {
				snapshot: reviewSnapshotJson(view.snapshot),
				threads: Object.values(view.aggregate.threads),
				messages: Object.values(view.aggregate.messages),
				coverage: Object.values(view.aggregate.coverage),
				generations: Object.values(view.aggregate.generations),
				routedAgents: view.aggregate.routedAgents,
				...(view.pending === undefined ? {} : { pending: view.pending }),
			});
			return true;
		}
		const one = /^\/code\/reviews\/([^/]+)$/u.exec(url.pathname);
		if (request.method === "GET" && one) {
			const reviewId = decodeURIComponent(one[1] ?? "");
			json(response, 200, reviewSnapshotJson(await reviews.load(reviewId)));
			return true;
		}
		json(response, 404, { error: "review route not found" });
		return true;
	} catch (error) {
		fail(response, error);
		return true;
	}
}
