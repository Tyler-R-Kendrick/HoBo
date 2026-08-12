export type EvidenceOverlayMessage =
	| {
			readonly type: "annotate";
			readonly selector: string;
			readonly note: string;
	  }
	| {
			readonly type: "capture";
			readonly kind: "screenshot" | "clip";
	  }
	| { readonly type: "report" }
	| { readonly type: "replay"; readonly sessionId?: string }
	| {
			readonly type: "edit-request";
			readonly selector: string;
			readonly prompt: string;
	  };

export interface EvidenceOverlayMessageEvent {
	readonly origin: string;
	readonly data: unknown;
}

function trustedOrigin(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("evidence overlay origin must be an absolute URL origin");
	}
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.origin !== value
	) {
		throw new Error("evidence overlay origin must be an exact HTTP(S) origin");
	}
	return url.origin;
}

function record(value: unknown): Record<string, unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value)
	) {
		throw new Error("evidence overlay message must be an object");
	}
	return value as Record<string, unknown>;
}

function exactFields(
	value: Record<string, unknown>,
	required: readonly string[],
	optional: readonly string[] = [],
): void {
	const allowed = new Set([...required, ...optional]);
	if (
		required.some((key) => !(key in value)) ||
		Object.keys(value).some((key) => !allowed.has(key))
	) {
		throw new Error("evidence overlay message has invalid fields");
	}
}

function boundedString(
	value: unknown,
	field: string,
	maximum: number,
): string {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		value.length > maximum
	) {
		throw new Error(`evidence overlay ${field} length is invalid`);
	}
	return value;
}

/** Parse the only commands the unprivileged page bridge may receive. */
export function parseEvidenceOverlayMessage(
	event: EvidenceOverlayMessageEvent,
	controlsOrigin: string,
): EvidenceOverlayMessage {
	if (event.origin !== trustedOrigin(controlsOrigin)) {
		throw new Error("evidence overlay message origin is not trusted");
	}

	const value = record(event.data);
	switch (value.type) {
		case "annotate":
			exactFields(value, ["type", "selector", "note"]);
			return {
				type: "annotate",
				selector: boundedString(value.selector, "selector", 2_048),
				note: boundedString(value.note, "note", 8_192),
			};
		case "capture":
			exactFields(value, ["type", "kind"]);
			if (value.kind !== "screenshot" && value.kind !== "clip") {
				throw new Error("evidence overlay capture kind is invalid");
			}
			return { type: "capture", kind: value.kind };
		case "report":
			exactFields(value, ["type"]);
			return { type: "report" };
		case "replay":
			exactFields(value, ["type"], ["sessionId"]);
			return value.sessionId === undefined
				? { type: "replay" }
				: {
						type: "replay",
						sessionId: boundedString(value.sessionId, "sessionId", 256),
					};
		case "edit-request":
			exactFields(value, ["type", "selector", "prompt"]);
			return {
				type: "edit-request",
				selector: boundedString(value.selector, "selector", 2_048),
				prompt: boundedString(value.prompt, "prompt", 8_192),
			};
		default:
			throw new Error("evidence overlay message type is invalid");
	}
}
