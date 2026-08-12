import { reviewError } from "./review-errors.js";

// public-contract: every GitHub REST call pins this header value.
export const GITHUB_REST_API_VERSION = "2022-11-28";

export const GITHUB_OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu;
export const GITHUB_NODE_ID = /^[A-Za-z0-9+/=_-]{8,256}$/u;
export const GITHUB_REPO_SEGMENT = /^[A-Za-z0-9._-]+$/u;

export interface GithubUserRef {
	readonly login: string;
}

export interface GithubPullRequest {
	readonly nodeId: string;
	readonly number: number;
	readonly baseRef: string;
	readonly headRef: string;
	readonly baseOid: string;
	readonly headOid: string;
	readonly authorLogin?: string;
}

export interface GithubCompare {
	readonly mergeBaseOid: string;
}

export interface GithubReview {
	readonly id: string;
	readonly nodeId: string;
	readonly body: string;
	readonly state: string;
	readonly commitId: string;
}

export interface GithubReviewComment {
	readonly id: string;
	readonly nodeId: string;
	readonly body: string;
	readonly path: string;
	readonly commitId: string;
	readonly userLogin?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly inReplyToId?: string;
	readonly line?: number;
	readonly startLine?: number;
	readonly originalLine?: number;
	readonly side: "LEFT" | "RIGHT";
	readonly subjectType: "line" | "file";
	readonly outdated: boolean;
}

export interface GithubRepositoryPermissions {
	readonly admin: boolean;
	readonly maintain: boolean;
	readonly push: boolean;
	readonly triage: boolean;
	readonly pull: boolean;
}

export interface GithubRepository {
	readonly fullName: string;
	readonly permissions: GithubRepositoryPermissions;
}

export interface GithubGraphqlThreadComment {
	readonly id: string;
	readonly databaseId: string;
	readonly body: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly outdated: boolean;
	readonly path: string;
	readonly replyToDatabaseId?: string;
	readonly line?: number;
	readonly startLine?: number;
	readonly originalLine?: number;
	readonly side: "LEFT" | "RIGHT";
	readonly subjectType: "line" | "file";
}

export interface GithubGraphqlThread {
	readonly nodeId: string;
	readonly isResolved: boolean;
	readonly isOutdated: boolean;
	readonly comments: readonly GithubGraphqlThreadComment[];
	readonly hasMoreThreads: boolean;
	readonly nextThreadCursor?: string;
}

export interface GithubGraphqlThreadPage {
	readonly threads: readonly GithubGraphqlThread[];
	readonly hasNextPage: boolean;
	readonly endCursor?: string;
}

export interface GithubCapabilitySnapshot {
	readonly viewerLogin: string;
	readonly authorLogin?: string;
	readonly viewerPermission: string;
	readonly viewerCanApplySuggestion: boolean;
}

