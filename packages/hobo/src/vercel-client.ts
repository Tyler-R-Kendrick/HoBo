// @hobo/hobo — the REAL Vercel Create Deployment client (composition/app layer).
//
// This forms the request for Vercel's Create Deployment endpoint and parses the
// deployment URL back out. It is the ONE cloud actually reachable from HoBo's own
// pipeline: when `VERCEL_TOKEN` is present, `hobo up` drives this against the live
// API; when absent, compose falls back to the in-memory Pulumi-backed provider.
//
// Grounded in Vercel's REST API — Create a new deployment:
//   POST https://api.vercel.com/v13/deployments
//   Authorization: Bearer <token>
//   Content-Type: application/json
//   body: { name, project?, files:[{file,data,encoding}], target?, projectSettings? }
//   (docs: vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment)
//
// Create Deployment answers 404 `{"error":{"code":"not_found","message":"Project
// not found"}}` when the project it names does not exist. For that case,
// `createProject` calls Create a new project:
//   POST https://api.vercel.com/v9/projects   body: { name }   (409 when the name is taken)
//   (docs: vercel.com/docs/rest-api/reference/endpoints/projects/create-a-new-project,
//   whose current version is /v11). /v9 is the version @hobo/provider-vercel's
//   project resolver speaks, and `/v9/projects` is the prefix a credential
//   binding's scope already names.
//
// `fetch` is INJECTED so tests exercise the exact request formation against a
// mocked transport with no network. HONEST SCOPE: the live call is credential-
// gated and NOT exercised in this sandbox — only the request formation + response
// parsing are tested (against a mocked fetch).

// A single file in the deployment payload. `data` is the file content; when
// `encoding` is "base64" the content is base64-encoded (Vercel's inline-files
// contract). `file` is the POSIX path within the deployment.
import { redactProviderText } from "@hobo/provider-vercel";

import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonObject,
} from "./json.js";

interface VercelFetchInit {
	readonly method?: string;
	readonly headers?: { readonly [header: string]: string };
	readonly body?: string;
}

export interface VercelDeploymentFile {
	readonly file: string;
	readonly data: string;
	readonly encoding?: "base64" | "utf-8";
}

export interface CreateDeploymentInput {
	// The deployment name (Vercel `name`, required).
	readonly name: string;
	// The inline file tree to deploy (Vercel `files`).
	readonly files: readonly VercelDeploymentFile[];
	// The deployment target — "production" or "preview" (Vercel `target`).
	readonly target?: string;
	// The project name/id (Vercel `project`); defaults to `name` when omitted.
	readonly project?: string;
	// Optional project build settings (Vercel `projectSettings`). Defaults to a
	// zero-config static + Node-functions deploy (framework: null), matching the
	// committed hello-bindle artifact which needs no build step.
	readonly projectSettings?: JsonObject;
}

export interface VercelProjectResult {
	// The project id (Vercel `id`); empty when the create was answered 409.
	readonly id: string;
	// The project name (Vercel `name`).
	readonly name: string;
	// True when this call created the project; false when it already existed.
	readonly created: boolean;
}

export interface VercelDeploymentResult {
	// The deployment URL, normalized to include the https:// scheme (Vercel returns
	// the bare host in `url`).
	readonly url: string;
	// The deployment id (Vercel `id`).
	readonly id: string;
	// The deployment readiness state when present (Vercel `readyState`).
	readonly readyState?: string;
	// The full parsed response body, for callers that need more than url/id.
	readonly raw: JsonValue;
}

// The minimal fetch surface this client depends on — a subset of the WHATWG
// `fetch`. Injecting this (rather than the global) keeps the client testable with
// a mock transport and free of a DOM/undici lib dependency.
export interface VercelFetchResponse {
	readonly ok: boolean;
	readonly status: number;
	text(): Promise<string>;
	json(): Promise<JsonValue>;
}

// A request with nothing to send carries no `body`, as `fetch` requires of a GET.
export type VercelFetch = (
	url: string,
	init: {
		readonly method: string;
		readonly headers: Record<string, string>;
		readonly body?: string;
	},
) => Promise<VercelFetchResponse>;

// A refusal from the Vercel API: a non-2xx status. `code` and `apiMessage` are
// Vercel's `error.code` and `error.message` when the body carried them; `message`
// names the call, the status and the body. `message` and `apiMessage` are
// refusal text (`refusalText`): redacted, and cut at 500 characters.
export class VercelApiError extends Error {
	readonly status: number;
	readonly code: string | undefined;
	readonly apiMessage: string | undefined;

	constructor(
		message: string,
		status: number,
		code?: string,
		apiMessage?: string,
	) {
		super(message);
		this.name = "VercelApiError";
		this.status = status;
		this.code = code;
		this.apiMessage = apiMessage;
	}
}

// Create Deployment's answer when the project it names does not exist: 404,
// `{"error":{"code":"not_found","message":"Project not found"}}`.
export function isProjectNotFound(error: Error): boolean {
	return (
		error instanceof VercelApiError &&
		error.status === 404 &&
		error.code === "not_found" &&
		/project not found/iu.test(error.apiMessage ?? "")
	);
}

