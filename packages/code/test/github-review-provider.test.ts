import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	githubReviewCorrelationKey,
	githubReviewCorrelationMarker,
	readGithubReviewCorrelationKey,
	redactGithubSecrets,
} from "../src/review/github-review-correlation.js";
import {
	createGithubReviewProvider,
	GITHUB_REST_API_VERSION,
} from "../src/review/github-review-provider.js";
import { ReviewError } from "../src/review/review-errors.js";
import type {
	PendingReview,
	ReviewTarget,
	ReviewThread,
} from "../src/review/review-ports.js";
import type { SessionProcessRunner } from "../src/session-orchestrator.js";

const fixtureRoot = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/github-review",
);

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8")) as unknown;
}

function fixtureItems(name: string): unknown {
	const body = fixture(name) as { items?: unknown };
	return body.items ?? body;
}

const BASE_OID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_OID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function pullRequestTarget(): Extract<ReviewTarget, { kind: "pull-request" }> {
	return {
		kind: "pull-request",
		provider: "github",
		host: "github.com",
		repository: "acme/widgets",
		number: 42,
		baseRef: "main",
		headRef: "feat/durable-review",
		mergeBaseOid: BASE_OID,
		baseCommitOid: BASE_OID,
		headCommitOid: HEAD_OID,
		providerNodeId: "PR_kwDOSYNTH42",
	};
}

function pendingReview(
	decision: PendingReview["decision"],
	overrides: Partial<PendingReview> = {},
): PendingReview {
	return {
		pendingReviewId: "pending-1",
		reviewId: "review-1",
		generationId: "gen-1",
		expectedProviderHeadOid: HEAD_OID,
		decision,
		summaryBodyHash: "sum-hash",
		selectedMessageIds: [],
		selectedThreadOperations: [],
		orderedInlineComments: [
			{
				messageId: "msg-1",
				threadId: "thread-local-1",
				path: "src/app.ts",
				side: "new",
				line: 12,
				startLine: 10,
				bodyHash: "body-hash",
				body: "Please rename this helper.",
			},
		],
		preparedBy: "actor-1",
		preparedAt: "2026-08-01T00:00:00.000Z",
		effectDigest: "effect-digest-1",
		...overrides,
	};
}

function importedThread(): ReviewThread {
	return {
		threadId: "github:github.com/acme/widgets#42:c:1001",
		reviewId: "github:github.com/acme/widgets#42",
		origin: "github",
		visibility: "forge",
		resolution: "open",
		anchorHealth: "current",
		provider: {
			provider: "github",
			threadId: "1001",
			nodeId: "PRRT_kwDOSYNTH1",
			reviewCommentId: "1001",
		},
		messageIds: ["1001", "1002"],
		createdAt: "2026-08-01T00:00:00Z",
		updatedAt: "2026-08-01T00:10:00Z",
	};
}

interface ParsedGhCall {
	readonly hostname: string;
	readonly graphql: boolean;
	readonly method: string;
	readonly path: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly fields: Readonly<Record<string, string>>;
	readonly inputPath?: string;
	readonly rawArgs: readonly string[];
}

function parseGhArgs(args: readonly string[]): ParsedGhCall {
	const headers: Record<string, string> = {};
	const fields: Record<string, string> = {};
	let hostname = "github.com";
	let method = "GET";
	let path = "";
	let graphql = false;
	let inputPath: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const token = args[index] ?? "";
		const next = args[index + 1];
		if (token === "graphql") {
			graphql = true;
			continue;
		}
		if (token === "--hostname" && next) {
			hostname = next;
			index += 1;
			continue;
		}
		if (token === "--method" && next) {
			method = next.toUpperCase();
			index += 1;
			continue;
		}
		if ((token === "-H" || token === "--header") && next) {
			const split = next.indexOf(":");
			if (split > 0) {
				headers[next.slice(0, split).trim().toLowerCase()] = next
					.slice(split + 1)
					.trim();
			}
			index += 1;
			continue;
		}
		if ((token === "-f" || token === "-F" || token === "--raw-field") && next) {
			const split = next.indexOf("=");
			if (split > 0) fields[next.slice(0, split)] = next.slice(split + 1);
			index += 1;
			continue;
		}
		if (token === "--input" && next) {
			inputPath = next;
			index += 1;
			continue;
		}
		if (token.startsWith("/") || token.startsWith("repos/")) path = token;
	}
	return {
		hostname,
		graphql,
		method,
		path,
		headers,
		fields,
		...(inputPath === undefined ? {} : { inputPath }),
		rawArgs: args,
	};
}