function record(value: unknown, field: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw reviewError("malformed-input", `${field} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw reviewError("malformed-input", `${field} must be a nonempty string`);
	}
	return value;
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
	if (typeof value === "number" && Number.isSafeInteger(value)) return value;
	if (typeof value === "string" && /^-?\d+$/u.test(value)) return Number(value);
	throw reviewError("malformed-input", `${field} must be an integer`);
}

function optionalNumber(value: unknown, field: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	return requiredNumber(value, field);
}

function requiredOid(value: unknown, field: string): string {
	const oid = requiredString(value, field);
	if (!GITHUB_OID.test(oid)) {
		throw reviewError("malformed-input", `${field} must be a git object id`);
	}
	return oid.toLowerCase();
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "boolean") {
		throw reviewError("malformed-input", `${field} must be a boolean`);
	}
	return value;
}

function loginOf(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	return requiredString(record(value, field).login, `${field}.login`);
}

function unwrapData(value: unknown): Record<string, unknown> {
	const body = record(value, "github payload");
	return body.data === undefined ? body : record(body.data, "data");
}

export function parseGithubOid(value: string, field: string): string {
	return requiredOid(value, field);
}

export function parseGithubNodeId(value: string, field: string): string {
	const nodeId = requiredString(value, field);
	if (!GITHUB_NODE_ID.test(nodeId)) {
		throw reviewError("malformed-input", `${field} is not a GitHub node id`);
	}
	return nodeId;
}

export function parseRepositoryName(value: string): {
	readonly owner: string;
	readonly name: string;
} {
	const parts = value.split("/");
	if (parts.length !== 2) {
		throw reviewError("malformed-input", "repository must be owner/name");
	}
	const [owner, name] = parts;
	if (
		owner === undefined ||
		name === undefined ||
		!GITHUB_REPO_SEGMENT.test(owner) ||
		!GITHUB_REPO_SEGMENT.test(name) ||
		owner.includes("..") ||
		name.includes("..") ||
		owner.length > 39 ||
		name.length > 100
	) {
		throw reviewError("malformed-input", "repository owner/name is invalid");
	}
	return { owner, name };
}

function parseSide(value: unknown): "LEFT" | "RIGHT" {
	if (value === undefined || value === null || value === "RIGHT")
		return "RIGHT";
	if (value === "LEFT") return "LEFT";
	throw reviewError("malformed-input", "comment side must be LEFT or RIGHT");
}

function parseSubjectType(value: unknown): "line" | "file" {
	if (value === undefined || value === null) return "line";
	const normalized = String(value).toLowerCase();
	if (normalized === "line") return "line";
	if (normalized === "file") return "file";
	throw reviewError("malformed-input", "subject_type must be line or file");
}

export function parseGithubPullRequest(value: unknown): GithubPullRequest {
	const body = record(value, "pull request");
	const base = record(body.base, "pull request.base");
	const head = record(body.head, "pull request.head");
	const authorLogin = loginOf(body.user, "pull request.user");
	return {
		nodeId: parseGithubNodeId(
			requiredString(body.node_id, "pull request.node_id"),
			"pull request.node_id",
		),
		number: requiredNumber(body.number, "pull request.number"),
		baseRef: requiredString(base.ref, "pull request.base.ref"),
		headRef: requiredString(head.ref, "pull request.head.ref"),
		baseOid: requiredOid(base.sha, "pull request.base.sha"),
		headOid: requiredOid(head.sha, "pull request.head.sha"),
		...(authorLogin === undefined ? {} : { authorLogin }),
	};
}

export function parseGithubCompare(value: unknown): GithubCompare {
	const body = record(value, "compare");
	const mergeBase = record(body.merge_base_commit, "merge_base_commit");
	return { mergeBaseOid: requiredOid(mergeBase.sha, "merge_base_commit.sha") };
}

export function parseGithubReview(value: unknown): GithubReview {
	const body = record(value, "review");
	return {
		id: String(requiredNumber(body.id, "review.id")),
		nodeId: parseGithubNodeId(
			requiredString(body.node_id, "review.node_id"),
			"review.node_id",
		),
		body: typeof body.body === "string" ? body.body : "",
		state: requiredString(body.state, "review.state"),
		commitId: requiredOid(body.commit_id, "review.commit_id"),
	};
}

export function parseGithubReviews(value: unknown): readonly GithubReview[] {
	if (!Array.isArray(value)) {
		throw reviewError("malformed-input", "reviews must be an array");
	}
	return value.map((item) => parseGithubReview(item));
}

export function parseGithubReviewComment(value: unknown): GithubReviewComment {
	const body = record(value, "review comment");
	const inReplyTo = optionalNumber(body.in_reply_to_id, "in_reply_to_id");
	const line = optionalNumber(body.line, "line");
	const startLine = optionalNumber(body.start_line, "start_line");
	const originalLine = optionalNumber(body.original_line, "original_line");
	const userLogin = loginOf(body.user, "review comment.user");
	const outdated =
		optionalBoolean(body.outdated, "outdated") ??
		(body.position === null && parseSubjectType(body.subject_type) === "line");
	return {
		id: String(requiredNumber(body.id, "review comment.id")),
		nodeId: parseGithubNodeId(
			requiredString(body.node_id, "review comment.node_id"),
			"review comment.node_id",
		),
		body: typeof body.body === "string" ? body.body : "",
		path: requiredString(body.path, "review comment.path"),
		commitId: requiredOid(body.commit_id, "review comment.commit_id"),
		createdAt: requiredString(body.created_at, "created_at"),
		updatedAt: requiredString(body.updated_at, "updated_at"),
		side: parseSide(body.side),
		subjectType: parseSubjectType(body.subject_type),
		outdated,
		...(userLogin === undefined ? {} : { userLogin }),
		...(inReplyTo === undefined ? {} : { inReplyToId: String(inReplyTo) }),
		...(line === undefined ? {} : { line }),
		...(startLine === undefined ? {} : { startLine }),
		...(originalLine === undefined ? {} : { originalLine }),
	};
}

export function parseGithubReviewComments(
	value: unknown,
): readonly GithubReviewComment[] {
	if (!Array.isArray(value)) {
		throw reviewError("malformed-input", "review comments must be an array");
	}
	return value.map((item) => parseGithubReviewComment(item));
}

export function parseGithubUser(value: unknown): GithubUserRef {
	const body = record(value, "user");
	return { login: requiredString(body.login, "user.login") };
}

export function parseGithubRepository(value: unknown): GithubRepository {
	const body = record(value, "repository");
	const permissions = record(body.permissions, "repository.permissions");
	return {
		fullName: requiredString(body.full_name, "repository.full_name"),
		permissions: {
			admin: optionalBoolean(permissions.admin, "permissions.admin") === true,
			maintain:
				optionalBoolean(permissions.maintain, "permissions.maintain") === true,
			push: optionalBoolean(permissions.push, "permissions.push") === true,
			triage:
				optionalBoolean(permissions.triage, "permissions.triage") === true,
			pull: optionalBoolean(permissions.pull, "permissions.pull") === true,
		},
	};
}

function parseGraphqlComment(value: unknown): GithubGraphqlThreadComment {
	const body = record(value, "graphql comment");
	const replyTo =
		body.replyTo === undefined || body.replyTo === null
			? undefined
			: String(
					requiredNumber(
						record(body.replyTo, "replyTo").databaseId,
						"replyTo.databaseId",
					),
				);
	const line = optionalNumber(body.line, "line");
	const startLine = optionalNumber(body.startLine, "startLine");
	const originalLine = optionalNumber(body.originalLine, "originalLine");
	return {
		id: parseGithubNodeId(requiredString(body.id, "comment.id"), "comment.id"),
		databaseId: String(requiredNumber(body.databaseId, "comment.databaseId")),
		body: typeof body.body === "string" ? body.body : "",
		createdAt: requiredString(body.createdAt, "createdAt"),
		updatedAt: requiredString(body.updatedAt, "updatedAt"),
		outdated: optionalBoolean(body.outdated, "outdated") === true,
		path: requiredString(body.path, "path"),
		side: parseSide(body.diffSide),
		subjectType: parseSubjectType(body.subjectType),
		...(replyTo === undefined ? {} : { replyToDatabaseId: replyTo }),
		...(line === undefined ? {} : { line }),
		...(startLine === undefined ? {} : { startLine }),
		...(originalLine === undefined ? {} : { originalLine }),
	};
}

export function parseGithubGraphqlThreadPage(
	value: unknown,
): GithubGraphqlThreadPage {
	const data = unwrapData(value);
	const repository = record(data.repository, "repository");
	const pullRequest = record(repository.pullRequest, "pullRequest");
	const connection = record(pullRequest.reviewThreads, "reviewThreads");
	const pageInfo = record(connection.pageInfo, "pageInfo");
	if (!Array.isArray(connection.nodes)) {
		throw reviewError(
			"malformed-input",
			"reviewThreads.nodes must be an array",
		);
	}
	const endCursor = optionalString(pageInfo.endCursor, "endCursor");
	return {
		hasNextPage: optionalBoolean(pageInfo.hasNextPage, "hasNextPage") === true,
		...(endCursor === undefined ? {} : { endCursor }),
		threads: connection.nodes.map((node) => {
			const thread = record(node, "reviewThread");
			const comments = record(thread.comments, "comments");
			if (!Array.isArray(comments.nodes)) {
				throw reviewError("malformed-input", "comments.nodes must be an array");
			}
			const commentPage = record(comments.pageInfo, "comments.pageInfo");
			const nextThreadCursor = optionalString(
				commentPage.endCursor,
				"comments.endCursor",
			);
			return {
				nodeId: parseGithubNodeId(
					requiredString(thread.id, "thread.id"),
					"thread.id",
				),
				isResolved: optionalBoolean(thread.isResolved, "isResolved") === true,
				isOutdated: optionalBoolean(thread.isOutdated, "isOutdated") === true,
				comments: comments.nodes.map((item) => parseGraphqlComment(item)),
				hasMoreThreads:
					optionalBoolean(commentPage.hasNextPage, "comments.hasNextPage") ===
					true,
				...(nextThreadCursor === undefined ? {} : { nextThreadCursor }),
			};
		}),
	};
}

export function parseGithubCapabilitySnapshot(
	value: unknown,
): GithubCapabilitySnapshot {
	const data = unwrapData(value);
	const viewer = record(data.viewer, "viewer");
	const repository = record(data.repository, "repository");
	const pullRequest = record(repository.pullRequest, "pullRequest");
	const authorLogin = loginOf(pullRequest.author, "author");
	return {
		viewerLogin: requiredString(viewer.login, "viewer.login"),
		viewerPermission: requiredString(
			repository.viewerPermission,
			"viewerPermission",
		),
		viewerCanApplySuggestion:
			optionalBoolean(
				pullRequest.viewerCanApplySuggestion,
				"viewerCanApplySuggestion",
			) === true,
		...(authorLogin === undefined ? {} : { authorLogin }),
	};
}

export function parseSubmittedReview(value: unknown): GithubReview {
	return parseGithubReview(value);
}
