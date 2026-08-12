import { timingSafeEqual } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { isAbsolute, join } from "node:path";

import { createRuntimeLocalEventStore } from "@hobo/runtime-local";

import {
	type LocalReviewControl,
	reviewControlDataDir,
} from "./local-review-control.js";
import {
	createFileReviewContentStore,
	reviewStreamId,
} from "./resident-review-runtime.js";
import { applyReviewEvent, emptyReviewAggregate } from "./review-aggregate.js";
import {
	buildReviewExactEffect,
	ReviewApprovalRequiredError,
} from "./review-approval.js";
import {
	REVIEW_BROWSER_CSP,
	reviewBrowserHtml,
} from "./review-browser-assets.js";
import { parseReviewCommand } from "./review-contract.js";
import { decodeReviewCursor, encodeReviewCursor } from "./review-cursors.js";
import { ReviewError, reviewError } from "./review-errors.js";
import {
	parseReviewEvent,
	REVIEW_EVENT_MESSAGE_ADDED,
	REVIEW_EVENT_MESSAGE_EDITED,
} from "./review-events.js";
import type { ReviewOrchestrator } from "./review-orchestrator.js";
import {
	REVIEW_PAGE_SCHEMA,
	REVIEW_PARTITION,
	type ReviewCommand,
	type ReviewCommandEnvelope,
	type ReviewContentStore,
	type ReviewDiffChunk,
	type ReviewDiffManifest,
	type ReviewDiffSource,
	type ReviewExactEffectOperation,
	type ReviewFileSummary,
	type ReviewSnapshot,
	type ReviewTarget,
} from "./review-ports.js";
import { reviewSnapshotJson } from "./review-projections.js";

export const REVIEW_HTTP_DEFAULT_PAGE_LIMIT = 50;
export const REVIEW_HTTP_MAX_PAGE_LIMIT = 200;
export const REVIEW_HTTP_DEFAULT_CHUNK_LIMIT = 32;
export const REVIEW_HTTP_MAX_CHUNK_LIMIT = 64;
export const REVIEW_HTTP_DEFAULT_THREAD_LIMIT = 50;
export const REVIEW_HTTP_MAX_BODY_BYTES = 1_048_576;

const FILESYSTEM_KEYS = new Set(["repositoryRoot"]);

export interface ReviewHttpRoutesOptions {
	readonly token: string;
	readonly control: LocalReviewControl;
	readonly hoboHome: string;
	readonly diffSource?: ReviewDiffSource;
	readonly contentStore?: ReviewContentStore;
	readonly orchestrator?: ReviewOrchestrator;
	readonly cursorSecret?: string;
	readonly maxBodyBytes?: number;
	readonly pageLimit?: number;
	readonly chunkPageLimit?: number;
	readonly threadPageLimit?: number;
}

export interface ReviewControlServer {
	readonly port: number;
	readonly token: string;
	readonly url: string;
	close(): Promise<void>;
}

function authorized(request: IncomingMessage, token: string): boolean {
	const actual = request.headers.authorization?.replace(/^Bearer /u, "") ?? "";
	const left = Buffer.from(actual);
	const right = Buffer.from(token);
	return left.length === right.length && timingSafeEqual(left, right);
}

function hostnameOf(hostHeader: string): string {
	const bracket = /^\[([^\]]+)\](?::\d+)?$/u.exec(hostHeader);
	if (bracket?.[1]) return bracket[1].toLowerCase();
	return hostHeader.replace(/:\d+$/u, "").toLowerCase();
}

function isLoopbackHost(hostHeader: string): boolean {
	const hostname = hostnameOf(hostHeader);
	return (
		hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
	);
}

function isLoopbackOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return url.protocol === "http:" && isLoopbackHost(url.host);
	} catch {
		return false;
	}
}

function writeJson(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer",
		"x-content-type-options": "nosniff",
	});
	response.end(
		JSON.stringify(publicJson(body), (_key, value) =>
			typeof value === "bigint" ? value.toString() : value,
		),
	);
}

function isAbsoluteFs(value: string): boolean {
	return isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value);
}

function publicJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(publicJson);
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (FILESYSTEM_KEYS.has(key)) continue;
			if (
				(key === "pathBefore" || key === "pathAfter" || key === "path") &&
				typeof item === "string" &&
				isAbsoluteFs(item)
			) {
				const parts = item.split(/[/\\]/u);
				out[key] = parts[parts.length - 1] ?? item;
				continue;
			}
			out[key] = publicJson(item);
		}
		return out;
	}
	return value;
}

function statusFor(error: ReviewError): number {
	if (error.code === "auth-denied") {
		if (error.details.reason === "host" || error.details.reason === "origin") {
			return 403;
		}
		return 401;
	}
	if (error.code === "not-found") return 404;
	if (
		error.code === "stale-revision" ||
		error.code === "stale-generation" ||
		error.code === "approval-required" ||
		error.code === "approval-mismatch" ||
		error.code === "provider-drift" ||
		error.code === "patch-conflict" ||
		error.code === "ambiguous-outcome"
	) {
		return 409;
	}
	return 400;
}

function writeError(response: ServerResponse, error: unknown): void {
	if (error instanceof ReviewApprovalRequiredError) {
		writeJson(response, 409, {
			error: error.message,
			code: error.code,
			details: error.details,
			approval: error.effect,
			approvalDigest: error.effect.digest,
		});
		return;
	}
	if (error instanceof ReviewError) {
		writeJson(response, statusFor(error), {
			error: error.message,
			code: error.code,
			details: error.details,
		});
		return;
	}
	writeJson(response, 400, {
		error: error instanceof Error ? error.message : String(error),
		code: "malformed-input",
	});
}

async function requestBytes(
	request: IncomingMessage,
	maximum: number,
): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > maximum) {
			throw reviewError("body-limit", "request body exceeds capture limit", {
				limit: maximum,
			});
		}
		chunks.push(bytes);
	}
	return Buffer.concat(chunks);
}

async function requestBody(
	request: IncomingMessage,
	maximum: number,
): Promise<unknown> {
	const raw = (await requestBytes(request, maximum)).toString("utf8") || "{}";
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		throw reviewError("malformed-input", "request body is not valid JSON");
	}
}

function pageLimit(
	raw: string | null,
	fallback: number,
	maximum: number,
): number {
	if (raw === null || raw === "") return fallback;
	const value = Number.parseInt(raw, 10);
	if (!Number.isInteger(value) || value < 1) {
		throw reviewError("malformed-input", "limit must be a positive integer");
	}
	if (value > maximum) {
		throw reviewError("page-limit", "requested page is larger than the limit", {
			limit: maximum,
			requested: value,
		});
	}
	return value;
}

function snapshotJson(snapshot: ReviewSnapshot): Record<string, unknown> {
	return publicJson(reviewSnapshotJson(snapshot)) as Record<string, unknown>;
}

function publicTarget(
	target: ReviewTarget | undefined,
): ReviewTarget | undefined {
	if (!target) return undefined;
	if (
		target.kind === "working-tree" ||
		target.kind === "index" ||
		target.kind === "commit" ||
		target.kind === "range"
	) {
		const { repositoryRoot: _root, ...rest } = target;
		return rest as ReviewTarget;
	}
	return target;
}

function effectOperation(
	kind: ReviewCommand["kind"],
): ReviewExactEffectOperation {
	if (kind === "publish-submission") return "publish-review";
	if (kind === "apply-suggestion") return "apply-review-suggestion";
	if (kind === "unstage-selection") return "unstage-review-selection";
	return "stage-review-selection";
}

function needsExactEffect(kind: ReviewCommand["kind"]): boolean {
	return (
		kind === "publish-submission" ||
		kind === "apply-suggestion" ||
		kind === "stage-selection" ||
		kind === "unstage-selection"
	);
}

function commandFrom(body: unknown): ReviewCommandEnvelope {
	if (body !== null && typeof body === "object" && "command" in body) {
		const wrapper = body as { command?: unknown };
		if (
			wrapper.command !== null &&
			typeof wrapper.command === "object" &&
			"schemaVersion" in (wrapper.command as object)
		) {
			return parseReviewCommand(wrapper.command);
		}
	}
	return parseReviewCommand(body);
}

