// GitHub-only ReviewProvider. Hosts are github.com plus explicit GHES names.
// All forge I/O is argv-safe `gh api` / `gh api graphql` with query variables.
import { createHash } from "node:crypto";
import type { SessionProcessRunner } from "../session-orchestrator.js";
import {
	collectGithubReviewCorrelationKeys,
	githubReviewCorrelationKey,
	redactGithubSecrets,
} from "./github-review-correlation.js";
import {
	GITHUB_REST_API_VERSION,
	type GithubGraphqlThread,
	type GithubReview,
	type GithubReviewComment,
	parseGithubCapabilitySnapshot,
	parseGithubCompare,
	parseGithubGraphqlThreadPage,
	parseGithubOid,
	parseGithubPullRequest,
	parseGithubRepository,
	parseGithubReviewComment,
	parseGithubReviewComments,
	parseGithubReviews,
	parseGithubUser,
	parseRepositoryName,
	parseSubmittedReview,
} from "./github-review-schemas.js";
import { reviewError } from "./review-errors.js";
import type {
	ReviewAnchor,
	ReviewDecision,
	ReviewProvider,
	ReviewProviderCapabilities,
	ReviewSubmission,
	ReviewTarget,
	ReviewThread,
} from "./review-ports.js";

export { GITHUB_REST_API_VERSION } from "./github-review-schemas.js";

export interface GithubReviewProviderOptions {
	readonly runner: SessionProcessRunner;
	readonly allowedHosts?: readonly string[];
	readonly cwd?: string;
	readonly pageSize?: number;
}

type PullRequestTarget = Extract<ReviewTarget, { kind: "pull-request" }>;

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      reviewThreads(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              databaseId
              body
              createdAt
              updatedAt
              outdated
              path
              replyTo { id databaseId }
              line
              originalLine
              startLine
              diffSide
              startDiffSide
              subjectType
            }
          }
        }
      }
    }
  }
}`;

const CAPABILITIES_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    viewerPermission
    pullRequest(number: $number) {
      author { login }
      viewerCanApplySuggestion
    }
  }
}`;

const RESOLVE_QUERY = `mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { id isResolved }
  }
}`;

const UNRESOLVE_QUERY = `mutation($threadId: ID!) {
  unresolveReviewThread(input: {threadId: $threadId}) {
    thread { id isResolved }
  }
}`;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function normalizeHost(host: string): string {
	return host.trim().toLowerCase().replace(/\.+$/u, "");
}

function isIpHost(host: string): boolean {
	return IPV4.test(host) || host.includes(":");
}

function isDnsHost(host: string): boolean {
	if (host.length === 0 || host.length > 253 || isIpHost(host)) return false;
	if (BLOCKED_HOSTS.has(host)) return false;
	return host.split(".").every((label) => DNS_LABEL.test(label));
}

function assertAllowedHost(host: string, allowed: ReadonlySet<string>): string {
	const normalized = normalizeHost(host);
	if (normalized === "api.github.com") return "github.com";
	if (!isDnsHost(normalized) || !allowed.has(normalized)) {
		throw reviewError("malformed-input", "github host is not allowlisted", {
			host: normalized,
		});
	}
	return normalized;
}

function parseRepoPath(path: string): string {
	const cleaned = path
		.replace(/^\/+/u, "")
		.replace(/\.git$/iu, "")
		.replace(/\/+$/u, "");
	return `${parseRepositoryName(cleaned).owner}/${parseRepositoryName(cleaned).name}`;
}

