import { redactDebugPayload } from "./privacy.js";
import type { RrwebEvent } from "./types.js";

// public-contract: synchronized debug event wire discriminator.
export const DEBUG_REPLAY_SCHEMA_VERSION = "hobo.debug-replay/v1" as const;
export const DEBUG_REPLAY_EVENT_TYPE = -1 as const;
// public-contract: process-level debug replay detail override.
export const DEBUG_REPLAY_LEVEL_ENV = "HOBO_REPLAY_LEVEL" as const;

export const DEBUG_REPLAY_TRACKS = Object.freeze([
	"browser",
	"terminal",
	"agent",
	"git",
	"test",
	"annotation",
	"approval",
] as const);

export type DebugReplayTrack = (typeof DEBUG_REPLAY_TRACKS)[number];
export type DebugReplayLevel = "off" | "metadata" | "observable" | "diagnostic";

export type DebugTrackEnvelope = RrwebEvent &
	Readonly<{
		type: typeof DEBUG_REPLAY_EVENT_TYPE;
		data: Readonly<{
			schemaVersion: typeof DEBUG_REPLAY_SCHEMA_VERSION;
			track: DebugReplayTrack;
			sequence: number;
			level: Exclude<DebugReplayLevel, "off">;
			payload: Readonly<{
				metadata: Readonly<Record<string, unknown>>;
				observable?: Readonly<Record<string, unknown>>;
				diagnostic?: Readonly<Record<string, unknown>>;
			}>;
		}>;
	}>;

export type DebugTrackInput = Readonly<{
	track: DebugReplayTrack;
	sequence: number;
	timestamp: number;
	level?: DebugReplayLevel;
	metadata?: Readonly<Record<string, unknown>>;
	observable?: Readonly<Record<string, unknown>>;
	diagnostic?: Readonly<Record<string, unknown>>;
}>;

export function resolveDebugReplayLevel(input?: {
	readonly level?: DebugReplayLevel;
	readonly env?: Readonly<Record<string, string | undefined>>;
}): DebugReplayLevel {
	const env = input?.env ?? {};
	if (["0", "false", "off"].includes(env.HOBO_REPLAY?.toLowerCase() ?? "")) {
		return "off";
	}
	const level = input?.level ?? env[DEBUG_REPLAY_LEVEL_ENV] ?? "observable";
	if (!["off", "metadata", "observable", "diagnostic"].includes(level)) {
		throw Object.assign(new Error(`invalid debug replay level: ${level}`), {
			code: "replay-level-invalid",
		});
	}
	return level as DebugReplayLevel;
}

export function createDebugTrackEnvelope(
	input: DebugTrackInput,
): DebugTrackEnvelope | undefined {
	const level = resolveDebugReplayLevel(
		input.level === undefined ? undefined : { level: input.level },
	);
	if (level === "off") return undefined;

	const payload = redactDebugPayload({
		metadata: input.metadata ?? {},
		...(level !== "metadata" && input.observable !== undefined
			? { observable: input.observable }
			: {}),
		...(level === "diagnostic" && input.diagnostic !== undefined
			? { diagnostic: input.diagnostic }
			: {}),
	});
	return Object.freeze({
		type: DEBUG_REPLAY_EVENT_TYPE,
		timestamp: input.timestamp,
		data: Object.freeze({
			schemaVersion: DEBUG_REPLAY_SCHEMA_VERSION,
			track: input.track,
			sequence: input.sequence,
			level,
			payload: payload as DebugTrackEnvelope["data"]["payload"],
		}),
	});
}

export function isDebugTrackEnvelope(
	event: RrwebEvent,
): event is DebugTrackEnvelope {
	return (
		event.type === DEBUG_REPLAY_EVENT_TYPE &&
		event.data.schemaVersion === DEBUG_REPLAY_SCHEMA_VERSION &&
		DEBUG_REPLAY_TRACKS.includes(event.data.track as DebugReplayTrack) &&
		Number.isSafeInteger(event.data.sequence)
	);
}
