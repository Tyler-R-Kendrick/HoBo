/**
 * HTTP App Kit entrypoint collection + Session Replay wrap (ADR-0137).
 * Kept free of Yard/compose imports so tests and agents can exercise
 * Bindle Kit replay without loading the full host graph.
 *
 * **App Kit** (not "membrane type"): Bindle-declared application surfaces
 * (api, web, service, ui, …). Every HTTP App Kit is Session-Replay wrapped.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BindleDefinition } from "@hobo/bindles";
import {
	renderEvidenceOverlayBridge,
	renderEvidenceOverlayWrapper,
} from "@hobo/code";
import {
	applySessionReplayToEntrypoints,
	type BindleSessionReplayPlan,
	type DualFixtureStore,
} from "@hobo/replay";

export type FetchHandler = (input: Request) => Response | Promise<Response>;

export interface ServableEntrypoint {
	readonly name: string;
	readonly kind: string;
	readonly handler: FetchHandler;
	readonly external: boolean;
}

export type ListServableEntrypointsResult = {
	readonly entrypoints: ServableEntrypoint[];
	readonly sessionReplay: BindleSessionReplayPlan;
	readonly sessionReplayStore: DualFixtureStore;
};

type ServableEntrypointOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly stationId?: string;
	readonly evidenceControlsUrl?: string;
};

const EVIDENCE_RAW_PARAM = "__hobo_evidence_raw";
const STALE_BODY_HEADERS = [
	"content-length",
	"etag",
	"integrity",
	"content-integrity",
	"content-md5",
	"digest",
	"content-digest",
	"repr-digest",
] as const;

/** HTTP App Kits that host fetch handlers on local Yard / Camp. */
function isHttpAppKit(kind: string): boolean {
	return (
		kind === "api" || kind === "web" || kind === "service" || kind === "ui"
	);
}

/**
 * External exposure policy.
 * Default: only `web` is public (ingress). `api`/`service` stay private mesh.
 */
export function isExternalComponent(
	kind: string,
	annotations: readonly {
		readonly option: string;
		readonly config: Record<string, unknown>;
	}[],
): boolean {
	for (const annotation of annotations) {
		if (annotation.option !== "endpoint") continue;
		if (typeof annotation.config.external === "boolean") {
			return annotation.config.external;
		}
	}
	return kind === "web";
}

function asFetchHandler(value: unknown): FetchHandler | null {
	if (typeof value === "function") {
		return value as FetchHandler;
	}
	return null;
}

/**
 * Collect api/web/service entrypoints and wrap replayable web surfaces.
 */
export function listServableEntrypoints(
	definition: BindleDefinition,
	options: ServableEntrypointOptions = {},
): ServableEntrypoint[] {
	return listServableEntrypointsWithReplay(definition, options).entrypoints;
}

export function listServableEntrypointsWithReplay(
	definition: BindleDefinition,
	options: ServableEntrypointOptions = {},
): ListServableEntrypointsResult {
	const entries: ServableEntrypoint[] = [];
	for (const [name, record] of Object.entries(definition.resources)) {
		if (!isHttpAppKit(record.kind)) continue;
		const thunk = definition.entrypoint(name);
		if (typeof thunk !== "function") continue;
		const resolved = asFetchHandler(thunk());
		if (resolved === null) continue;
		entries.push({
			name,
			kind: record.kind,
			handler: resolved,
			external: isExternalComponent(record.kind, record.annotations),
		});
	}
	const rank = (entry: ServableEntrypoint) => {
		if (entry.external) return 0;
		if (entry.kind === "api") return 1;
		return 2;
	};
	const sorted = entries.sort((a, b) => rank(a) - rank(b));
	const applied = applySessionReplayToEntrypoints(sorted, definition, {
		env: options.env ?? process.env,
		...(options.stationId !== undefined
			? { stationId: options.stationId }
			: {}),
	});
	const env = options.env ?? process.env;
	const controlsUrl =
		options.evidenceControlsUrl ??
		env.HOBO_CODE_EVIDENCE_CONTROLS_URL ??
		discoveredEvidenceControlsUrl(env);
	return {
		entrypoints:
			controlsUrl === undefined || controlsUrl.length === 0
				? [...applied.entrypoints]
				: applyEvidenceOverlay(applied.entrypoints, controlsUrl),
		sessionReplay: applied.plan,
		sessionReplayStore: applied.store,
	};
}

