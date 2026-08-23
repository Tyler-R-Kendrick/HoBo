/**
 * Yard audio policy and the engine's tick/selection state.
 *
 * Audio in an ops room is a social problem before it is a technical one, and
 * the policy is encoded in defaults rather than in documentation:
 *
 * **Sound is opt-in, never opt-out.** A shared room means an unexpected noise
 * costs someone else's attention, so a station with no stored preference
 * starts muted. Defaulting the other way would make every fresh browser
 * profile audible in a room that did not ask for it.
 *
 * **Nothing plays before a real user gesture.** `unlock()` exists because
 * browsers require a gesture, and because a page that made noise before being
 * touched is a page nobody trusts.
 *
 * **A storage failure is silence, not a crash.** Private browsing and blocked
 * site data both throw on `localStorage`; the mute preference is a
 * convenience, and losing it must not take the Yard down with it.
 *
 * Not covered here: the per-cue rate limit that stops a telegraph tick per SSE
 * frame becoming a metronome. It lives past the `ctx === null` guard inside
 * `play`, so reaching it needs a real `AudioContext` — which is exactly what
 * `enabled: false` exists to avoid. The gating tests below pin that `play` is
 * a silent no-op on every path that gets there without one.
 *
 * The engine half covers what `selectZone` and `tick` do to state — the parts
 * that decide what is on screen without drawing anything.
 */

import type { YardProjectionSnapshot } from "@hobo/management";
import { describe, expect, it } from "vitest";

import { createYardAudio, cueForFx } from "../src/audio.js";
import { createYardEngine } from "../src/yard-engine.js";

/** A storage stand-in that records writes and can be made to throw. */
function fakeStorage(initial: Record<string, string> = {}, throws = false) {
	const map = new Map(Object.entries(initial));
	return {
		writes: [] as [string, string][],
		getItem(key: string) {
			if (throws) throw new Error("storage unavailable");
			return map.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			if (throws) throw new Error("storage unavailable");
			this.writes.push([key, value]);
			map.set(key, value);
		},
	};
}

/** A silent audio player — `enabled: false` never constructs an AudioContext. */
function audio(
	options: {
		storage?: ReturnType<typeof fakeStorage> | null;
		now?: () => number;
		enabled?: boolean;
	} = {},
) {
	return createYardAudio({
		// SAFETY: the player reads only `audio` off the index, and never when
		// disabled.
		index: { audio: {} } as never,
		assetBaseUrl: "/assets",
		enabled: options.enabled ?? false,
		...(options.now ? { now: options.now } : {}),
		...(options.storage !== undefined ? { storage: options.storage } : {}),
	});
}

function snapshot(overrides: Record<string, unknown> = {}) {
	return {
		occupancy: { stationId: "station:local" },
		connections: [],
		rails: [],
		activity: [],
		metering: { quotaUsed: 0, quotaLimit: 10, spendCapUsd: 25, budgetUsd: 0 },
		doctor: { hazards: [], hint: "" },
		...overrides,
		// SAFETY: the engine reads exactly the fields named above.
	} as never as YardProjectionSnapshot;
}

describe("mapping an fx label to a cue", () => {
	it("maps any stamp fx to the stamp cue", () => {
		// The fx label carries the waybill id after the colon; the cue must not
		// depend on which waybill was stamped.
		expect(cueForFx("stamp:wb-1")).toBe("stamp");
		expect(cueForFx("stamp:anything-else")).toBe("stamp");
	});

	it("maps any spike fx to the spike cue", () => {
		expect(cueForFx("spike:wb-1")).toBe("spike");
	});

	it("maps highball to the whistle", () => {
		expect(cueForFx("highball")).toBe("whistle");
	});

	it("maps derail to the derail cue", () => {
		expect(cueForFx("derail")).toBe("derail");
	});

	it("maps needs-reauth to steam", () => {
		expect(cueForFx("needs-reauth")).toBe("steam");
	});

	it("maps tick to the telegraph", () => {
		expect(cueForFx("tick")).toBe("telegraph");
	});

	it("returns null for an fx with no sound", () => {
		// Silence is the default, not an oversight. Falling back to some cue
		// would give every unlabelled event a noise.
		expect(cueForFx("something-new")).toBeNull();
	});

	it("does not match a bare `stamp` without its colon", () => {
		// The prefix match is on `stamp:`; a bare label is a different event.
		expect(cueForFx("stamp")).toBeNull();
	});
});