function parseRemoteUrl(
	remoteUrl: string,
	allowed: ReadonlySet<string>,
): { readonly host: string; readonly repository: string } {
	if (remoteUrl.length === 0 || remoteUrl.length > 2048) {
		throw reviewError("malformed-input", "remote URL is invalid");
	}
	let host: string;
	let path: string;
	const scp =
		/^(?:[^@/?#]+@)?([^@/?#:]+):([^/].*)$/u.exec(remoteUrl) ?? undefined;
	if (scp && !remoteUrl.includes("://")) {
		host = scp[1] ?? "";
		path = scp[2] ?? "";
	} else {
		let parsed: URL;
		try {
			parsed = new URL(remoteUrl);
		} catch {
			throw reviewError("malformed-input", "remote URL is invalid");
		}
		if (
			!["https:", "http:", "ssh:", "git:", "git+ssh:"].includes(parsed.protocol)
		) {
			throw reviewError(
				"malformed-input",
				"remote URL protocol is not allowed",
			);
		}
		host = parsed.hostname;
		path = parsed.pathname;
	}
	return {
		host: assertAllowedHost(host, allowed),
		repository: parseRepoPath(path),
	};
}

function reviewScopeId(target: PullRequestTarget): string {
	return `github:${target.host}/${target.repository}#${target.number}`;
}

function localThreadId(
	target: PullRequestTarget,
	rootCommentId: string,
): string {
	return `${reviewScopeId(target)}:c:${rootCommentId}`;
}

function receiptHashFor(
	kind: string,
	id: string,
	nodeId: string,
	commitId: string,
): string {
	return createHash("sha256")
		.update(`${kind}\n${id}\n${nodeId}\n${commitId}`)
		.digest("hex");
}

function capabilityFingerprint(
	capabilities: Omit<ReviewProviderCapabilities, "fingerprint">,
): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				kind: capabilities.kind,
				host: capabilities.host,
				lineComments: capabilities.lineComments,
				rangeComments: capabilities.rangeComments,
				fileComments: capabilities.fileComments,
				reviewComments: capabilities.reviewComments,
				pendingReviews: capabilities.pendingReviews,
				decisions: capabilities.decisions,
				threadReplies: capabilities.threadReplies,
				threadResolution: capabilities.threadResolution,
				importExisting: capabilities.importExisting,
				outdatedMetadata: capabilities.outdatedMetadata,
				enterprise: capabilities.enterprise,
				actorMayApprove: capabilities.actorMayApprove,
			}),
		)
		.digest("hex");
}

function decisionEvent(decision: ReviewDecision): string {
	if (decision === "approve") return "APPROVE";
	if (decision === "request-changes") return "REQUEST_CHANGES";
	return "COMMENT";
}

function commentSide(side: "old" | "new" | "file"): "LEFT" | "RIGHT" {
	return side === "old" ? "LEFT" : "RIGHT";
}

function reviewState(state: string): ReviewSubmission["state"] {
	return state === "PENDING" ? "pending" : "applied";
}

function isTimeoutText(text: string): boolean {
	return /timeout|timed out|deadline exceeded|etimedout/iu.test(text);
}

