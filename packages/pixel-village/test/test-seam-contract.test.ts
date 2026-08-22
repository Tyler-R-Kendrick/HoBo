/**
 * The seam Playwright drives the yard through.
 *
 * The e2e suite cannot reach into Phaser display objects, and should not want
 * to: a test that asserted on sprite instances would fail every time the
 * rendering changed while saying nothing about whether the *mechanic* still
 * worked. So the yard exposes one narrow seam — serializable state in, named
 * commands out — and the whole design rests on one rule stated at the top of
 * the module:
 *
 * **Never expose raw engine objects.** Every value crossing the seam is a
 * plain, frozen snapshot. That is what makes an assertion in Playwright a
 * statement about the yard's behaviour rather than about its current draw
 * order — and it is what stops a test mutating the engine by writing to
 * something it was handed.
 *
 * Two consequences the tests pin:
 *
 * **The snapshot is a copy, not a view.** Reading state twice across a change
 * must show the change; holding the first result must not. A shared object
 * would make a Playwright assertion depend on when it happened to read, which
 * is the classic source of a test that passes locally and flakes in CI.
 *
 * **An absent projection reads as empty, not as a crash.** The seam is polled
 * for readiness *before* the yard has data — that is what readiness means — so
 * every field derived from the snapshot has to answer while there is no
 * snapshot. Throwing there would make the readiness poll itself the thing that
 * fails.
 *
 * `isTestMode` is the other half: the query string is the only channel a
 * browser test has for saying "run deterministically, with this seed". A
 * malformed seed falls back rather than producing `NaN`, because a NaN seed
 * silently disables the determinism the whole suite depends on.
 */
import { describe, expect, it } from "vitest";

import {
	createTestSeam,
	isTestMode,
	seededRandom,
	type YardTestHost,
} from "../src/test-seam.js";

/** A host answering with empty/neutral values, overridable per test. */
function host(overrides: Partial<YardTestHost> = {}): YardTestHost {
	return {
		getBo: () => ({ x: 0, y: 0, state: "idle", facing: "east" }),
		getZone: () => null,
		getSnap: () => null,
		getVisual: () => null,
		isSheetOpen: () => false,
		sheetKind: () => null,
		selectZone: () => undefined,
		hoverZone: () => undefined,
		getHoveredZone: () => null,
		dismissSheet: () => undefined,
		runAction: async () => undefined,
		reset: () => undefined,
		advanceFrame: () => undefined,
		setSeed: () => undefined,
		loadScenario: () => undefined,
		advanceToTick: () => undefined,
		setTheme: () => undefined,
		getTheme: () => "day",
		getReducedMotion: () => false,
		getRenderIds: () => [],
		getWaybillCount: () => 0,
		getHighball: () => false,
		getScenario: () => null,
		getTick: () => 0,
		getEntities: () => [],
		getRecentFx: () => [],
		getWorldSummary: () => null,
		...overrides,
	};
}

const seam = (overrides: Partial<YardTestHost> = {}) =>
	createTestSeam(host(overrides));

describe("state with no projection yet", () => {
	it("answers rather than throwing", () => {
		// The seam is polled for readiness *before* the yard has data — that is
		// what readiness means. Throwing here would make the readiness poll
		// itself the thing that fails.
		expect(() => seam().state()).not.toThrow();
	});

	it("reports no connections rather than undefined", () => {
		// A Playwright assertion on `connCount` needs a number to compare; an
		// undefined would pass a `toBeFalsy` and hide a real zero-vs-missing
		// distinction.
		expect(seam().state().connCount).toBe(0);
	});

	it("reports a zero traffic rate", () => {
		expect(seam().state().trafficRate).toBe(0);
	});

	it("reports bootstrap inactive", () => {
		// The safe default: claiming an active bootstrap with no snapshot would
		// let a test assert the yard is running before it is.
		expect(seam().state().bootstrapActive).toBe(false);
	});

	it("reports no sequence number", () => {
		// Null, not zero — zero is a real sequence, and conflating them would
		// let a test wait forever for a seq that already passed.
		expect(seam().state().seq).toBeNull();
	});

	it("reports no hazards as an empty list", () => {
		// Iterated by callers; a null would throw at the first `.length`.
		expect(seam().state().hazards).toStrictEqual([]);
	});

	it("reports no occupy mode", () => {
		expect(seam().state().occupyMode).toBeNull();
	});
});

