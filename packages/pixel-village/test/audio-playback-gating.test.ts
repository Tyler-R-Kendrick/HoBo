/**
 * When the yard is actually allowed to make a sound.
 *
 * `audio-and-engine-state.test.ts` covers the mute preference and the fx→cue
 * mapping. This covers the half that needs a WebAudio context: loading clips
 * and deciding, per `play()` call, whether a sound happens at all.
 *
 * Four gates stand between a cue and a speaker, and every one of them exists
 * because sound in an ops room is a liability rather than a feature:
 *
 * **Nothing plays before a real user gesture.** Browsers block autoplay, but
 * the stronger reason is courtesy — a dashboard left open on a wall must not
 * start making noise on its own. Until `unlock()` is called from a gesture, no
 * `AudioContext` is even constructed.
 *
 * **Nothing plays while muted**, which is the default, because an ops room is
 * shared and sound is opt-in.
 *
 * **Nothing plays when disabled.** Evidence and test runs pass
 * `enabled: false` and must stay silent *and* never construct a context —
 * a headless run that opened an audio device would fail on machines with no
 * sound hardware.
 *
 * **Repeating cues are rate-limited.** A telegraph tick per SSE frame is a
 * metronome, not information. `telegraph` and `steam` carry a minimum gap;
 * one-shot cues like `stamp` do not, because a stamp is a discrete act the
 * operator just performed and suppressing it would make the yard feel dropped.
 *
 * And one property that makes all of the above safe to rely on: **a missing or
 * unfetchable clip is not worth breaking the yard over.** Every cue audio
 * carries is also carried visually, so a failed load degrades to silence rather
 * than to an error.
 *
 * The WebAudio API is stubbed here rather than mocked at the module boundary,
 * so the real gating logic runs against a context that records what it was
 * asked to do.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createYardAudio } from "../src/audio.js";

type Started = { count: number; gains: number[] };

const originalAudioContext = Object.getOwnPropertyDescriptor(
	globalThis,
	"AudioContext",
);
const originalFetch = globalThis.fetch;

afterEach(() => {
	if (originalAudioContext) {
		Object.defineProperty(globalThis, "AudioContext", originalAudioContext);
	} else {
		Reflect.deleteProperty(globalThis, "AudioContext");
	}
	globalThis.fetch = originalFetch;
});

/**
 * Install a stub WebAudio context that records every source it starts.
 *
 * `decode` false makes `decodeAudioData` reject, standing in for a clip the
 * browser cannot decode.
 */
function stubAudio(options: { decode?: boolean } = {}): Started {
	const started: Started = { count: 0, gains: [] };
	class StubContext {
		destination = {};
		resume() {
			return Promise.resolve();
		}
		decodeAudioData(_bytes: ArrayBuffer) {
			return options.decode === false
				? Promise.reject(new Error("cannot decode"))
				: Promise.resolve({ duration: 1 } as AudioBuffer);
		}
		createBufferSource() {
			return {
				buffer: null,
				connect(next: unknown) {
					return next;
				},
				start: () => {
					started.count += 1;
				},
			};
		}
		createGain() {
			const gain = { value: 1 };
			return {
				gain,
				connect: (next: unknown) => {
					started.gains.push(gain.value);
					return next;
				},
			};
		}
	}
	Object.defineProperty(globalThis, "AudioContext", {
		configurable: true,
		writable: true,
		value: StubContext,
	});
	globalThis.fetch = (async () => ({
		arrayBuffer: async () => new ArrayBuffer(8),
		// SAFETY: the stub supplies exactly the fields the loader reads.
	})) as never;
	return started;
}

/** No AudioContext on the global at all — an environment with no WebAudio. */
function noAudioApi(): void {
	Reflect.deleteProperty(globalThis, "AudioContext");
	Reflect.deleteProperty(
		globalThis as { webkitAudioContext?: unknown },
		"webkitAudioContext",
	);
}

