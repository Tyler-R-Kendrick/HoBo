import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
} from "./json.js";
// public-contract: persisted browser recording evidence schema id.
export const BROWSER_RECORDING_SCHEMA =
	"hobo.code.browser-recording/v1" as const;

export interface BrowserRecordingTarget {
	readonly role?: string;
	readonly name?: string;
	readonly label?: string;
	readonly testId?: string;
	readonly stableId?: string;
	readonly css?: string;
}

export type BrowserRecordingAction =
	| {
			readonly sequence: number;
			readonly offsetMs: number;
			readonly type: "navigate";
			readonly path: string;
	  }
	| {
			readonly sequence: number;
			readonly offsetMs: number;
			readonly type: "click" | "hover";
			readonly target: BrowserRecordingTarget;
	  }
	| {
			readonly sequence: number;
			readonly offsetMs: number;
			readonly type: "fill";
			readonly target: BrowserRecordingTarget;
			readonly value: { readonly kind: "parameter"; readonly name: string };
	  }
	| {
			readonly sequence: number;
			readonly offsetMs: number;
			readonly type: "press";
			readonly target?: BrowserRecordingTarget;
			readonly key: string;
	  }
	| {
			readonly sequence: number;
			readonly offsetMs: number;
			readonly type: "scroll" | "pointer";
			readonly x: number;
			readonly y: number;
	  };

export interface BrowserRecordingCheckpoint {
	readonly sequence: number;
	readonly afterAction: number;
	readonly path: string;
	readonly title: string;
}

export interface CompletedBrowserRecording {
	readonly schemaVersion: typeof BROWSER_RECORDING_SCHEMA;
	readonly id: string;
	readonly title: string;
	readonly status: "completed" | "interrupted";
	readonly startUrl: string;
	readonly endUrl: string;
	readonly durationMs: number;
	readonly viewport: { readonly width: number; readonly height: number };
	readonly actions: readonly BrowserRecordingAction[];
	readonly checkpoints: readonly BrowserRecordingCheckpoint[];
}

/** Parse browser-produced recording evidence before the host stores or derives from it. */
export function parseBrowserRecording(
	input: JsonValue | undefined,
): CompletedBrowserRecording {
	const value = object(input, "recording");
	if (value.schemaVersion !== BROWSER_RECORDING_SCHEMA)
		throw new TypeError(`recording schema must be ${BROWSER_RECORDING_SCHEMA}`);
	if (value.status !== "completed" && value.status !== "interrupted")
		throw new TypeError("recording status is invalid");
	const viewport = object(value.viewport, "recording viewport");
	const actions = array(value.actions, "recording actions", 20_000).map(
		parseAction,
	);
	const checkpoints = array(
		value.checkpoints,
		"recording checkpoints",
		5_000,
	).map(parseCheckpoint);
	for (let index = 0; index < actions.length; index += 1)
		if (actions[index]?.sequence !== index + 1)
			throw new TypeError("recording action sequence is not contiguous");
	return Object.freeze({
		schemaVersion: BROWSER_RECORDING_SCHEMA,
		id: text(value.id, "recording id", 256),
		title: text(value.title, "recording title", 256),
		status: value.status,
		startUrl: sanitizedUrl(value.startUrl, "recording start URL"),
		endUrl: sanitizedUrl(value.endUrl, "recording end URL"),
		durationMs: integer(value.durationMs, "recording duration", 0, 86_400_000),
		viewport: Object.freeze({
			width: integer(viewport.width, "viewport width", 1, 16_384),
			height: integer(viewport.height, "viewport height", 1, 16_384),
		}),
		actions: Object.freeze(actions),
		checkpoints: Object.freeze(checkpoints),
	});
}