async function loadAggregate(
	dataDir: string,
	reviewId: string,
	content: ReviewContentStore,
): Promise<{
	snapshot: ReviewSnapshot;
	threads: readonly Record<string, unknown>[];
}> {
	const store = createRuntimeLocalEventStore({
		dataDir,
		partitionId: REVIEW_PARTITION,
	});
	try {
		let state = emptyReviewAggregate(reviewId);
		const bodies = new Map<string, string>();
		for await (const event of store.read(reviewStreamId(reviewId))) {
			const domain = parseReviewEvent(event);
			if (
				domain.type === REVIEW_EVENT_MESSAGE_ADDED &&
				domain.data.bodyInline !== undefined
			) {
				bodies.set(domain.data.message.messageId, domain.data.bodyInline);
			}
			if (
				domain.type === REVIEW_EVENT_MESSAGE_EDITED &&
				domain.data.bodyInline !== undefined
			) {
				bodies.set(domain.data.messageId, domain.data.bodyInline);
			}
			state = applyReviewEvent(state, domain);
		}
		if (!state.exists) {
			throw reviewError("not-found", `review ${reviewId} does not exist`, {
				reviewId,
			});
		}
		const threads = await Promise.all(
			Object.values(state.threads)
				.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
				.map(async (thread) => ({
					...thread,
					messages: await Promise.all(
						thread.messageIds.map(async (messageId) => {
							const message = state.messages[messageId];
							if (!message) return { messageId, body: "" };
							let body = bodies.get(messageId);
							if (body === undefined) {
								try {
									body = new TextDecoder().decode(
										await content.get(message.bodyHash),
									);
								} catch {
									body = "";
								}
							}
							return { ...message, body };
						}),
					),
				})),
		);
		return { snapshot: state.snapshot, threads };
	} finally {
		store.close();
	}
}

function pageItems<T>(
	items: readonly T[],
	cursor: string | undefined,
	secret: string,
	generationId: string,
	limit: number,
): {
	readonly items: readonly T[];
	readonly pages: {
		readonly cursor: string;
		readonly nextCursor?: string;
		readonly limit: number;
		readonly truncated: boolean;
	};
} {
	const offset =
		cursor === undefined
			? 0
			: decodeReviewCursor(cursor, {
					secret,
					generationId,
					kind: "manifest",
				}).offset;
	const page = items.slice(offset, offset + limit);
	const nextOffset = offset + page.length;
	const truncated = nextOffset < items.length;
	return {
		items: page,
		pages: {
			cursor: encodeReviewCursor(
				{ kind: "manifest", generationId, offset },
				secret,
			),
			limit,
			truncated,
			...(truncated
				? {
						nextCursor: encodeReviewCursor(
							{ kind: "manifest", generationId, offset: nextOffset },
							secret,
						),
					}
				: {}),
		},
	};
}

function pageHunks(
	chunk: ReviewDiffChunk,
	cursor: string | undefined,
	secret: string,
	limit: number,
): ReviewDiffChunk & { readonly nextCursor?: string } {
	const generationId = `chunk:${chunk.generationId}:${chunk.fileId}`;
	const offset =
		cursor === undefined
			? 0
			: decodeReviewCursor(cursor, {
					secret,
					generationId,
					kind: "chunk",
					fileId: chunk.fileId,
				}).offset;
	const hunks = chunk.hunks.slice(offset, offset + limit);
	const nextOffset = offset + hunks.length;
	return {
		...chunk,
		chunkId: `${chunk.fileId}:${offset}`,
		hunks,
		...(nextOffset < chunk.hunks.length
			? {
					nextCursor: encodeReviewCursor(
						{
							kind: "chunk",
							generationId,
							offset: nextOffset,
							fileId: chunk.fileId,
						},
						secret,
					),
				}
			: {}),
	};
}