function jsonResult(body: unknown): {
	code: number;
	stdout: string;
	stderr: string;
} {
	return { code: 0, stdout: `${JSON.stringify(body)}\n`, stderr: "" };
}

function createFakeGh(options?: {
	readonly authorLogin?: string;
	readonly viewerLogin?: string;
	readonly permission?: "ADMIN" | "MAINTAIN" | "WRITE" | "TRIAGE" | "READ";
	readonly graphql?: boolean;
	readonly timeoutOn?: (call: ParsedGhCall) => boolean;
}) {
	const calls: ParsedGhCall[] = [];
	const reviews = [
		fixtureItems("reviews-page-1.json"),
		fixtureItems("reviews-page-2.json"),
	] as unknown[][];
	const comments = [
		fixtureItems("comments-page-1.json"),
		fixtureItems("comments-page-2.json"),
	] as unknown[][];
	const extraReviews: unknown[] = [];
	const extraComments: unknown[] = [];
	let graphqlEnabled = options?.graphql !== false;
	const timeoutOn = options?.timeoutOn;
	const runner: SessionProcessRunner = {
		async run(command, args) {
			if (command !== "gh") {
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}
			const call = parseGhArgs(args);
			calls.push(call);
			if (timeoutOn?.(call)) {
				return {
					code: 1,
					stdout: "",
					stderr: "graphql: deadline exceeded: timed out talking to GitHub",
				};
			}
			if (call.graphql) {
				if (!graphqlEnabled) {
					return {
						code: 1,
						stdout: "",
						stderr: "GraphQL is not supported on this GitHub Enterprise host",
					};
				}
				const query = call.fields.query ?? "";
				if (query.includes("resolveReviewThread")) {
					return jsonResult(fixture("graphql-resolve.json"));
				}
				if (query.includes("unresolveReviewThread")) {
					return jsonResult(fixture("graphql-unresolve.json"));
				}
				if (query.includes("viewerPermission")) {
					const body = fixture("graphql-capabilities.json") as {
						data: {
							viewer: { login: string };
							repository: {
								viewerPermission: string;
								pullRequest: { author: { login: string } };
							};
						};
					};
					body.data.viewer.login = options?.viewerLogin ?? "reviewer";
					body.data.repository.viewerPermission =
						options?.permission ?? "WRITE";
					body.data.repository.pullRequest.author.login =
						options?.authorLogin ?? "octocat";
					return jsonResult(body);
				}
				if (query.includes("reviewThreads")) {
					return jsonResult(
						call.fields.cursor === "thread-page-1"
							? fixture("graphql-threads-page-2.json")
							: fixture("graphql-threads-page-1.json"),
					);
				}
				return {
					code: 1,
					stdout: "",
					stderr: `unhandled graphql: ${query.slice(0, 80)}`,
				};
			}
			const path = call.path.split("?")[0] ?? "";
			const page = Number(
				new URL(
					`https://example.test${call.path.startsWith("/") ? "" : "/"}${call.path}`,
				).searchParams.get("page") ?? "1",
			);
			if (path === "/user") return jsonResult(fixture("user.json"));
			if (path === "/repos/acme/widgets")
				return jsonResult(fixture("repository.json"));
			if (path === "/repos/acme/widgets/pulls/42")
				return jsonResult(fixture("pull-request.json"));
			if (path === `/repos/acme/widgets/compare/${BASE_OID}...${HEAD_OID}`)
				return jsonResult(fixture("compare.json"));
			if (path === "/repos/acme/widgets/pulls/42/reviews") {
				if (call.method === "POST")
					return jsonResult(fixture("submit-review.json"));
				const pageItems = reviews[page - 1] ?? [];
				return jsonResult(
					page === 1 ? [...pageItems, ...extraReviews] : pageItems,
				);
			}
			if (path === "/repos/acme/widgets/pulls/42/comments") {
				const pageItems = comments[page - 1] ?? [];
				return jsonResult(
					page === 1 ? [...pageItems, ...extraComments] : pageItems,
				);
			}
			if (path === "/repos/acme/widgets/pulls/42/comments/1001/replies") {
				return jsonResult(fixture("reply-comment.json"));
			}
			if (path === "/repos/acme/widgets/pulls/comments/1001") {
				return jsonResult(
					(fixtureItems("comments-page-1.json") as unknown[])[0],
				);
			}
			if (path === "/repos/acme/widgets/pulls/comments/1002") {
				return jsonResult(
					(fixtureItems("comments-page-1.json") as unknown[])[1],
				);
			}
			return { code: 1, stdout: "", stderr: `unhandled REST ${path}` };
		},
	};
	return {
		runner,
		calls,
		extraReviews,
		extraComments,
		disableGraphql() {
			graphqlEnabled = false;
		},
		enableGraphql() {
			graphqlEnabled = true;
		},
	};
}