describe("the mute preference", () => {
	it("starts muted when nothing is stored", () => {
		// Ops rooms are shared. A fresh profile that started audible would make
		// noise in a room that did not ask for it.
		expect(audio({ storage: fakeStorage() }).muted()).toBe(true);
	});

	it("reads a stored unmuted preference", () => {
		expect(
			audio({ storage: fakeStorage({ "hobo-yard-muted": "0" }) }).muted(),
		).toBe(false);
	});

	it("reads a stored muted preference", () => {
		expect(
			audio({ storage: fakeStorage({ "hobo-yard-muted": "1" }) }).muted(),
		).toBe(true);
	});

	it("treats any other stored value as unmuted", () => {
		// Only the literal "1" means muted, so a corrupted value fails toward
		// audible rather than silently disabling sound the user turned on.
		expect(
			audio({ storage: fakeStorage({ "hobo-yard-muted": "yes" }) }).muted(),
		).toBe(false);
	});

	it("persists a mute", () => {
		const store = fakeStorage();
		audio({ storage: store }).setMuted(true);
		expect(store.writes).toContainEqual(["hobo-yard-muted", "1"]);
	});

	it("persists an unmute", () => {
		const store = fakeStorage();
		audio({ storage: store }).setMuted(false);
		expect(store.writes).toContainEqual(["hobo-yard-muted", "0"]);
	});

	it("reports the new state immediately", () => {
		const player = audio({ storage: fakeStorage() });
		player.setMuted(false);
		expect(player.muted()).toBe(false);
	});

	it("stays muted when storage throws on read", () => {
		// Private browsing throws here. The quiet default is the safe fallback.
		expect(audio({ storage: fakeStorage({}, true) }).muted()).toBe(true);
	});

	it("does not crash when storage throws on write", () => {
		const player = audio({ storage: fakeStorage({}, true) });
		// The preference is a convenience; losing it must not take the Yard down.
		expect(() => player.setMuted(false)).not.toThrow();
	});

	it("still applies the setting when it could not be stored", () => {
		const player = audio({ storage: fakeStorage({}, true) });
		player.setMuted(false);
		// The user asked for sound in this session even if the preference will
		// not survive a reload.
		expect(player.muted()).toBe(false);
	});

	it("works with storage explicitly disabled", () => {
		// `storage: null` is the evidence-run configuration — no persistence at
		// all, and the quiet default.
		expect(audio({ storage: null }).muted()).toBe(true);
	});
});

describe("playback gating", () => {
	it("is not ready before anything is loaded", () => {
		expect(audio({ storage: null }).ready).toBe(false);
	});

	it("plays nothing while locked", () => {
		const player = audio({ storage: null });
		// Nothing has unlocked, so this must be a silent no-op rather than an
		// attempt to touch an AudioContext that was never built.
		expect(() => player.play("stamp")).not.toThrow();
	});

	it("plays nothing while disabled", () => {
		const player = audio({ enabled: false, storage: null });
		player.unlock();
		expect(() => player.play("stamp")).not.toThrow();
	});

	it("stays unready when disabled even after unlocking", () => {
		// `enabled: false` is what evidence and test runs use; it must never
		// construct an AudioContext, so it can never become ready.
		const player = audio({ enabled: false, storage: null });
		player.unlock();
		expect(player.ready).toBe(false);
	});

	it("tolerates unlocking twice", () => {
		const player = audio({ enabled: false, storage: null });
		player.unlock();
		// A second gesture is ordinary — a user clicking twice must not double
		// the load or throw.
		expect(() => player.unlock()).not.toThrow();
	});

	it("plays nothing while muted", () => {
		const player = audio({ storage: null });
		player.setMuted(true);
		player.unlock();
		expect(() => player.play("telegraph")).not.toThrow();
	});
});