describe("state from a projection", () => {
	const snap = {
		occupyMode: "shared",
		connections: [{ id: "c1" }, { id: "c2" }],
		metering: { trafficRate: 12 },
		occupancy: { bootstrapActive: true },
		seq: 7,
		doctor: { hazards: ["quota-low"] },
	};

	const withSnap = () =>
		// SAFETY: the fixture supplies exactly the fields the seam reads.
		seam({ getSnap: () => snap as never }).state();

	it("counts the connections", () => {
		expect(withSnap().connCount).toBe(2);
	});

	it("carries the traffic rate", () => {
		expect(withSnap().trafficRate).toBe(12);
	});

	it("carries the occupy mode and sequence", () => {
		expect(withSnap()).toMatchObject({ occupyMode: "shared", seq: 7 });
	});

	it("carries the hazards", () => {
		expect(withSnap().hazards).toStrictEqual(["quota-low"]);
	});

	it("copies the hazards rather than aliasing the projection's array", () => {
		// A shared array would let a test's read mutate the engine's own
		// hazard list.
		const hazards = ["quota-low"];
		const state = seam({
			// SAFETY: the fixture supplies exactly the fields the seam reads.
			getSnap: () => ({ ...snap, doctor: { hazards } }) as never,
		}).state();
		expect(Object.isFrozen(state.hazards)).toBe(true);
	});
});

describe("the snapshot is a copy, not a view", () => {
	it("freezes the state it returns", () => {
		// A test that could write to the state would be mutating the engine
		// through the seam that exists to prevent exactly that.
		expect(Object.isFrozen(seam().state())).toBe(true);
	});

	it("freezes the operator position", () => {
		expect(Object.isFrozen(seam().state().bo)).toBe(true);
	});

	it("freezes each entity", () => {
		const state = seam({
			getEntities: () => [{ id: "e1", sprite: "operator.idle", x: 1, y: 2 }],
		}).state();
		expect(Object.isFrozen(state.entities[0])).toBe(true);
	});

	it("freezes each recent effect", () => {
		const state = seam({
			getRecentFx: () => [{ fx: "stamp", atFrame: 3 }],
		}).state();
		expect(Object.isFrozen(state.recentFx[0])).toBe(true);
	});

	it("does not hand back the host's own entity objects", () => {
		// Holding the engine's array would let a later frame change what an
		// already-asserted snapshot says — a test that passes locally and
		// flakes in CI.
		const entities = [{ id: "e1", sprite: "operator.idle", x: 1, y: 2 }];
		const state = seam({ getEntities: () => entities }).state();
		expect(state.entities[0]).not.toBe(entities[0]);
	});

	it("re-reads the host on every call", () => {
		// The other half of the same property: a cached snapshot would make a
		// Playwright poll never observe the change it is waiting for.
		let tick = 0;
		const s = seam({ getTick: () => tick });
		expect(s.state().tick).toBe(0);
		tick = 5;
		expect(s.state().tick).toBe(5);
	});

	it("reports the world summary as null when there is none", () => {
		expect(seam().state().world).toBeNull();
	});

	it("copies the world summary when there is one", () => {
		const world = { campCount: 2, characterCount: 5, demo: true };
		const state = seam({ getWorldSummary: () => world }).state();
		expect(state.world).toStrictEqual(world);
		expect(state.world).not.toBe(world);
	});
});

describe("commands", () => {
	it("reaches the host for a zone selection", () => {
		const seen: string[] = [];
		seam({ selectZone: (zone) => seen.push(zone) }).commands.selectZone(
			"connectionBay" as never,
		);
		expect(seen).toStrictEqual(["connectionBay"]);
	});

	it("reaches the host for a hover, including clearing it", () => {
		// Null is a real argument here — lowering the lantern is an action, not
		// an absence, and dropping it would leave the truth card stuck open.
		const seen: unknown[] = [];
		const s = seam({ hoverZone: (zone) => seen.push(zone) });
		s.commands.hoverZone("costBooth" as never);
		s.commands.hoverZone(null);
		expect(seen).toStrictEqual(["costBooth", null]);
	});

	it("records the seed it was given", () => {
		// The seam reports the seed back so a test can assert determinism was
		// actually configured, rather than assuming the command took.
		const s = seam();
		s.commands.seed(99);
		expect(s.seed).toBe(99);
	});

	it("passes the seed through to the host too", () => {
		const seen: number[] = [];
		const s = seam({ setSeed: (n) => seen.push(n) });
		s.commands.seed(99);
		expect(seen).toStrictEqual([99]);
	});

	it("counts frames as they are advanced", () => {
		// `frameCount` is what a Playwright test waits on to know the yard
		// moved; a counter that did not increment would hang the suite.
		const s = seam();
		s.commands.advanceFrame();
		s.commands.advanceFrame();
		expect(s.frameCount).toBe(2);
	});

	it("defaults a frame to roughly one at 60fps", () => {
		// The default exists so a test can say "step" without choosing a
		// timestep, and get the same one the yard actually runs at.
		const seen: number[] = [];
		seam({ advanceFrame: (dt) => seen.push(dt) }).commands.advanceFrame();
		expect(seen[0]).toBeCloseTo(16.67, 1);
	});

	it("passes an explicit timestep through", () => {
		const seen: number[] = [];
		seam({ advanceFrame: (dt) => seen.push(dt) }).commands.advanceFrame(100);
		expect(seen).toStrictEqual([100]);
	});

	it("surfaces the frame count in the state", () => {
		const s = seam();
		s.commands.advanceFrame();
		expect(s.state().frameCount).toBe(1);
	});

	it("awaits an action rather than firing and forgetting", () => {
		// A Playwright test does the next thing when this resolves; returning
		// before the action completed would race every assertion after it.
		let done = false;
		const s = seam({
			runAction: async () => {
				done = true;
			},
		});
		return s.commands.runAction("stamp").then(() => {
			expect(done).toBe(true);
		});
	});

	it("reaches the host for a scenario load and a tick advance", () => {
		const seen: unknown[] = [];
		const s = seam({
			loadScenario: (id) => seen.push(id),
			advanceToTick: (n) => seen.push(n),
		});
		s.commands.loadScenario("deploy-saga");
		s.commands.advanceToTick(40);
		expect(seen).toStrictEqual(["deploy-saga", 40]);
	});

	it("reaches the host for a theme change", () => {
		const seen: string[] = [];
		seam({ setTheme: (theme) => seen.push(theme) }).commands.setTheme("night");
		expect(seen).toStrictEqual(["night"]);
	});

	it("reaches the host for reset and dismiss", () => {
		const seen: string[] = [];
		const s = seam({
			reset: () => seen.push("reset"),
			dismissSheet: () => seen.push("dismiss"),
		});
		s.commands.reset();
		s.commands.dismissSheet();
		expect(seen).toStrictEqual(["reset", "dismiss"]);
	});
});