function providerFrom(
	fake: ReturnType<typeof createFakeGh>,
	allowedHosts?: readonly string[],
) {
	return createGithubReviewProvider({
		runner: fake.runner,
		cwd: "/tmp/hobo-review-github-fake",
		pageSize: 1,
		...(allowedHosts === undefined ? {} : { allowedHosts }),
	});
}

describe("github review correlation", () => {
	it("builds an invisible HTML comment from commandId+digest without secrets", () => {
		const marker = githubReviewCorrelationMarker({
			commandId: "cmd-1",
			digest: "digest-1",
		});
		expect(marker.startsWith("<!-- ")).toBe(true);
		expect(marker.endsWith(" -->")).toBe(true);
		expect(marker).not.toMatch(/cmd-1|digest-1|ghp_|github_pat_|Bearer /u);
		expect(marker).toContain(githubReviewCorrelationKey("cmd-1", "digest-1"));
		expect(readGithubReviewCorrelationKey(`ok\n${marker}\n`)).toBe(
			githubReviewCorrelationKey("cmd-1", "digest-1"),
		);
	});

	it("redacts GitHub tokens from log text", () => {
		const redacted = redactGithubSecrets(
			"Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789 failed; GH_TOKEN=github_pat_11AAAA and token gho_secretvalue",
		);
		expect(redacted).not.toMatch(/ghp_|gho_|github_pat_|Bearer [A-Za-z0-9]/u);
		expect(redacted).toContain("[redacted]");
	});
});

