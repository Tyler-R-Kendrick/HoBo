import { existsSync } from "node:fs";
import { join } from "node:path";
import { matchClosedIntent } from "./atom-intent.js";
import {
	type ExampleCatalogEntry,
	matchExampleRequest,
} from "./example-catalog.js";
import { isJsonString } from "./json.js";
import { preferNamedEndpoint, retargetUrl } from "./occupancy-endpoints.js";
import { formatInkTable } from "./tui-layout.js";

export { retargetUrl } from "./occupancy-endpoints.js";

export type WorkspaceAction =
	| {
			readonly kind: "create";
			readonly exampleId: string;
			readonly prompt: string;
	  }
	| {
			readonly kind: "create-and-run";
			readonly exampleId: string;
			readonly prompt: string;
	  }
	| { readonly kind: "run" }
	| { readonly kind: "debug" };

const POLITE = /^(please |can you |could you )?/u;
const RUN_VERB = "(run|start|serve|launch|boot)";
const TARGET = "( it| this| the app| the bindle)?";
const RUN_PROMPT = new RegExp(`^${POLITE.source}${RUN_VERB}${TARGET}$`, "u");
const DEBUG_PROMPT = new RegExp(`^${POLITE.source}debug${TARGET}$`, "u");
const TEST_WORDS = /\b(test|tests|spec|bench|benchmark|lint|ci)\b/u;
const RUN_WORDS = /\b(run|start|serve|launch|boot|debug)\b/u;

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, " ")
		.trim();
}

export function matchWorkspaceAction(
	prompt: string,
	catalog?: readonly ExampleCatalogEntry[],
): WorkspaceAction | undefined {
	const normalized = normalize(prompt);
	if (normalized.length === 0) return undefined;
	const example = matchExampleRequest(prompt, catalog);
	const closed = matchClosedIntent(prompt);
	const exampleId = example?.id ?? closed?.id;
	const wantsRun = RUN_WORDS.test(normalized) && !TEST_WORDS.test(normalized);
	if (exampleId && wantsRun) {
		return { kind: "create-and-run", exampleId, prompt };
	}
	if (exampleId) return { kind: "create", exampleId, prompt };
	if (TEST_WORDS.test(normalized)) return undefined;
	if (RUN_PROMPT.test(normalized)) return { kind: "run" };
	if (DEBUG_PROMPT.test(normalized)) return { kind: "debug" };
	return undefined;
}

export function resolveRunnableProject(
	cwd: string,
	preferred?: string,
): string | undefined {
	const candidates = [
		preferred,
		cwd,
		join(cwd, "hello-world"),
		join(cwd, "barebones"),
	].filter((dir): dir is string => isJsonString(dir) && dir.length > 0);
	for (const dir of candidates) {
		if (
			existsSync(join(dir, "src", "bindle.ts")) ||
			existsSync(join(dir, "dist", "bindle.js"))
		) {
			return dir;
		}
	}
	return undefined;
}

export interface LiveEndpointLines {
	readonly appUrl: string;
	readonly debugUrl: string;
	readonly controlsUrl: string;
	readonly reportUrl: string;
	readonly namedUrl?: string;
	readonly stationId?: string;
	readonly environment?: string;
	readonly emphasis: "run" | "debug";
}

/** Bindle/debug/Evidence lines use named endpoints. Loopback IPs stay off-screen. */
export function liveEndpointRows(
	options: LiveEndpointLines,
): { readonly label: string; readonly value: string }[] {
	const scope = {
		...(options.environment !== undefined
			? { environment: options.environment }
			: undefined),
	};
	const publicApp = options.namedUrl
		? options.namedUrl
		: preferNamedEndpoint(options.appUrl, "web", scope);
	const publicDebug = options.namedUrl
		? retargetUrl(options.debugUrl, options.namedUrl)
		: preferNamedEndpoint(options.debugUrl, "web", scope);
	const controls = preferNamedEndpoint(options.controlsUrl, "evidence", scope);
	const report = preferNamedEndpoint(options.reportUrl, "evidence", scope);
	const core =
		options.emphasis === "debug"
			? [
					{ label: "debug", value: publicDebug },
					{ label: "controls", value: controls },
					{ label: "report", value: report },
					{ label: "bindle", value: publicApp },
				]
			: [
					{ label: "bindle", value: publicApp },
					{ label: "debug", value: publicDebug },
					{ label: "controls", value: controls },
					{ label: "report", value: report },
				];
	return [
		...core,
		...(options.stationId
			? [{ label: "station", value: options.stationId }]
			: []),
		...(options.environment
			? [{ label: "env", value: options.environment }]
			: []),
	];
}

export function liveEndpointLines(options: LiveEndpointLines): string[] {
	return formatInkTable(liveEndpointRows(options)).split("\n");
}

export function formatLiveEndpoints(options: LiveEndpointLines): string {
	return formatInkTable(liveEndpointRows(options));
}
