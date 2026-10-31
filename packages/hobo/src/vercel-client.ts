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
// and, for `ensureProject`, Find a project by id or name and Create a new project:
//   GET  https://api.vercel.com/v9/projects/{idOrName}   (404 when there is none)
//   POST https://api.vercel.com/v9/projects   body: { name }   (409 when the name is taken)
//   (docs: vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name
//    and .../projects/create-a-new-project, whose current version is /v11). /v9 is
//   the version @hobo/provider-vercel's project resolver speaks, and one
//   `/v9/projects` prefix is the scope a credential binding already names for it.
//
// `fetch` is INJECTED so tests exercise the exact request formation against a
// mocked transport with no network. HONEST SCOPE: the live call is credential-
// gated and NOT exercised in this sandbox — only the request formation + response
// parsing are tested (against a mocked fetch).

// A single file in the deployment payload. `data` is the file content; when
// `encoding` is "base64" the content is base64-encoded (Vercel's inline-files
// contract). `file` is the POSIX path within the deployment.
import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
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
	// The project id (Vercel `id`).
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

// A request with nothing to send (the project lookup, a GET) carries `body: ""`;
// the default transport sends no body for it, as `fetch` requires of a GET.
export type VercelFetch = (
	url: string,
	init: {
		readonly method: string;
		readonly headers: Record<string, string>;
		readonly body: string;
	},
) => Promise<VercelFetchResponse>;

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
	// Make sure the project `name` exists, creating it when Vercel has none:
	// a lookup, and on 404 a create. Idempotent: a project that exists is left as
	// it is, and a create answered 409 (made meanwhile) is looked up again.
	ensureProject(name: string): Promise<VercelProjectResult>;
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
	// `fetch` refuses a GET or HEAD that carries a body, even an empty one.
	const bodiless = init.method === "GET" || init.method === "HEAD";
	return fetchImpl(
		url,
		bodiless ? { method: init.method, headers: init.headers } : init,
	);
};

function normalizeUrl(raw: JsonValue | undefined): string {
	if (!isJsonString(raw) || raw.length === 0) {
		return "";
	}
	return raw.startsWith("http://") || raw.startsWith("https://")
		? raw
		: `https://${raw}`;
}

async function failure(
	what: string,
	response: VercelFetchResponse,
): Promise<Error> {
	const detail = await response.text().catch(() => "");
	return new Error(
		`vercel-client: ${what} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
	);
}

async function projectFrom(
	response: VercelFetchResponse,
	name: string,
	created: boolean,
): Promise<VercelProjectResult> {
	const parsed = await response.json();
	const payload = isJsonObject(parsed) ? parsed : {};
	return {
		id: isJsonString(payload.id) ? payload.id : "",
		name: isJsonString(payload.name) ? payload.name : name,
		created,
	};
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
	// One request to `path` under the base URL, team-scoped like every other.
	const send = (
		method: "GET" | "POST",
		path: string,
		body?: string,
	): Promise<VercelFetchResponse> =>
		fetchImpl(`${baseUrl}${path}${query}`, {
			method,
			headers:
				body === undefined
					? { Authorization: `Bearer ${token}` }
					: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
			body: body ?? "",
		});
	const lookUp = (name: string): Promise<VercelFetchResponse> =>
		send("GET", `/v9/projects/${encodeURIComponent(name)}`);

	return {
		async ensureProject(name: string): Promise<VercelProjectResult> {
			const found = await lookUp(name);
			if (found.ok) return projectFrom(found, name, false);
			if (found.status !== 404) throw await failure("look up project", found);
			const made = await send("POST", "/v9/projects", JSON.stringify({ name }));
			if (made.ok) return projectFrom(made, name, true);
			if (made.status !== 409) throw await failure("create project", made);
			// Taken between the lookup and the create: it exists, so read it.
			const again = await lookUp(name);
			if (again.ok) return projectFrom(again, name, false);
			throw await failure("look up project", again);
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

			const response = await send(
				"POST",
				"/v13/deployments",
				JSON.stringify(body),
			);

			if (!response.ok) {
				throw await failure("create deployment", response);
			}

			const parsed = await response.json();
			const payload = isJsonObject(parsed) ? parsed : {};
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
