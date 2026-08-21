/**
 * The yard's sound: a mono, lo-fi, old-reel palette (DESIGN.md "Game Surface").
 *
 * Rules this module enforces so sound can never become a liability in an ops
 * room: nothing plays before a real user gesture (browser autoplay policy and
 * basic courtesy), mute is persisted, and audio is *accent only* — every cue
 * it carries is also carried visually, so a muted yard loses nothing.
 */

import type { AssetIndex } from "./assets-index-core.js";

export type CueId =
	| "whistle"
	| "stamp"
	| "spike"
	| "telegraph"
	| "steam"
	| "derail";

export type YardAudio = {
	/** Play a cue; silently no-ops while locked or muted. */
	play(cue: CueId): void;
	/** Call from a real user gesture to permit playback. */
	unlock(): void;
	muted(): boolean;
	setMuted(muted: boolean): void;
	readonly ready: boolean;
};

const MUTE_KEY = "hobo-yard-muted";
/** Ops rooms are shared; sound is opt-in, never opt-out. */
const DEFAULT_MUTED = true;
/** A telegraph tick per SSE frame would be a metronome — rate-limit it. */
interface CueGapMs {
	telegraph: number;
	steam: number;
}

const MIN_GAP_MS: CueGapMs = {
	telegraph: 900,
	steam: 4000,
};

export function createYardAudio(opts: {
	index: AssetIndex;
	assetBaseUrl: string;
	/** Test/evidence runs stay silent and never construct an AudioContext. */
	enabled?: boolean;
	now?: () => number;
	storage?: Pick<Storage, "getItem" | "setItem"> | null;
}): YardAudio {
	const enabled = opts.enabled ?? true;
	const now = opts.now ?? (() => Date.now());
	const store =
		opts.storage === undefined
			? localStorage === undefined
				? null
				: localStorage
			: opts.storage;

	const buffers = new Map<CueId, AudioBuffer>();
	const lastPlayed = new Map<CueId, number>();
	let ctx: AudioContext | null = null;
	let unlocked = false;
	let ready = false;

	let isMuted = DEFAULT_MUTED;
	try {
		const stored = store?.getItem(MUTE_KEY);
		if (stored !== null && stored !== undefined) isMuted = stored === "1";
	} catch {
		/* storage unavailable — fall back to the quiet default */
	}

	async function load(): Promise<void> {
		const clips = opts.index.audio;
		if (!enabled || !clips || ctx !== null) return;
		type WebkitAudioHolder = {
			webkitAudioContext?: typeof AudioContext;
		};
		const Ctor =
			AudioContext !== undefined
				? AudioContext
				: (
						// SAFETY: Safari still exposes AudioContext under the webkit prefix.
						globalThis as WebkitAudioHolder
					).webkitAudioContext;
		if (!Ctor) return;
		ctx = new Ctor();
		const base = opts.assetBaseUrl.replace(/\/$/, "");
		await Promise.all(
			Object.values(clips).map(async (clip) => {
				try {
					const res = await fetch(`${base}/${clip.path}`);
					const bytes = await res.arrayBuffer();
					// SAFETY: `const decoded = await (ctx as AudioContext).decodeAudioData(bytes);` is required at this I/O or test boundary.
					const decoded = await (ctx as AudioContext).decodeAudioData(bytes);
					// SAFETY: `buffers.set(clip.id as CueId, decoded);` is required at this I/O or test boundary.
					buffers.set(clip.id as CueId, decoded);
				} catch {
					// A missing cue is not worth breaking the yard over; the
					// visual state already carries the information.
				}
			}),
		);
		ready = true;
	}

	const audio: YardAudio = {
		get ready() {
			return ready;
		},
		unlock() {
			if (unlocked || !enabled) return;
			unlocked = true;
			void load().then(() => {
				void ctx?.resume();
			});
		},
		muted: () => isMuted,
		setMuted(next) {
			isMuted = next;
			try {
				store?.setItem(MUTE_KEY, next ? "1" : "0");
			} catch {
				/* storage unavailable */
			}
		},
		play(cue) {
			if (!enabled || isMuted || !unlocked || ctx === null) return;
			const buffer = buffers.get(cue);
			if (!buffer) return;
			const gap = MIN_GAP_MS[cue];
			const at = now();
			if (gap !== undefined && at - (lastPlayed.get(cue) ?? -Infinity) < gap) {
				return;
			}
			lastPlayed.set(cue, at);
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			const gain = ctx.createGain();
			// Well under unity: these sit beneath a working console, never over it.
			gain.gain.value = 0.35;
			source.connect(gain).connect(ctx.destination);
			source.start();
		},
	};
	return audio;
}

/**
 * Map a recorded fx label to its cue. Returns null for fx with no sound —
 * silence is the default, not an oversight.
 */
export function cueForFx(fx: string): CueId | null {
	if (fx.startsWith("stamp:")) return "stamp";
	if (fx.startsWith("spike:")) return "spike";
	if (fx === "highball") return "whistle";
	if (fx === "derail") return "derail";
	if (fx === "needs-reauth") return "steam";
	if (fx === "tick") return "telegraph";
	return null;
}