const INDEX = {
	audio: {
		stamp: { id: "stamp", path: "audio/stamp.mp3" },
		telegraph: { id: "telegraph", path: "audio/telegraph.mp3" },
	},
	// SAFETY: the fixture supplies exactly the fields the loader reads.
} as never;

const memoryStorage = () => {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => {
			map.set(key, value);
		},
	};
};

function audioFor(
	options: { enabled?: boolean; now?: () => number; muted?: boolean } = {},
) {
	const yard = createYardAudio({
		index: INDEX,
		assetBaseUrl: "/assets/",
		storage: memoryStorage(),
		...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
		...(options.now ? { now: options.now } : {}),
	});
	if (options.muted === false) yard.setMuted(false);
	return yard;
}

/** Unlock and let the async load settle. */
async function unlocked(
	yard: ReturnType<typeof audioFor>,
): Promise<ReturnType<typeof audioFor>> {
	yard.unlock();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return yard;
}

describe("before a user gesture", () => {
	it("plays nothing", async () => {
		// Browsers block autoplay, and a dashboard left open on a wall must not
		// start making noise on its own.
		const started = stubAudio();
		const yard = audioFor({ muted: false });
		yard.play("stamp");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(started.count).toBe(0);
	});

	it("is not ready", () => {
		stubAudio();
		expect(audioFor().ready).toBe(false);
	});

	it("becomes ready after unlocking", async () => {
		stubAudio();
		const yard = await unlocked(audioFor());
		expect(yard.ready).toBe(true);
	});

	it("ignores a second unlock", async () => {
		// `unlock` is wired to a gesture handler that may fire repeatedly;
		// constructing a second context per click would leak audio devices.
		stubAudio();
		const yard = await unlocked(audioFor());
		expect(() => yard.unlock()).not.toThrow();
		expect(yard.ready).toBe(true);
	});
});

describe("when disabled", () => {
	it("never becomes ready", async () => {
		// Evidence and test runs pass `enabled: false`; a headless run that
		// opened an audio device would fail on machines with no sound hardware.
		stubAudio();
		const yard = await unlocked(audioFor({ enabled: false }));
		expect(yard.ready).toBe(false);
	});

	it("plays nothing even unmuted and unlocked", async () => {
		const started = stubAudio();
		const yard = await unlocked(audioFor({ enabled: false, muted: false }));
		yard.play("stamp");
		expect(started.count).toBe(0);
	});

	it("still answers the mute question", () => {
		// Disabled is not broken — the UI still renders a mute control, and it
		// has to show something.
		stubAudio();
		expect(typeof audioFor({ enabled: false }).muted()).toBe("boolean");
	});
});

describe("when muted", () => {
	it("plays nothing", async () => {
		// The default, because an ops room is shared and sound is opt-in.
		const started = stubAudio();
		const yard = await unlocked(audioFor());
		yard.play("stamp");
		expect(started.count).toBe(0);
	});

	it("plays once unmuted", async () => {
		const started = stubAudio();
		const yard = await unlocked(audioFor());
		yard.setMuted(false);
		yard.play("stamp");
		expect(started.count).toBe(1);
	});

	it("stops again when re-muted", async () => {
		const started = stubAudio();
		const yard = await unlocked(audioFor({ muted: false }));
		yard.play("stamp");
		yard.setMuted(true);
		yard.play("stamp");
		expect(started.count).toBe(1);
	});
});