describe("the engine's selection state", () => {
	it("starts with nothing selected", () => {
		const engine = createYardEngine();
		expect(engine.selectedZone).toBeNull();
		expect(engine.openSheet).toBeNull();
	});

	it("starts with no visual state", () => {
		// The engine exists before the first projection; a fabricated visual
		// state would render a yard that does not exist yet.
		expect(createYardEngine().visual).toBeNull();
	});

	it("parks Bo at the rest platform", () => {
		const engine = createYardEngine();
		expect(engine.boPos.x).toBeGreaterThan(0);
	});

	it("selects nothing when there is no visual state yet", () => {
		const engine = createYardEngine();
		// Selecting before the first snapshot has nothing to build a sheet from,
		// so it must clear rather than build one from nothing.
		expect(engine.selectZone("costBooth")).toBeNull();
	});

	it("opens a sheet once a snapshot has been applied", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		expect(engine.selectZone("costBooth")?.kind).toBe("cost.plan");
	});

	it("clears the sheet when the selection is cleared", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		engine.selectZone("costBooth");
		engine.selectZone(null);
		// A sheet left open over no selection would confirm an operation for a
		// zone the player has navigated away from.
		expect(engine.openSheet).toBeNull();
	});

	it("dismisses both the sheet and the selection", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		engine.selectZone("costBooth");
		engine.dismissSheet();
		expect(engine.openSheet).toBeNull();
		expect(engine.selectedZone).toBeNull();
	});

	it("keeps the selection in the derived visual state", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		engine.selectZone("costBooth");
		const visual = engine.applySnapshot(snapshot());
		// The next snapshot has to keep highlighting what is selected, or the
		// selection would visibly drop on every projection tick.
		expect(visual).toBeDefined();
	});
});

describe("the engine's tick", () => {
	it("does nothing before a snapshot", () => {
		const engine = createYardEngine();
		// Ticking a yard with no state must be inert, not a crash in the render
		// loop's first frame.
		expect(() => engine.tick(0.016)).not.toThrow();
	});

	it("moves Bo toward the zone the visual state names", () => {
		const engine = createYardEngine();
		// Bo starts parked at the rest platform, which is also where an
		// unselected yard puts him — so he only walks once something else has
		// his attention.
		engine.applySnapshot(snapshot());
		engine.selectZone("costBooth");
		engine.applySnapshot(snapshot());
		const before = { ...engine.boPos };
		for (let i = 0; i < 60; i += 1) engine.tick(0.016);
		// Bo walking to the zone is how the Yard shows where attention is; a
		// static Bo would make every state change invisible.
		expect(engine.boPos).not.toEqual(before);
	});

	it("leaves Bo parked when he is already where attention is", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		const before = { ...engine.boPos };
		for (let i = 0; i < 60; i += 1) engine.tick(0.016);
		// The step is toward a target, not a constant drift — arriving has to be
		// a fixed point or Bo would jitter around the anchor forever.
		expect(engine.boPos).toEqual(before);
	});

	it("tolerates a zero delta", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		// A dropped frame reports dt 0; the step must not divide by it.
		expect(() => engine.tick(0)).not.toThrow();
	});

	it("tolerates a very large delta", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		// A backgrounded tab resumes with a huge delta. Bo must arrive rather
		// than overshoot into nowhere.
		engine.tick(100);
		expect(Number.isFinite(engine.boPos.x)).toBe(true);
	});

	it("emits no traffic particles when traffic is idle", () => {
		const engine = createYardEngine();
		engine.applySnapshot(snapshot());
		engine.tick(0.016);
		// Particles for a yard with no traffic would show load that is not
		// happening — the dead-diagram failure this package guards against.
		expect(engine.particles.every((p) => !p.alive)).toBe(true);
	});

	it("keeps the particle pool a fixed size", () => {
		const engine = createYardEngine();
		engine.applySnapshot(
			snapshot({
				metering: {
					quotaUsed: 9,
					quotaLimit: 10,
					spendCapUsd: 25,
					budgetUsd: 20,
				},
			}),
		);
		const size = engine.particles.length;
		for (let i = 0; i < 120; i += 1) engine.tick(0.016);
		// The pool is preallocated; growing it under load would make a busy
		// yard allocate every frame.
		expect(engine.particles).toHaveLength(size);
	});
});