function parseAction(
	value: JsonValue | undefined,
	index: number,
): BrowserRecordingAction {
	const action = object(value, `action ${index}`);
	const common = {
		sequence: integer(action.sequence, "action sequence", 1, 20_000),
		offsetMs: integer(action.offsetMs, "action offset", 0, 86_400_000),
	};
	if (action.type === "navigate")
		return Object.freeze({
			...common,
			type: "navigate",
			path: relativePath(action.path),
		});
	if (action.type === "pointer" || action.type === "scroll")
		return Object.freeze({
			...common,
			type: action.type,
			x: integer(action.x, "x", -1_000_000, 1_000_000),
			y: integer(action.y, "y", -1_000_000, 1_000_000),
		});
	if (action.type === "click" || action.type === "hover")
		return Object.freeze({
			...common,
			type: action.type,
			target: parseTarget(action.target),
		});
	if (action.type === "press")
		return Object.freeze({
			...common,
			type: "press",
			key: text(action.key, "key", 128),
			...(action.target ? { target: parseTarget(action.target) } : undefined),
		});
	if (action.type === "fill") {
		const parameter = object(action.value, "fill value");
		if (parameter.kind !== "parameter")
			throw new TypeError("recorded fill values must be runtime parameters");
		const name = text(parameter.name, "parameter name", 128);
		if (!/^[A-Z][A-Z0-9_]*$/u.test(name))
			throw new TypeError("parameter name is invalid");
		return Object.freeze({
			...common,
			type: "fill",
			target: parseTarget(action.target),
			value: { kind: "parameter" as const, name },
		});
	}
	throw new TypeError("recording action type is invalid");
}

function titleOf(value: JsonValue | undefined): string {
	if (!isJsonString(value)) return "";
	return `${value}`.slice(0, 512);
}

function parseCheckpoint(
	value: JsonValue | undefined,
	index: number,
): BrowserRecordingCheckpoint {
	const checkpoint = object(value, `checkpoint ${index}`);
	return Object.freeze({
		sequence: integer(checkpoint.sequence, "checkpoint sequence", 1, 5_000),
		afterAction: integer(
			checkpoint.afterAction,
			"checkpoint action",
			0,
			20_000,
		),
		path: relativePath(checkpoint.path),
		title: titleOf(checkpoint.title),
	});
}

function parseTarget(value: JsonValue | undefined): BrowserRecordingTarget {
	const source = object(value, "recording target");
	const target = Object.freeze({
		...(isJsonString(source.role)
			? { role: text(source.role, "target role", 64) }
			: undefined),
		...(isJsonString(source.name)
			? { name: text(source.name, "target name", 512) }
			: undefined),
		...(isJsonString(source.label)
			? { label: text(source.label, "target label", 512) }
			: undefined),
		...(isJsonString(source.testId)
			? { testId: text(source.testId, "target test id", 512) }
			: undefined),
		...(isJsonString(source.stableId)
			? { stableId: text(source.stableId, "target id", 512) }
			: undefined),
		...(isJsonString(source.css)
			? { css: text(source.css, "target CSS", 2_048) }
			: undefined),
	});
	if (Object.keys(target).length === 0)
		throw new TypeError("recording target is empty");
	return target;
}

function sanitizedUrl(value: JsonValue | undefined, label: string): string {
	let url: URL;
	try {
		url = new URL(text(value, label, 4_096));
	} catch {
		throw new TypeError(`${label} must be absolute`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw new TypeError(`${label} must use HTTP(S)`);
	url.username = "";
	url.password = "";
	for (const key of Array.from(url.searchParams.keys()))
		if (/token|key|secret|password|auth/iu.test(key))
			url.searchParams.set(key, "[redacted]");
	return url.href;
}
function relativePath(value: JsonValue | undefined): string {
	const result = text(value, "recording path", 4_096);
	if (!result.startsWith("/"))
		throw new TypeError("recording path must be relative");
	return result;
}
function object(value: JsonValue | undefined, label: string): JsonObject {
	if (!value || !isJsonObject(value) || Array.isArray(value))
		throw new TypeError(`${label} must be an object`);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return value as JsonObject;
}
function array(
	value: JsonValue | undefined,
	label: string,
	maximum: number,
): readonly JsonValue[] {
	if (!Array.isArray(value) || value.length > maximum)
		throw new TypeError(`${label} is invalid`);
	return value;
}
function text(
	value: JsonValue | undefined,
	label: string,
	maximum: number,
): string {
	if (!isJsonString(value) || !value.trim() || value.length > maximum)
		throw new TypeError(`${label} is invalid`);
	return value;
}
function integer(
	value: JsonValue | undefined,
	label: string,
	minimum: number,
	maximum: number,
): number {
	if (
		!Number.isInteger(value) ||
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		(value as number) < minimum ||
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		(value as number) > maximum
	)
		throw new TypeError(`${label} is invalid`);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return value as number;
}