async function loadManifestPage(
	options: ReviewHttpRoutesOptions,
	snapshot: ReviewSnapshot,
	cursor: string | undefined,
	limit: number,
): Promise<ReviewDiffManifest> {
	const generationId = snapshot.currentGenerationId;
	if (!generationId || !options.diffSource) {
		throw reviewError("not-found", "review generation is not available", {
			reviewId: snapshot.reviewId,
		});
	}
	const sourceCursor = cursor;
	let fromSource: ReviewDiffManifest;
	try {
		fromSource = await options.diffSource.loadManifest(
			generationId,
			sourceCursor,
		);
	} catch (error) {
		if (cursor && error instanceof ReviewError) {
			fromSource = await options.diffSource.loadManifest(generationId);
		} else {
			throw error;
		}
	}
	if (fromSource.pages.cursor || fromSource.pages.nextCursor) {
		if (!cursor) return fromSource;
		if (fromSource.pages.cursor === cursor || fromSource.files.length) {
			return fromSource;
		}
	}
	const paged = pageItems(
		fromSource.files,
		cursor,
		options.cursorSecret ?? options.token,
		generationId,
		limit,
	);
	return {
		generationId: fromSource.generationId,
		manifestHash: fromSource.manifestHash,
		files: paged.items as readonly ReviewFileSummary[],
		totalFiles: fromSource.totalFiles,
		totalAdditions: fromSource.totalAdditions,
		totalDeletions: fromSource.totalDeletions,
		binaryFiles: fromSource.binaryFiles,
		pages: paged.pages,
	};
}

async function loadChunkPage(
	options: ReviewHttpRoutesOptions,
	snapshot: ReviewSnapshot,
	fileId: string,
	cursor: string | undefined,
	limit: number,
): Promise<ReviewDiffChunk> {
	const generationId = snapshot.currentGenerationId;
	if (!generationId || !options.diffSource) {
		throw reviewError("not-found", "review generation is not available", {
			reviewId: snapshot.reviewId,
		});
	}
	let fromSource: ReviewDiffChunk;
	try {
		fromSource = await options.diffSource.loadChunk(
			generationId,
			fileId,
			cursor,
		);
	} catch (error) {
		if (cursor && error instanceof ReviewError) {
			fromSource = await options.diffSource.loadChunk(generationId, fileId);
		} else {
			throw error;
		}
	}
	if (fromSource.nextCursor && cursor === undefined) return fromSource;
	if (fromSource.nextCursor && fromSource.hunks.length) return fromSource;
	return pageHunks(
		fromSource,
		cursor,
		options.cursorSecret ?? options.token,
		limit,
	);
}

function guardRequest(
	request: IncomingMessage,
	url: URL,
	token: string,
	mutating: boolean,
): void {
	if (url.searchParams.has("token")) {
		throw reviewError("auth-denied", "review token must not appear in the URL");
	}
	const host = request.headers.host ?? "";
	if (!host || !isLoopbackHost(host)) {
		throw reviewError("auth-denied", "review control is loopback-only", {
			reason: "host",
		});
	}
	const origin = request.headers.origin;
	if (origin && !isLoopbackOrigin(origin)) {
		throw reviewError("auth-denied", "review origin is not loopback", {
			reason: "origin",
		});
	}
	if (mutating && origin && !isLoopbackOrigin(origin)) {
		throw reviewError("auth-denied", "review origin is not loopback", {
			reason: "origin",
		});
	}
	if (!authorized(request, token)) {
		throw reviewError("auth-denied", "invalid review control token");
	}
}

function isReviewPath(pathname: string): boolean {
	return (
		pathname === "/reviews" ||
		pathname === "/reviews/" ||
		pathname.startsWith("/api/reviews")
	);
}