function parseTargetFromThread(
	thread: ReviewThread,
): { host: string; repository: string; number: number } | undefined {
	const source = `${thread.reviewId}\n${thread.threadId}`;
	const match = /github:([^/\s]+)\/([^#\s]+)#(\d+)/u.exec(source) ?? undefined;
	if (!match || match[1] === undefined || match[2] === undefined)
		return undefined;
	return {
		host: match[1],
		repository: match[2],
		number: Number(match[3]),
	};
}

function anchorFromComment(
	comment: GithubReviewComment | GithubGraphqlThread["comments"][number],
	outdated: boolean,
	headOid: string,
): ReviewAnchor {
	const path = comment.path;
	const file = comment.subjectType === "file";
	const startLine = "startLine" in comment ? comment.startLine : undefined;
	const endLine = comment.line;
	return {
		anchorId: `github-anchor:${"databaseId" in comment ? comment.databaseId : comment.id}`,
		generationId: `github-import:${headOid}`,
		fileId: path,
		pathAfter: path,
		side: file ? "file" : comment.side === "LEFT" ? "old" : "new",
		contextBeforeHashes: [],
		contextAfterHashes: [],
		...(startLine === undefined ? {} : { startLine }),
		...(endLine === undefined ? {} : { endLine }),
		...(outdated ? { hunkFingerprint: "outdated" } : {}),
	};
}

function importedSubmission(review: GithubReview): ReviewSubmission {
	const marker = collectGithubReviewCorrelationKeys(review.body)[0];
	return {
		submissionId: `github-review:${review.id}`,
		pendingReviewId: `github-review:${review.id}`,
		commandId: marker ?? `github-imported:${review.id}`,
		effectDigest:
			marker ??
			receiptHashFor("review", review.id, review.nodeId, review.commitId),
		provider: "github",
		state: reviewState(review.state),
		providerReviewId: review.id,
		providerReviewNodeId: review.nodeId,
		providerHeadOid: review.commitId,
		receiptHash: receiptHashFor(
			"review",
			review.id,
			review.nodeId,
			review.commitId,
		),
	};
}

export function createGithubReviewProvider(
	options: GithubReviewProviderOptions,
): ReviewProvider {
	const allowed = new Set<string>(["github.com"]);
	for (const host of options.allowedHosts ?? []) {
		const normalized = normalizeHost(host);
		if (normalized === "github.com") continue;
		if (!isDnsHost(normalized)) {
			throw reviewError("malformed-input", "GHES host must be a DNS name", {
				host: normalized,
			});
		}
		allowed.add(normalized);
	}
	const cwd = options.cwd ?? process.cwd();
	const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
	let bound: PullRequestTarget | undefined;

	function bind(target: PullRequestTarget): PullRequestTarget {
		const host = assertAllowedHost(target.host, allowed);
		parseRepositoryName(target.repository);
		if (!Number.isInteger(target.number) || target.number <= 0) {
			throw reviewError("malformed-input", "pull request number is invalid");
		}
		bound = target.host === host ? target : { ...target, host };
		return bound;
	}

	function requireBound(): PullRequestTarget {
		if (bound === undefined) {
			throw reviewError(
				"malformed-input",
				"reconcile requires a previously resolved pull request",
			);
		}
		return bound;
	}

	async function runGh(args: readonly string[]): Promise<unknown> {
		const result = await options.runner.run("gh", args, cwd);
		const combined = redactGithubSecrets(`${result.stdout}\n${result.stderr}`);
		if (isTimeoutText(`${result.stdout}\n${result.stderr}`)) {
			throw reviewError(
				"provider-drift",
				"github request timed out; outcome is not definite",
				{ definite: false },
			);
		}
		if (result.code !== 0) {
			if (/\b401\b|\b403\b|auth/iu.test(combined)) {
				throw reviewError("auth-denied", combined);
			}
			if (/\b404\b|not found/iu.test(combined)) {
				throw reviewError("not-found", combined);
			}
			if (/\b422\b|validation failed/iu.test(combined)) {
				throw reviewError("provider-drift", combined);
			}
			throw reviewError("provider-drift", combined || "github request failed");
		}
		try {
			return JSON.parse(result.stdout) as unknown;
		} catch {
			throw reviewError(
				"malformed-input",
				redactGithubSecrets("github response was not JSON"),
			);
		}
	}

	function restHeaders(): string[] {
		return [
			"-H",
			"Accept: application/vnd.github+json",
			"-H",
			`X-GitHub-Api-Version: ${GITHUB_REST_API_VERSION}`,
		];
	}

	async function ghRest(
		host: string,
		method: string,
		path: string,
		fields: readonly {
			readonly flag: "-f" | "-F";
			readonly name: string;
			readonly value: string;
		}[] = [],
	): Promise<unknown> {
		const args = [
			"api",
			"--hostname",
			host,
			"--method",
			method,
			...restHeaders(),
			path,
		];
		for (const field of fields) {
			args.push(field.flag, `${field.name}=${field.value}`);
		}
		return runGh(args);
	}

	async function ghGraphql(
		host: string,
		query: string,
		variables: Readonly<Record<string, string | number>>,
	): Promise<unknown> {
		const args = [
			"api",
			"graphql",
			"--hostname",
			host,
			"-H",
			`X-GitHub-Api-Version: ${GITHUB_REST_API_VERSION}`,
			"-f",
			`query=${query}`,
		];
		for (const [name, value] of Object.entries(variables)) {
			if (typeof value === "number") args.push("-F", `${name}=${value}`);
			else args.push("-f", `${name}=${value}`);
		}
		const payload = await runGh(args);
		if (
			payload !== null &&
			typeof payload === "object" &&
			"errors" in payload &&
			Array.isArray((payload as { errors: unknown }).errors)
		) {
			throw reviewError(
				"provider-drift",
				redactGithubSecrets(
					JSON.stringify((payload as { errors: unknown }).errors),
				),
			);
		}
		return payload;
	}

	async function paginateRest<T>(
		host: string,
		path: string,
		parse: (value: unknown) => readonly T[],
	): Promise<T[]> {
		const items: T[] = [];
		for (let page = 1; page < 100; page += 1) {
			const separator = path.includes("?") ? "&" : "?";
			const body = await ghRest(
				host,
				"GET",
				`${path}${separator}per_page=${pageSize}&page=${page}`,
			);
			const batch = parse(body);
			items.push(...batch);
			if (batch.length < pageSize) break;
		}
		return items;
	}

	async function loadReviews(
		target: PullRequestTarget,
	): Promise<GithubReview[]> {
		const { owner, name } = parseRepositoryName(target.repository);
		return paginateRest(
			target.host,
			`/repos/${owner}/${name}/pulls/${target.number}/reviews`,
			parseGithubReviews,
		);
	}

	async function loadRestComments(
		target: PullRequestTarget,
	): Promise<GithubReviewComment[]> {
		const { owner, name } = parseRepositoryName(target.repository);
		return paginateRest(
			target.host,
			`/repos/${owner}/${name}/pulls/${target.number}/comments`,
			parseGithubReviewComments,
		);
	}

	async function loadGraphqlThreads(
		target: PullRequestTarget,
	): Promise<GithubGraphqlThread[]> {
		const { owner, name } = parseRepositoryName(target.repository);
		const threads: GithubGraphqlThread[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < 100; page += 1) {
			const variables: Record<string, string | number> = {
				owner,
				name,
				number: target.number,
			};
			if (cursor !== undefined) variables.cursor = cursor;
			const parsed = parseGithubGraphqlThreadPage(
				await ghGraphql(target.host, THREADS_QUERY, variables),
			);
			threads.push(...parsed.threads);
			if (!parsed.hasNextPage || parsed.endCursor === undefined) break;
			cursor = parsed.endCursor;
		}
		return threads;
	}

	function threadsFromRest(
		target: PullRequestTarget,
		comments: readonly GithubReviewComment[],
	): ReviewThread[] {
		const byId = new Map(comments.map((comment) => [comment.id, comment]));
		const grouped = new Map<string, GithubReviewComment[]>();
		for (const comment of comments) {
			const rootId =
				comment.inReplyToId !== undefined && byId.has(comment.inReplyToId)
					? comment.inReplyToId
					: comment.id;
			const list = grouped.get(rootId) ?? [];
			list.push(comment);
			grouped.set(rootId, list);
		}
		return [...grouped.entries()]
			.sort(([left], [right]) => Number(left) - Number(right))
			.map(([rootId, threadComments]) => {
				const root = byId.get(rootId) ?? threadComments[0];
				if (root === undefined) {
					throw reviewError(
						"corrupted-state",
						"review thread is missing its root",
					);
				}
				const outdated = threadComments.some((item) => item.outdated);
				const createdAt = threadComments.reduce(
					(min, item) => (item.createdAt < min ? item.createdAt : min),
					root.createdAt,
				);
				const updatedAt = threadComments.reduce(
					(max, item) => (item.updatedAt > max ? item.updatedAt : max),
					root.updatedAt,
				);
				return {
					threadId: localThreadId(target, root.id),
					reviewId: reviewScopeId(target),
					origin: "github" as const,
					visibility: "forge" as const,
					anchor: anchorFromComment(root, outdated, target.headCommitOid),
					resolution: "open" as const,
					anchorHealth: outdated ? ("outdated" as const) : ("current" as const),
					provider: {
						provider: "github" as const,
						threadId: root.id,
						nodeId: root.nodeId,
						reviewCommentId: root.id,
					},
					messageIds: threadComments.map((item) => item.id),
					createdAt,
					updatedAt,
				};
			});
	}

	function threadsFromGraphql(
		target: PullRequestTarget,
		threads: readonly GithubGraphqlThread[],
	): ReviewThread[] {
		return [...threads]
			.map((thread) => {
				const root =
					thread.comments.find(
						(item) => item.replyToDatabaseId === undefined,
					) ?? thread.comments[0];
				if (root === undefined) {
					throw reviewError(
						"corrupted-state",
						"graphql thread has no comments",
					);
				}
				const createdAt = thread.comments.reduce(
					(min, item) => (item.createdAt < min ? item.createdAt : min),
					root.createdAt,
				);
				const updatedAt = thread.comments.reduce(
					(max, item) => (item.updatedAt > max ? item.updatedAt : max),
					root.updatedAt,
				);
				return {
					threadId: localThreadId(target, root.databaseId),
					reviewId: reviewScopeId(target),
					origin: "github" as const,
					visibility: "forge" as const,
					anchor: anchorFromComment(
						root,
						thread.isOutdated || root.outdated,
						target.headCommitOid,
					),
					resolution: thread.isResolved
						? ("resolved" as const)
						: ("open" as const),
					anchorHealth: thread.isOutdated
						? ("outdated" as const)
						: ("current" as const),
					provider: {
						provider: "github" as const,
						threadId: root.databaseId,
						nodeId: thread.nodeId,
						reviewCommentId: root.databaseId,
					},
					messageIds: thread.comments.map((item) => item.databaseId),
					createdAt,
					updatedAt,
				};
			})
			.sort((left, right) =>
				(left.provider.reviewCommentId ?? "").localeCompare(
					right.provider.reviewCommentId ?? "",
					"en",
					{ numeric: true },
				),
			);
	}

	async function resolveThreadIdentity(thread: ReviewThread): Promise<{
		readonly target: PullRequestTarget;
		readonly commentId: string;
		readonly nodeId?: string;
	}> {
		const parsed = parseTargetFromThread(thread);
		const target = parsed
			? bind({
					kind: "pull-request",
					provider: "github",
					host: parsed.host,
					repository: parsed.repository,
					number: parsed.number,
					baseRef: bound?.baseRef ?? "unknown",
					headRef: bound?.headRef ?? "unknown",
					mergeBaseOid: bound?.mergeBaseOid ?? "0".repeat(40),
					baseCommitOid: bound?.baseCommitOid ?? "0".repeat(40),
					headCommitOid: bound?.headCommitOid ?? "0".repeat(40),
				})
			: requireBound();
		const commentId =
			thread.provider?.reviewCommentId ?? thread.provider?.threadId;
		if (commentId === undefined) {
			throw reviewError(
				"malformed-input",
				"thread is missing a provider identity",
			);
		}
		const nodeId = thread.provider?.nodeId;
		return {
			target,
			commentId,
			...(nodeId === undefined ? {} : { nodeId }),
		};
	}

	const provider: ReviewProvider = {
		kind: "github",

		async detectRepository(input) {
			return parseRemoteUrl(input.remoteUrl, allowed);
		},

		async resolvePullRequest(input) {
			const host = assertAllowedHost(input.host, allowed);
			const { owner, name } = parseRepositoryName(input.repository);
			if (!Number.isInteger(input.number) || input.number <= 0) {
				throw reviewError("malformed-input", "pull request number is invalid");
			}
			const pull = parseGithubPullRequest(
				await ghRest(
					host,
					"GET",
					`/repos/${owner}/${name}/pulls/${input.number}`,
				),
			);
			const compare = parseGithubCompare(
				await ghRest(
					host,
					"GET",
					`/repos/${owner}/${name}/compare/${pull.baseOid}...${pull.headOid}`,
				),
			);
			return bind({
				kind: "pull-request",
				provider: "github",
				host,
				repository: `${owner}/${name}`,
				number: pull.number,
				baseRef: pull.baseRef,
				headRef: pull.headRef,
				mergeBaseOid: compare.mergeBaseOid,
				baseCommitOid: pull.baseOid,
				headCommitOid: pull.headOid,
				providerNodeId: pull.nodeId,
			});
		},

		async fetchPullRequestThreads(input) {
			const target = bind(input.target);
			try {
				return threadsFromGraphql(target, await loadGraphqlThreads(target));
			} catch (error) {
				if (error instanceof Error && isTimeoutText(error.message)) {
					throw error;
				}
				return threadsFromRest(target, await loadRestComments(target));
			}
		},

		async fetchPullRequestReviews(input) {
			const target = bind(input.target);
			return (await loadReviews(target)).map(importedSubmission);
		},

		async submitReview(input) {
			const target = bind(input.target);
			const capabilities = await provider.capabilities({
				target,
				actorId: input.pending.preparedBy,
			});
			if (
				(input.pending.decision === "approve" ||
					input.pending.decision === "request-changes") &&
				!capabilities.actorMayApprove
			) {
				throw reviewError(
					"unsupported-capability",
					"actor cannot submit that review decision",
					{ decision: input.pending.decision },
				);
			}
			const expected = input.pending.expectedProviderHeadOid;
			if (expected === undefined) {
				throw reviewError(
					"malformed-input",
					"pending review is missing expectedProviderHeadOid",
				);
			}
			const head = parseGithubOid(expected, "expectedProviderHeadOid");
			if (head !== target.headCommitOid) {
				throw reviewError(
					"provider-drift",
					"pending review head does not match the pull request head",
				);
			}
			const { owner, name } = parseRepositoryName(target.repository);
			const fields: { flag: "-f" | "-F"; name: string; value: string }[] = [
				{
					flag: "-f",
					name: "event",
					value: decisionEvent(input.pending.decision),
				},
				{ flag: "-f", name: "commit_id", value: head },
				{ flag: "-f", name: "body", value: input.correlationMarker },
			];
			input.pending.orderedInlineComments.forEach((comment, index) => {
				fields.push(
					{ flag: "-f", name: `comments[${index}][path]`, value: comment.path },
					{ flag: "-f", name: `comments[${index}][body]`, value: comment.body },
					{
						flag: "-f",
						name: `comments[${index}][side]`,
						value: commentSide(comment.side),
					},
				);
				if (comment.line !== undefined) {
					fields.push({
						flag: "-F",
						name: `comments[${index}][line]`,
						value: String(comment.line),
					});
				}
				if (comment.startLine !== undefined) {
					fields.push({
						flag: "-F",
						name: `comments[${index}][start_line]`,
						value: String(comment.startLine),
					});
				}
			});
			const created = parseSubmittedReview(
				await ghRest(
					target.host,
					"POST",
					`/repos/${owner}/${name}/pulls/${target.number}/reviews`,
					fields,
				),
			);
			return {
				providerReviewId: created.id,
				receiptHash: receiptHashFor(
					"review",
					created.id,
					created.nodeId,
					created.commitId,
				),
			};
		},

		async replyToThread(input) {
			const identity = await resolveThreadIdentity(input.thread);
			const { owner, name } = parseRepositoryName(identity.target.repository);
			const existing = parseGithubReviewComment(
				await ghRest(
					identity.target.host,
					"GET",
					`/repos/${owner}/${name}/pulls/comments/${identity.commentId}`,
				),
			);
			if (existing.inReplyToId !== undefined) {
				throw reviewError(
					"malformed-input",
					"replies are only allowed on a top-level review-comment thread",
				);
			}
			const created = parseGithubReviewComment(
				await ghRest(
					identity.target.host,
					"POST",
					`/repos/${owner}/${name}/pulls/${identity.target.number}/comments/${existing.id}/replies`,
					[
						{
							flag: "-f",
							name: "body",
							value: `${input.body}\n\n${input.correlationMarker}`,
						},
					],
				),
			);
			return { providerCommentId: created.id };
		},

		async resolveThread(input) {
			const identity = await resolveThreadIdentity(input.thread);
			let nodeId = identity.nodeId;
			if (nodeId === undefined || !nodeId.startsWith("PRRT_")) {
				const threads = await provider.fetchPullRequestThreads({
					target: identity.target,
				});
				nodeId = threads.find(
					(item) => item.provider?.reviewCommentId === identity.commentId,
				)?.provider?.nodeId;
			}
			if (nodeId === undefined) {
				throw reviewError(
					"unsupported-capability",
					"thread resolution requires a GraphQL review thread id",
				);
			}
			await ghGraphql(identity.target.host, RESOLVE_QUERY, {
				threadId: nodeId,
			});
		},

		async unresolveThread(input) {
			const identity = await resolveThreadIdentity(input.thread);
			let nodeId = identity.nodeId;
			if (nodeId === undefined || !nodeId.startsWith("PRRT_")) {
				const threads = await provider.fetchPullRequestThreads({
					target: identity.target,
				});
				nodeId = threads.find(
					(item) => item.provider?.reviewCommentId === identity.commentId,
				)?.provider?.nodeId;
			}
			if (nodeId === undefined) {
				throw reviewError(
					"unsupported-capability",
					"thread resolution requires a GraphQL review thread id",
				);
			}
			await ghGraphql(identity.target.host, UNRESOLVE_QUERY, {
				threadId: nodeId,
			});
		},

		async reconcile(input) {
			const target = requireBound();
			if (
				input.operation === "resolve-review-thread" ||
				input.operation === "unresolve-review-thread"
			) {
				return { matches: 0 };
			}
			const expected = githubReviewCorrelationKey(
				input.commandId,
				input.digest,
			);
			const matches = new Map<string, string>();
			if (input.operation === "publish-review") {
				for (const review of await loadReviews(target)) {
					if (
						!collectGithubReviewCorrelationKeys(review.body).includes(expected)
					) {
						continue;
					}
					matches.set(
						`review:${review.id}`,
						receiptHashFor("review", review.id, review.nodeId, review.commitId),
					);
				}
			} else if (input.operation === "reply-review-thread") {
				for (const comment of await loadRestComments(target)) {
					if (
						!collectGithubReviewCorrelationKeys(comment.body).includes(expected)
					) {
						continue;
					}
					matches.set(
						`comment:${comment.id}`,
						receiptHashFor(
							"comment",
							comment.id,
							comment.nodeId,
							comment.commitId,
						),
					);
				}
			} else {
				return { matches: 0 };
			}
			if (matches.size > 1) {
				throw reviewError(
					"ambiguous-outcome",
					"multiple GitHub artifacts share the same correlation marker",
					{ matches: matches.size },
				);
			}
			const [receiptHash] = matches.values();
			return receiptHash === undefined
				? { matches: 0 }
				: { matches: 1, receiptHash };
		},

		async capabilities(input) {
			const target = bind(input.target);
			const enterprise = target.host !== "github.com";
			let graphql = false;
			let viewerLogin: string | undefined;
			let authorLogin: string | undefined;
			let permission = "";
			try {
				const { owner, name } = parseRepositoryName(target.repository);
				const snapshot = parseGithubCapabilitySnapshot(
					await ghGraphql(target.host, CAPABILITIES_QUERY, {
						owner,
						name,
						number: target.number,
					}),
				);
				graphql = true;
				viewerLogin = snapshot.viewerLogin;
				authorLogin = snapshot.authorLogin;
				permission = snapshot.viewerPermission;
			} catch (error) {
				if (error instanceof Error && isTimeoutText(error.message)) throw error;
				const { owner, name } = parseRepositoryName(target.repository);
				viewerLogin = parseGithubUser(
					await ghRest(target.host, "GET", "/user"),
				).login;
				const repo = parseGithubRepository(
					await ghRest(target.host, "GET", `/repos/${owner}/${name}`),
				);
				const pull = parseGithubPullRequest(
					await ghRest(
						target.host,
						"GET",
						`/repos/${owner}/${name}/pulls/${target.number}`,
					),
				);
				authorLogin = pull.authorLogin;
				permission = repo.permissions.admin
					? "ADMIN"
					: repo.permissions.maintain
						? "MAINTAIN"
						: repo.permissions.push
							? "WRITE"
							: repo.permissions.triage
								? "TRIAGE"
								: "READ";
			}
			const write =
				permission === "ADMIN" ||
				permission === "MAINTAIN" ||
				permission === "WRITE";
			const actorMayApprove =
				write &&
				viewerLogin !== undefined &&
				viewerLogin.toLowerCase() !== (authorLogin ?? "").toLowerCase();
			const decisions: ReviewDecision[] = actorMayApprove
				? ["comment", "approve", "request-changes"]
				: ["comment"];
			const body = {
				kind: "github" as const,
				host: target.host,
				lineComments: true,
				rangeComments: graphql,
				fileComments: true,
				reviewComments: true,
				pendingReviews: graphql,
				decisions,
				threadReplies: true,
				threadResolution: graphql,
				importExisting: true,
				outdatedMetadata: true,
				enterprise,
				actorMayApprove,
			};
			return { ...body, fingerprint: capabilityFingerprint(body) };
		},
	};

	return provider;
}
