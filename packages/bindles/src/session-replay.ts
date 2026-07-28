/**
 * Bindle-side Session Replay annotation helpers (ADR-0137).
 * Runtime wrap/inject lives in `@hobo/replay`; this module only declares intent.
 */
import type { ProviderAnnotation } from "./types.js";

// public-contract: annotation option auto-attached to Bindle `web` resources.
export const SESSION_REPLAY_OPTION = "session-replay" as const;

export type SessionReplayBindleConfig = Readonly<{
	/** Default true on web. Set false to opt a surface out. */
	enabled?: boolean;
	sampleRate?: number;
}>;

/**
 * Explicit Session Replay annotation for `.with(sessionReplay(...))`.
 * Prefer accepting the web default; use `{ enabled: false }` to disable.
 */
export function sessionReplay(
	config: SessionReplayBindleConfig = {},
): ProviderAnnotation {
	return Object.freeze({
		provider: "hobo",
		option: SESSION_REPLAY_OPTION,
		config: Object.freeze({
			enabled: config.enabled !== false,
			...(config.sampleRate !== undefined
				? { sampleRate: config.sampleRate }
				: {}),
		}),
	});
}

export function isSessionReplayAnnotation(
	annotation: ProviderAnnotation,
): boolean {
	return annotation.option === SESSION_REPLAY_OPTION;
}