export interface VercelClientOptions {
	// The Vercel access token, sent as `Authorization: Bearer <token>`.
	readonly token: string;
	// The transport. Defaults to the global `fetch`; injected in tests.
	readonly fetch?: VercelFetch;
	// The team id, sent as the `teamId` query parameter when the token is a team
	// token (Vercel `teamId`).
	readonly teamId?: string;
	// The API base URL. Defaults to https://api.vercel.com (override for tests).
	readonly baseUrl?: string;
}

export interface VercelClient {
	createDeployment(
		input: CreateDeploymentInput,
	): Promise<VercelDeploymentResult>;
	// Create the project `name`. A 409 (the name is taken: someone made it
	// meanwhile) answers `created: false` rather than failing.
	createProject(name: string): Promise<VercelProjectResult>;
}

const DEFAULT_BASE_URL = "https://api.vercel.com";

// The global `fetch` presented through the injectable `VercelFetch` shape. Node
// 18+ and modern runtimes expose a global `fetch`; we adapt it without importing
// DOM lib types.
const globalFetch: VercelFetch = (url, init) => {
	const fetchImpl =
		// SAFETY: assertion required at this I/O or test boundary.
		(
			globalThis as {
				fetch?: (
					input: string,
					init: VercelFetchInit,
				) => Promise<VercelFetchResponse>;
			}
		).fetch;
	if (!(fetchImpl instanceof Function)) {
		throw new Error(
			"vercel-client: no global fetch available; inject one via createVercelClient({ fetch })",
		);
	}
	return fetchImpl(url, init);
};

function normalizeUrl(raw: JsonValue | undefined): string {
	if (!isJsonString(raw) || raw.length === 0) {
		return "";
	}
	return raw.startsWith("http://") || raw.startsWith("https://")
		? raw
		: `https://${raw}`;
}

// The most of a refusal's text an error carries: `message` and `apiMessage` are
// each cut at this many characters, and a `…` marks the cut.
const REFUSAL_TEXT_LIMIT = 500;

// A response body can echo the request, Authorization header included, and the
// executor persists an error's message (`exec.Failed.reason`). So the client's
// own token, and anything bearer- or credential-shaped, becomes `[redacted]`
// (`redactProviderText` is the redaction @hobo/provider-vercel's resolvers
// use), and the text is cut at REFUSAL_TEXT_LIMIT characters.
function refusalText(text: string, token: string): string {
	return redactProviderText(
		text.replaceAll(token, "[redacted]"),
		REFUSAL_TEXT_LIMIT,
	);
}

async function failure(
	what: string,
	response: VercelFetchResponse,
	token: string,
): Promise<VercelApiError> {
	const detail = await response.text().catch(() => "");
	const error = parseJsonObject(detail).error;
	const code =
		isJsonObject(error) && isJsonString(error.code) ? error.code : undefined;
	const apiMessage =
		isJsonObject(error) && isJsonString(error.message)
			? refusalText(error.message, token)
			: undefined;
	return new VercelApiError(
		refusalText(
			`vercel-client: ${what} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
			token,
		),
		response.status,
		code,
		apiMessage,
	);
}

// The JSON object a 2xx answer carries, or `{}` when it carries something else.
async function payloadOf(response: VercelFetchResponse): Promise<JsonObject> {
	const parsed = await response.json();
	return isJsonObject(parsed) ? parsed : {};
}

// Create the REAL Vercel deployment client. No network call happens at
// construction; a request is formed and sent only by a method call.
export function createVercelClient(options: VercelClientOptions): VercelClient {
	const { token } = options;
	if (!token) {
		throw new TypeError("createVercelClient: token is required");
	}
	const fetchImpl = options.fetch ?? globalFetch;
	const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
	const query =
		options.teamId !== undefined
			? `?teamId=${encodeURIComponent(options.teamId)}`
			: "";
	// One JSON POST to `path` under the base URL, team-scoped like every other.
	const post = (path: string, body: string): Promise<VercelFetchResponse> =>
		fetchImpl(`${baseUrl}${path}${query}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body,
		});

	return {
		async createProject(name: string): Promise<VercelProjectResult> {
			const made = await post("/v9/projects", JSON.stringify({ name }));
			if (made.status === 409) return { id: "", name, created: false };
			if (!made.ok) throw await failure("create project", made, token);
			const payload = await payloadOf(made);
			return {
				id: isJsonString(payload.id) ? payload.id : "",
				name: isJsonString(payload.name) ? payload.name : name,
				created: true,
			};
		},

		async createDeployment(
			input: CreateDeploymentInput,
		): Promise<VercelDeploymentResult> {
			const body = {
				name: input.name,
				project: input.project ?? input.name,
				files: input.files.map((f) => ({
					file: f.file,
					data: f.data,
					encoding: f.encoding ?? "base64",
				})),
				...(input.target !== undefined ? { target: input.target } : undefined),
				projectSettings: input.projectSettings ?? { framework: null },
			};

			const response = await post("/v13/deployments", JSON.stringify(body));

			if (!response.ok) {
				throw await failure("create deployment", response, token);
			}

			const payload = await payloadOf(response);
			const id = isJsonString(payload.id) ? payload.id : "";
			return {
				url: normalizeUrl(payload.url),
				id,
				...(isJsonString(payload.readyState)
					? { readyState: payload.readyState }
					: undefined),
				raw: payload,
			};
		},
	};
}