describe("github review provider host allowlist", () => {
	it("detects github.com remotes and rejects arbitrary hosts", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		await expect(
			provider.detectRepository({
				remoteUrl: "git@github.com:acme/widgets.git",
			}),
		).resolves.toEqual({ host: "github.com", repository: "acme/widgets" });
		await expect(
			provider.detectRepository({
				remoteUrl: "https://github.com/acme/widgets.git",
			}),
		).resolves.toEqual({ host: "github.com", repository: "acme/widgets" });
		await expect(
			provider.detectRepository({
				remoteUrl: "https://evil.example/acme/widgets.git",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			provider.detectRepository({
				remoteUrl: "https://github.com.evil.example/acme/widgets.git",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			provider.detectRepository({
				remoteUrl: "https://127.0.0.1/acme/widgets.git",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			provider.detectRepository({
				remoteUrl: "https://169.254.169.254/latest/meta-data",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			provider.detectRepository({ remoteUrl: "file:///etc/passwd" }),
		).rejects.toMatchObject({ code: "malformed-input" });
		expect(fake.calls).toEqual([]);
	});

	it("allows only explicitly configured GHES hosts", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake, ["ghe.example.com"]);
		await expect(
			provider.detectRepository({
				remoteUrl: "https://ghe.example.com/acme/widgets.git",
			}),
		).resolves.toEqual({
			host: "ghe.example.com",
			repository: "acme/widgets",
		});
		await expect(
			provider.detectRepository({
				remoteUrl: "https://ghe-other.example.com/acme/widgets.git",
			}),
		).rejects.toBeInstanceOf(ReviewError);
		await expect(
			provider.resolvePullRequest({
				host: "ghe-other.example.com",
				repository: "acme/widgets",
				number: 42,
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
	});
});

describe("github review provider", () => {
	it("pins the REST API version on every REST call", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		await provider.resolvePullRequest({
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
		});
		const rest = fake.calls.filter((call) => !call.graphql);
		expect(GITHUB_REST_API_VERSION).toBe("2022-11-28");
		expect(rest.length).toBeGreaterThan(0);
		for (const call of rest) {
			expect(call.headers["x-github-api-version"]).toBe("2022-11-28");
			expect(call.rawArgs.join("\0")).not.toMatch(
				/ghp_|github_pat_|GH_TOKEN=/u,
			);
		}
	});

	it("resolves pull request metadata with exact SHAs", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const target = await provider.resolvePullRequest({
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
		});
		expect(target).toMatchObject({
			kind: "pull-request",
			provider: "github",
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
			baseRef: "main",
			headRef: "feat/durable-review",
			baseCommitOid: BASE_OID,
			headCommitOid: HEAD_OID,
			mergeBaseOid: BASE_OID,
			providerNodeId: "PR_kwDOSYNTH42",
		});
	});

	it("paginates reviews and threads and keeps REST/GraphQL identities aligned", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const target = pullRequestTarget();
		const reviews = await provider.fetchPullRequestReviews({ target });
		expect(reviews.map((item) => item.providerReviewId)).toEqual(["80", "81"]);
		expect(reviews[0]?.providerReviewNodeId).toBe("PRR_kwDOSYNTH80");
		const threads = await provider.fetchPullRequestThreads({ target });
		expect(threads).toHaveLength(3);
		expect(threads.map((thread) => thread.provider?.reviewCommentId)).toEqual([
			"1001",
			"1003",
			"1004",
		]);
		expect(threads[0]?.provider?.nodeId).toBe("PRRT_kwDOSYNTH1");
		expect(threads[0]?.provider?.threadId).toBe("1001");
		expect(threads[0]?.resolution).toBe("resolved");
		expect(threads[0]?.messageIds).toEqual(["1001", "1002"]);
		expect(threads[1]?.anchorHealth).toBe("outdated");
		expect(threads[2]?.anchor?.side).toBe("file");
		expect(
			fake.calls.filter((call) => call.graphql && call.fields.cursor).length,
		).toBeGreaterThan(0);
		expect(
			fake.calls.some(
				(call) =>
					!call.graphql &&
					call.path.includes("/reviews") &&
					call.path.includes("page=2"),
			),
		).toBe(true);
	});

	it("refresh updates the same local provider thread instead of duplicating", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const target = pullRequestTarget();
		fake.disableGraphql();
		const first = await provider.fetchPullRequestThreads({ target });
		fake.enableGraphql();
		const second = await provider.fetchPullRequestThreads({ target });
		expect(first.map((thread) => thread.threadId)).toEqual(
			second.map((thread) => thread.threadId),
		);
		expect(new Set(second.map((thread) => thread.threadId)).size).toBe(
			second.length,
		);
		expect(first[0]?.resolution).toBe("open");
		expect(second[0]?.resolution).toBe("resolved");
		expect(first[0]?.provider?.reviewCommentId).toBe(
			second[0]?.provider?.reviewCommentId,
		);
	});

	it("types disabled capabilities instead of omitting them", async () => {
		const author = createFakeGh({
			viewerLogin: "octocat",
			authorLogin: "octocat",
			permission: "WRITE",
		});
		const authorCaps = await providerFrom(author).capabilities({
			target: pullRequestTarget(),
			actorId: "github:octocat",
		});
		expect(authorCaps.kind).toBe("github");
		expect(authorCaps.actorMayApprove).toBe(false);
		expect(authorCaps.decisions).toEqual(["comment"]);
		expect(authorCaps.lineComments).toBe(true);
		expect(authorCaps.threadResolution).toBe(true);
		expect(authorCaps.enterprise).toBe(false);
		expect(typeof authorCaps.fingerprint).toBe("string");

		const enterprise = createFakeGh({ graphql: false });
		const ghes = await createGithubReviewProvider({
			runner: enterprise.runner,
			cwd: "/tmp/hobo-review-github-fake",
			allowedHosts: ["ghe.example.com"],
			pageSize: 1,
		}).capabilities({
			target: { ...pullRequestTarget(), host: "ghe.example.com" },
			actorId: "github:reviewer",
		});
		expect(ghes.enterprise).toBe(true);
		expect(ghes.threadResolution).toBe(false);
		expect(ghes.actorMayApprove).toBe(true);
		expect(ghes.decisions).toEqual(["comment", "approve", "request-changes"]);
		expect(ghes.lineComments).toBe(true);
		expect(ghes.rangeComments).toBe(false);
		expect(ghes.pendingReviews).toBe(false);
	});

	it("submits comment, approve, and request-changes against the exact head SHA", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const target = pullRequestTarget();
		const marker = githubReviewCorrelationMarker({
			commandId: "publish-1",
			digest: "effect-digest-1",
		});
		for (const decision of ["comment", "approve", "request-changes"] as const) {
			const result = await provider.submitReview({
				pending: pendingReview(decision),
				target,
				correlationMarker: marker,
			});
			expect(result.providerReviewId).toBe("99");
			expect(result.receiptHash.length).toBe(64);
		}
		const posts = fake.calls.filter(
			(call) => call.method === "POST" && call.path.endsWith("/reviews"),
		);
		expect(posts).toHaveLength(3);
		expect(posts.map((call) => call.fields.event)).toEqual([
			"COMMENT",
			"APPROVE",
			"REQUEST_CHANGES",
		]);
		expect(posts.every((call) => call.fields.commit_id === HEAD_OID)).toBe(
			true,
		);
		expect(posts.every((call) => call.fields.body?.includes(marker))).toBe(
			true,
		);
	});

	it("refuses a disabled approve instead of silently commenting", async () => {
		const fake = createFakeGh({
			viewerLogin: "octocat",
			authorLogin: "octocat",
		});
		const provider = providerFrom(fake);
		await expect(
			provider.submitReview({
				pending: pendingReview("approve"),
				target: pullRequestTarget(),
				correlationMarker: githubReviewCorrelationMarker({
					commandId: "cmd",
					digest: "dig",
				}),
			}),
		).rejects.toMatchObject({ code: "unsupported-capability" });
	});

	it("replies only to a top-level review-comment thread", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const marker = githubReviewCorrelationMarker({
			commandId: "reply-1",
			digest: "reply-digest",
		});
		const result = await provider.replyToThread({
			thread: importedThread(),
			body: "Follow-up.",
			correlationMarker: marker,
		});
		expect(result.providerCommentId).toBe("2002");
		const reply = fake.calls.find((call) =>
			call.path.endsWith("/comments/1001/replies"),
		);
		expect(reply?.fields.body).toContain("Follow-up.");
		expect(reply?.fields.body).toContain(marker);
		await expect(
			provider.replyToThread({
				thread: {
					...importedThread(),
					provider: {
						provider: "github",
						threadId: "1002",
						reviewCommentId: "1002",
					},
				},
				body: "nested",
				correlationMarker: marker,
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
	});

	it("resolves and unresolves GraphQL threads with variables", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const thread = importedThread();
		await provider.resolveThread({ thread });
		await provider.unresolveThread({ thread });
		const mutations = fake.calls.filter(
			(call) =>
				call.graphql &&
				(call.fields.query?.includes("resolveReviewThread") ||
					call.fields.query?.includes("unresolveReviewThread")),
		);
		expect(mutations).toHaveLength(2);
		for (const call of mutations) {
			expect(call.fields.query).not.toContain("PRRT_kwDOSYNTH1");
			expect(call.fields.threadId).toBe("PRRT_kwDOSYNTH1");
		}
	});

	it("reconciles none, one, multiple, and conflict; timeout is not definite", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		await provider.resolvePullRequest({
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
		});
		const none = await provider.reconcile({
			commandId: "missing",
			digest: "missing",
			operation: "publish-review",
		});
		expect(none).toEqual({ matches: 0 });

		const submittedMarker = githubReviewCorrelationMarker({
			commandId: "publish-1",
			digest: "effect-digest-1",
		});
		const key = githubReviewCorrelationKey("publish-1", "effect-digest-1");
		fake.extraReviews.push({
			id: 90,
			node_id: "PRR_kwDOSYNTH90",
			user: { login: "reviewer" },
			body: `done\n${submittedMarker}`,
			state: "COMMENTED",
			commit_id: HEAD_OID,
		});
		const found = await provider.reconcile({
			commandId: "publish-1",
			digest: "effect-digest-1",
			operation: "publish-review",
		});
		expect(found.matches).toBe(1);
		expect(found.receiptHash).toEqual(expect.any(String));
		expect(key).toHaveLength(64);

		fake.extraReviews.push({
			id: 91,
			node_id: "PRR_kwDOSYNTH91",
			user: { login: "reviewer" },
			body: `copy\n${submittedMarker}`,
			state: "COMMENTED",
			commit_id: HEAD_OID,
		});
		await expect(
			provider.reconcile({
				commandId: "publish-1",
				digest: "effect-digest-1",
				operation: "publish-review",
			}),
		).rejects.toMatchObject({ code: "ambiguous-outcome" });

		const timeoutFake = createFakeGh({
			timeoutOn: (call) =>
				!call.graphql &&
				call.path.includes("/reviews") &&
				call.method === "GET",
		});
		const timeoutProvider = providerFrom(timeoutFake);
		await timeoutProvider.resolvePullRequest({
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
		});
		await expect(
			timeoutProvider.reconcile({
				commandId: "publish-1",
				digest: "effect-digest-1",
				operation: "publish-review",
			}),
		).rejects.toMatchObject({
			code: "provider-drift",
			details: { definite: false },
		});
	});

	it("redacts tokens when a GitHub call fails", async () => {
		const runner: SessionProcessRunner = {
			async run() {
				return {
					code: 1,
					stdout: "",
					stderr:
						"HTTP 401: Bad credentials (ghp_abcdefghijklmnopqrstuvwxyz0123456789) GH_TOKEN=secret",
				};
			},
		};
		const provider = createGithubReviewProvider({
			runner,
			cwd: "/tmp/hobo-review-github-fake",
		});
		await expect(
			provider.resolvePullRequest({
				host: "github.com",
				repository: "acme/widgets",
				number: 42,
			}),
		).rejects.toSatisfy((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).not.toContain("ghp_");
			expect(message).not.toContain("GH_TOKEN=secret");
			expect(message).toContain("[redacted]");
			return true;
		});
	});

	it("never interpolates repository identity into GraphQL documents", async () => {
		const fake = createFakeGh();
		const provider = providerFrom(fake);
		const target = pullRequestTarget();
		await provider.fetchPullRequestThreads({ target });
		await provider.capabilities({ target, actorId: "github:reviewer" });
		await provider.resolveThread({ thread: importedThread() });
		for (const call of fake.calls.filter((item) => item.graphql)) {
			expect(call.fields.query).not.toContain("acme");
			expect(call.fields.query).not.toContain("widgets");
			expect(call.fields.query).not.toMatch(/\b42\b/u);
		}
	});
});