export async function handleReviewHttpRequest(
	request: IncomingMessage,
	response: ServerResponse,
	options: ReviewHttpRoutesOptions,
): Promise<boolean> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (!isReviewPath(url.pathname)) return false;
	const maxBody = options.maxBodyBytes ?? REVIEW_HTTP_MAX_BODY_BYTES;
	const pageMax = options.pageLimit ?? REVIEW_HTTP_MAX_PAGE_LIMIT;
	const chunkMax = options.chunkPageLimit ?? REVIEW_HTTP_MAX_CHUNK_LIMIT;
	const threadMax = options.threadPageLimit ?? REVIEW_HTTP_MAX_PAGE_LIMIT;
	const secret = options.cursorSecret ?? options.token;
	const content =
		options.contentStore ??
		createFileReviewContentStore(
			join(reviewControlDataDir(options.hoboHome), "review-blobs"),
		);
	const mutating = request.method === "POST" || request.method === "PUT";
	try {
		guardRequest(request, url, options.token, mutating);
		if (
			request.method === "GET" &&
			(url.pathname === "/reviews" || url.pathname === "/reviews/")
		) {
			const sessionId = url.searchParams.get("sessionId") ?? undefined;
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-security-policy": REVIEW_BROWSER_CSP,
				"content-type": "text/html; charset=utf-8",
				"referrer-policy": "no-referrer",
				"x-content-type-options": "nosniff",
				"x-frame-options": "DENY",
			});
			response.end(
				reviewBrowserHtml({
					token: options.token,
					...(sessionId === undefined ? {} : { sessionId }),
				}),
			);
			return true;
		}
		if (request.method === "GET" && url.pathname === "/api/reviews") {
			const sessionId = url.searchParams.get("sessionId") ?? undefined;
			const reviews = await options.control.list(
				sessionId === undefined ? undefined : { sessionId },
			);
			writeJson(response, 200, {
				schemaVersion: REVIEW_PAGE_SCHEMA,
				reviews: reviews.map((snapshot) => ({
					...snapshotJson(snapshot),
					target: publicTarget(snapshot.target),
				})),
			});
			return true;
		}
		if (request.method === "POST" && url.pathname === "/api/reviews/commands") {
			const snapshot = await options.control.execute(
				commandFrom(await requestBody(request, maxBody)),
			);
			writeJson(response, 200, {
				...snapshotJson(snapshot.snapshot),
				replayed: snapshot.replayed,
			});
			return true;
		}
		const approval = /^\/api\/reviews\/([^/]+)\/approval$/u.exec(url.pathname);
		if (request.method === "POST" && approval) {
			const reviewId = decodeURIComponent(approval[1] ?? "");
			const body = (await requestBody(request, maxBody)) as {
				readonly command?: unknown;
				readonly approvalDigest?: unknown;
			};
			const command = commandFrom(body);
			if (command.reviewId !== reviewId) {
				throw reviewError(
					"malformed-input",
					"approval reviewId does not match the path",
				);
			}
			const snapshot = await options.control.load(reviewId);
			if (snapshot.revision !== command.expectedRevision) {
				throw reviewError(
					"stale-revision",
					`expected revision ${command.expectedRevision}, found ${snapshot.revision}`,
					{
						reviewId,
						expectedRevision: command.expectedRevision.toString(),
						actualRevision: snapshot.revision.toString(),
					},
				);
			}
			const digest =
				typeof body.approvalDigest === "string"
					? body.approvalDigest
					: undefined;
			if (!needsExactEffect(command.command.kind)) {
				throw reviewError(
					"malformed-input",
					`${command.command.kind} is not an approval mutation`,
				);
			}
			const effect = buildReviewExactEffect({
				operation: effectOperation(command.command.kind),
				command,
				snapshot,
			});
			if (!digest) {
				throw new ReviewApprovalRequiredError(effect);
			}
			if (digest !== effect.digest) {
				throw reviewError(
					"approval-mismatch",
					"review approval digest does not match the current effect",
					{
						approvedDigest: digest,
						currentDigest: effect.digest,
					},
				);
			}
			if (!options.orchestrator) {
				throw reviewError(
					"unsupported-capability",
					"review approval execution requires an orchestrator",
				);
			}
			const result = await options.orchestrator.execute({
				operation: effect.operation,
				command,
				approvalDigest: digest,
			});
			writeJson(response, 200, {
				...snapshotJson(result.snapshot),
				approvalDigest: result.effect.digest,
			});
			return true;
		}
		const chunks = /^\/api\/reviews\/([^/]+)\/files\/([^/]+)\/chunks$/u.exec(
			url.pathname,
		);
		if (request.method === "GET" && chunks) {
			const reviewId = decodeURIComponent(chunks[1] ?? "");
			const fileId = decodeURIComponent(chunks[2] ?? "");
			const snapshot = await options.control.load(reviewId);
			const limit = pageLimit(
				url.searchParams.get("limit"),
				REVIEW_HTTP_DEFAULT_CHUNK_LIMIT,
				chunkMax,
			);
			const page = await loadChunkPage(
				options,
				snapshot,
				fileId,
				url.searchParams.get("cursor") ?? undefined,
				limit,
			);
			writeJson(response, 200, {
				schemaVersion: REVIEW_PAGE_SCHEMA,
				revision: snapshot.revision.toString(),
				...page,
			});
			return true;
		}
		const files = /^\/api\/reviews\/([^/]+)\/files$/u.exec(url.pathname);
		if (request.method === "GET" && files) {
			const reviewId = decodeURIComponent(files[1] ?? "");
			const snapshot = await options.control.load(reviewId);
			const limit = pageLimit(
				url.searchParams.get("limit"),
				REVIEW_HTTP_DEFAULT_PAGE_LIMIT,
				pageMax,
			);
			const manifest = await loadManifestPage(
				options,
				snapshot,
				url.searchParams.get("cursor") ?? undefined,
				limit,
			);
			writeJson(response, 200, {
				schemaVersion: REVIEW_PAGE_SCHEMA,
				revision: snapshot.revision.toString(),
				...manifest,
			});
			return true;
		}
		const manifest = /^\/api\/reviews\/([^/]+)\/manifest$/u.exec(url.pathname);
		if (request.method === "GET" && manifest) {
			const reviewId = decodeURIComponent(manifest[1] ?? "");
			const snapshot = await options.control.load(reviewId);
			const page = await loadManifestPage(
				options,
				snapshot,
				url.searchParams.get("cursor") ?? undefined,
				pageLimit(
					url.searchParams.get("limit"),
					REVIEW_HTTP_DEFAULT_PAGE_LIMIT,
					pageMax,
				),
			);
			writeJson(response, 200, {
				schemaVersion: REVIEW_PAGE_SCHEMA,
				revision: snapshot.revision.toString(),
				...page,
			});
			return true;
		}
		const threads = /^\/api\/reviews\/([^/]+)\/threads$/u.exec(url.pathname);
		if (request.method === "GET" && threads) {
			const reviewId = decodeURIComponent(threads[1] ?? "");
			const snapshot = await options.control.load(reviewId);
			const folded = await loadAggregate(
				reviewControlDataDir(options.hoboHome),
				reviewId,
				content,
			);
			const limit = pageLimit(
				url.searchParams.get("limit"),
				REVIEW_HTTP_DEFAULT_THREAD_LIMIT,
				threadMax,
			);
			const paged = pageItems(
				folded.threads,
				url.searchParams.get("cursor") ?? undefined,
				secret,
				`threads:${reviewId}`,
				limit,
			);
			writeJson(response, 200, {
				schemaVersion: REVIEW_PAGE_SCHEMA,
				revision: snapshot.revision.toString(),
				threads: paged.items,
				pages: paged.pages,
			});
			return true;
		}
		const one = /^\/api\/reviews\/([^/]+)$/u.exec(url.pathname);
		if (request.method === "GET" && one) {
			const reviewId = decodeURIComponent(one[1] ?? "");
			const snapshot = await options.control.load(reviewId);
			writeJson(response, 200, {
				...snapshotJson(snapshot),
				target: publicTarget(snapshot.target),
			});
			return true;
		}
		writeJson(response, 404, { error: "not found", code: "not-found" });
		return true;
	} catch (error) {
		writeError(response, error);
		return true;
	}
}

export function attachReviewRoutes(
	server: Server,
	options: ReviewHttpRoutesOptions,
): void {
	server.on("request", async (request, response) => {
		if (response.writableEnded || response.headersSent) return;
		await handleReviewHttpRequest(request, response, options);
	});
}

export async function startReviewControlServer(
	options: ReviewHttpRoutesOptions & { readonly port?: number },
): Promise<ReviewControlServer> {
	const server = createServer(async (request, response) => {
		const handled = await handleReviewHttpRequest(request, response, options);
		if (!handled && !response.writableEnded) {
			writeJson(response, 404, { error: "not found", code: "not-found" });
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? 0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("review server has no port");
	}
	return {
		port: address.port,
		token: options.token,
		url: `http://127.0.0.1:${address.port}/reviews`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolve();
				});
			}),
	};
}