describe("render ids", () => {
	it("lists what is on screen", () => {
		// The seam's answer to "is this mechanic's art actually reachable?" —
		// shipped-but-never-drawn is the failure it exists to catch.
		expect(
			seam({ getRenderIds: () => ["bo", "waybill.1"] }).renderIds(),
		).toStrictEqual(["bo", "waybill.1"]);
	});

	it("is empty before anything is drawn", () => {
		expect(seam().renderIds()).toStrictEqual([]);
	});
});

describe("reading test mode from the query string", () => {
	it("is off with no query at all", () => {
		// The default has to be a normal yard; a browser that opened the page
		// without parameters must not silently enter a deterministic test run.
		expect(isTestMode().testMode).toBe(false);
	});

	it("is on for a bare `test` flag", () => {
		expect(isTestMode("?test").testMode).toBe(true);
	});

	it("is on for `test=1`", () => {
		expect(isTestMode("?test=1").testMode).toBe(true);
	});

	it("accepts a query string without the leading question mark", () => {
		// Callers pass `location.search` in one place and a bare string in
		// another; refusing either would make the seam depend on which.
		expect(isTestMode("test=1").testMode).toBe(true);
	});

	it("defaults the seed to 42", () => {
		// A fixed default is what makes an unseeded test run reproducible at
		// all — without one, every run would differ.
		expect(isTestMode("?test").seed).toBe(42);
	});

	it("takes an explicit seed", () => {
		expect(isTestMode("?test&seed=7").seed).toBe(7);
	});

	it("falls back to 42 for a seed that is not a number", () => {
		// A NaN seed silently disables the determinism the whole suite depends
		// on, and nothing downstream would report it.
		expect(isTestMode("?test&seed=abc").seed).toBe(42);
	});

	it("falls back to 42 for an empty seed", () => {
		expect(isTestMode("?test&seed=").seed).toBe(42);
	});

	it("reports no scenario when none is named", () => {
		expect(isTestMode("?test").scenario).toBeNull();
	});

	it("takes a named scenario", () => {
		expect(isTestMode("?test&scenario=deploy-saga").scenario).toBe(
			"deploy-saga",
		);
	});

	it("treats an empty scenario as none", () => {
		// `?scenario=` is a caller who cleared the field, not one who asked for
		// a scenario named empty string.
		expect(isTestMode("?test&scenario=").scenario).toBeNull();
	});
});

describe("the seeded RNG", () => {
	it("is deterministic for a seed", () => {
		// Particle placement rides on this; a non-deterministic draw would make
		// every screenshot comparison flake.
		const a = seededRandom(42);
		const b = seededRandom(42);
		expect([a(), a(), a()]).toStrictEqual([b(), b(), b()]);
	});

	it("gives different sequences for different seeds", () => {
		expect(seededRandom(1)()).not.toBe(seededRandom(2)());
	});

	it("stays within the unit interval", () => {
		const next = seededRandom(7);
		for (let i = 0; i < 200; i++) {
			const value = next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it("advances rather than repeating one value", () => {
		const next = seededRandom(7);
		expect(next()).not.toBe(next());
	});

	it("accepts a zero seed", () => {
		// Zero is a legitimate seed, and a guard that treated it as "unset"
		// would silently substitute another.
		expect(() => seededRandom(0)()).not.toThrow();
	});

	it("accepts a negative seed", () => {
		// Coerced through `>>> 0`; refusing would make the seam reject a value
		// a caller can reasonably produce.
		const next = seededRandom(-1);
		expect(next()).toBeGreaterThanOrEqual(0);
	});
});