describe("playing a cue", () => {
	it("plays a loaded clip", async () => {
		const started = stubAudio();
		const yard = await unlocked(audioFor({ muted: false }));
		yard.play("stamp");
		expect(started.count).toBe(1);
	});

	it("stays well under unity gain", async () => {
		// These sit beneath a working console, never over it. A cue at full
		// volume in an ops room is the reason people mute things permanently.
		const started = stubAudio();
		const yard = await unlocked(audioFor({ muted: false }));
		yard.play("stamp");
		expect(started.gains[0]).toBeLessThan(0.5);
	});

	it("stays silent for a cue with no loaded clip", async () => {
		// The manifest carries stamp and telegraph only; `derail` has no buffer
		// here, and a missing cue must not throw mid-render.
		const started = stubAudio();
		const yard = await unlocked(audioFor({ muted: false }));
		expect(() => yard.play("derail")).not.toThrow();
		expect(started.count).toBe(0);
	});

	it("stays silent when a clip could not be decoded", async () => {
		// A corrupt or unsupported file. Every cue is also carried visually, so
		// silence loses nothing — an exception would lose the frame.
		const started = stubAudio({ decode: false });
		const yard = await unlocked(audioFor({ muted: false }));
		yard.play("stamp");
		expect(started.count).toBe(0);
	});

	it("stays silent when the fetch itself fails", async () => {
		const started = stubAudio();
		globalThis.fetch = (async () => {
			throw new Error("offline");
			// SAFETY: the stub stands in for a failing fetch.
		}) as never;
		const yard = await unlocked(audioFor({ muted: false }));
		yard.play("stamp");
		expect(started.count).toBe(0);
	});
});

describe("rate limiting", () => {
	it("suppresses a repeated telegraph inside its gap", async () => {
		// A telegraph tick per SSE frame is a metronome, not information.
		const started = stubAudio();
		let clock = 1_000;
		const yard = await unlocked(audioFor({ muted: false, now: () => clock }));
		yard.play("telegraph");
		clock += 100;
		yard.play("telegraph");
		expect(started.count).toBe(1);
	});

	it("allows it again once the gap has passed", async () => {
		// Rate limiting is a floor on spacing, not a mute — the cue still
		// carries information at a human rate.
		const started = stubAudio();
		let clock = 1_000;
		const yard = await unlocked(audioFor({ muted: false, now: () => clock }));
		yard.play("telegraph");
		clock += 1_000;
		yard.play("telegraph");
		expect(started.count).toBe(2);
	});

	it("does not rate-limit a one-shot cue", async () => {
		// A stamp is a discrete act the operator just performed; suppressing it
		// would make the yard feel like it dropped the input.
		const started = stubAudio();
		let clock = 1_000;
		const yard = await unlocked(audioFor({ muted: false, now: () => clock }));
		yard.play("stamp");
		clock += 1;
		yard.play("stamp");
		expect(started.count).toBe(2);
	});

	it("rate-limits each cue independently", async () => {
		// A shared timer would let a telegraph tick suppress an unrelated
		// stamp — silence on the one cue the operator is waiting to hear.
		const started = stubAudio();
		let clock = 1_000;
		const yard = await unlocked(audioFor({ muted: false, now: () => clock }));
		yard.play("telegraph");
		clock += 10;
		yard.play("stamp");
		expect(started.count).toBe(2);
	});

	it("plays the first telegraph with no history", async () => {
		// The gap is measured against the last play; an unplayed cue must not
		// be treated as having just played.
		const started = stubAudio();
		const yard = await unlocked(audioFor({ muted: false, now: () => 0 }));
		yard.play("telegraph");
		expect(started.count).toBe(1);
	});
});

describe("an environment with no WebAudio", () => {
	it("never becomes ready", async () => {
		// Older or locked-down browsers. The yard runs, silently.
		noAudioApi();
		globalThis.fetch = (async () => ({
			arrayBuffer: async () => new ArrayBuffer(8),
			// SAFETY: the stub supplies exactly the fields the loader reads.
		})) as never;
		const yard = await unlocked(audioFor({ muted: false }));
		expect(yard.ready).toBe(false);
	});

	it("does not throw on play", async () => {
		noAudioApi();
		const yard = await unlocked(audioFor({ muted: false }));
		expect(() => yard.play("stamp")).not.toThrow();
	});
});