function applyEvidenceOverlay(
	entrypoints: readonly ServableEntrypoint[],
	controlsUrl: string,
): ServableEntrypoint[] {
	return entrypoints.map((entry) => ({
		...entry,
		handler: async (request) => {
			const requestUrl = new URL(request.url);
			const controls = new URL(controlsUrl);
			if (!controls.searchParams.has("parentOrigin")) {
				controls.searchParams.set("parentOrigin", requestUrl.origin);
			}
			const resolvedControlsUrl = controls.href;
			const bridge = `<script data-hobo-evidence-overlay-bridge="1">${renderEvidenceOverlayBridge({ controlsUrl: resolvedControlsUrl })}</script>`;
			if (
				request.method === "GET" &&
				requestUrl.searchParams.has(EVIDENCE_RAW_PARAM)
			) {
				requestUrl.searchParams.delete(EVIDENCE_RAW_PARAM);
				return entry.handler(new Request(requestUrl, request));
			}

			const response = await entry.handler(request);
			if (
				request.method !== "GET" ||
				!(response.headers.get("content-type") ?? "").includes("text/html")
			) {
				return response;
			}
			const contentEncoding = response.headers.get("content-encoding");
			if (
				contentEncoding !== null &&
				contentEncoding.trim().toLowerCase() !== "identity"
			) {
				return response;
			}
			if (requestUrl.origin === controls.origin) {
				return responseWithEvidenceHeader(response, "refused-same-origin");
			}

			const html = await response.text();
			const bodyEnd = html.toLowerCase().lastIndexOf("</body>");
			if (
				bodyEnd >= 0 &&
				cspAllowsInlineScript(response.headers.get("content-security-policy"))
			) {
				return htmlResponse(
					response,
					`${html.slice(0, bodyEnd)}${bridge}${html.slice(bodyEnd)}`,
					"bridge",
				);
			}

			requestUrl.searchParams.set(EVIDENCE_RAW_PARAM, "1");
			const wrapper = renderEvidenceOverlayWrapper({
				appUrl: requestUrl.href,
				controlsUrl: resolvedControlsUrl,
			});
			const headers = transformedResponseHeaders(response, "wrapper");
			headers.delete("content-security-policy-report-only");
			headers.set(
				"content-security-policy",
				`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src ${requestUrl.origin} ${controls.origin}`,
			);
			return new Response(wrapper, responseInit(response, headers));
		},
	}));
}

function discoveredEvidenceControlsUrl(
	env: NodeJS.ProcessEnv,
): string | undefined {
	const hoboHome =
		env.HOBO_HOME ?? (env.HOME ? join(env.HOME, ".hobo") : undefined);
	if (!hoboHome) return undefined;
	const path = join(hoboHome, "runtime", "code", "evidence-controls-url");
	if (!existsSync(path)) return undefined;
	const value = readFileSync(path, "utf8").trim();
	return value || undefined;
}

function cspAllowsInlineScript(value: string | null): boolean {
	if (value === null) return true;
	return value.split(",").every((policy) => {
		const directives = new Map(
			policy
				.split(";")
				.map((part) => part.trim().split(/\s+/))
				.filter((parts) => parts[0]?.length)
				.map((parts) => [parts[0]?.toLowerCase() ?? "", parts.slice(1)]),
		);
		const sources =
			directives.get("script-src-elem") ??
			directives.get("script-src") ??
			directives.get("default-src");
		if (sources === undefined) return true;
		return (
			sources.includes("'unsafe-inline'") &&
			!sources.some(
				(source) =>
					source.startsWith("'nonce-") ||
					source.startsWith("'sha256-") ||
					source.startsWith("'sha384-") ||
					source.startsWith("'sha512-") ||
					source === "'strict-dynamic'",
			)
		);
	});
}

function responseHeaders(response: Response, mode: string): Headers {
	const headers = new Headers(response.headers);
	headers.set("x-hobo-evidence-overlay", mode);
	return headers;
}

function transformedResponseHeaders(response: Response, mode: string): Headers {
	const headers = responseHeaders(response, mode);
	for (const name of STALE_BODY_HEADERS) headers.delete(name);
	return headers;
}

function responseInit(response: Response, headers: Headers): ResponseInit {
	return {
		status: response.status,
		statusText: response.statusText,
		headers,
	};
}

function htmlResponse(
	response: Response,
	html: string,
	mode: string,
): Response {
	return new Response(
		html,
		responseInit(response, transformedResponseHeaders(response, mode)),
	);
}

function responseWithEvidenceHeader(
	response: Response,
	mode: string,
): Response {
	return new Response(
		response.body,
		responseInit(response, responseHeaders(response, mode)),
	);
}
