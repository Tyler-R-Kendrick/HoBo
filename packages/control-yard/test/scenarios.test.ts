import { describe, expect, it } from "vitest";

import { deriveYardVisualState } from "../src/entity-state.js";
import { zoneAnchor } from "../src/layout.js";
import { SCENARIOS, type YardScenario } from "../src/scenarios/index.js";
import type { YardTestEntity, YardTestState } from "../src/test-seam.js";
import { isTestMode } from "../src/test-seam.js";
import { createYardEngine, type YardEngine } from "../src/yard-engine.js";

const ALL = Object.values(SCENARIOS);

/** Mirror main.ts entity assembly: bo always, guest when a conn is authorized. */
function entitiesFromEngine(engine: YardEngine): readonly YardTestEntity[] {
	const entities: YardTestEntity[] = [
		{
			id: "bo",
			animationId: engine.visual?.bo.animationId ?? "bo.idle",
			x: Math.round(engine.boPos.x),
			y: Math.round(engine.boPos.y),
		},
	];
	if (engine.visual?.connections.some((c) => c.visual === "authorized")) {
		const bay = zoneAnchor("connectionBay");
		entities.push({
			id: "guest-swe-claude",
			animationId: "guest.swe-claude.work",
			x: bay.x,
			y: bay.y,
		});
	}
	return entities;
}

/** Mirror main.ts seam state assembly from engine + snapshot at a tick. */
function stateAt(scenario: YardScenario, tick: number): YardTestState {
	const engine = createYardEngine();
	for (let t = 0; t <= tick; t += 1) {
		engine.applySnapshot(scenario.snapshotAt(t));
		engine.tick(1 / scenario.ticksPerSecond);
	}
	const snap = scenario.snapshotAt(tick);
	const visual = engine.visual;
	return Object.freeze({
		scene: "Yard",
		ready: true,
		seed: scenario.seed,
		frameCount: tick,
		zone: visual?.bo.zone ?? null,
		bo: Object.freeze({
			x: Math.round(engine.boPos.x),
			y: Math.round(engine.boPos.y),
			animationId: visual?.bo.animationId ?? "bo.idle",
			facing: visual?.bo.facing ?? "east",
		}),
		occupyMode: snap.occupyMode,
		connCount: snap.connections.length,
		trafficRate: snap.metering.trafficRate,
		bootstrapActive: snap.occupancy.bootstrapActive,
		sheetOpen: false,
		sheetKind: null,
		seq: snap.seq,
		hazards: Object.freeze([...snap.doctor.hazards]),
		theme: "day",
		scenario: scenario.id,
		tick,
		entities: entitiesFromEngine(engine),
		recentFx: Object.freeze([]),
		world: null,
	});
}

describe("deterministic yard scenarios", () => {
	it("registers the six scripted scenarios with declared seeds", () => {
		expect(Object.keys(SCENARIOS).sort()).toEqual([
			"deploy-saga",
			"first-run",
			"incident-storm",
			"quiet-yard",
			"quota-exhaustion",
			"revoked-connection",
		]);
		expect(SCENARIOS["quiet-yard"]?.seed).toBe(42);
		expect(SCENARIOS["incident-storm"]?.seed).toBe(1337);
		for (const scenario of ALL) {
			expect(scenario.totalTicks).toBeGreaterThan(0);
			expect(scenario.ticksPerSecond).toBeGreaterThan(0);
			expect(scenario.expectedBeats.length).toBeGreaterThan(0);
		}
	});

	it("snapshotAt is deterministic: same scenario+tick → deep-equal snapshots", () => {
		for (const scenario of ALL) {
			for (const tick of [
				0,
				1,
				Math.floor(scenario.totalTicks / 2),
				scenario.totalTicks,
			]) {
				const a = scenario.snapshotAt(tick);
				const b = scenario.snapshotAt(tick);
				expect(a).toEqual(b);
			}
		}
	});

	it("two engine instances replaying the same scenario stay identical", () => {
		for (const scenario of ALL) {
			const a = createYardEngine();
			const b = createYardEngine();
			for (let t = 0; t <= scenario.totalTicks; t += 1) {
				a.applySnapshot(scenario.snapshotAt(t));
				b.applySnapshot(scenario.snapshotAt(t));
				a.tick(1 / scenario.ticksPerSecond);
				b.tick(1 / scenario.ticksPerSecond);
			}
			expect(a.boPos).toEqual(b.boPos);
			expect(a.visual).toEqual(b.visual);
		}
	});

	it("seq is monotonic non-decreasing over the full timeline", () => {
		for (const scenario of ALL) {
			let prev = scenario.snapshotAt(0).seq;
			for (let t = 1; t <= scenario.totalTicks; t += 1) {
				const seq = scenario.snapshotAt(t).seq;
				expect(seq, `${scenario.id} seq at tick ${t}`).toBeGreaterThanOrEqual(
					prev,
				);
				prev = seq;
			}
		}
	});

	it("seq increases whenever snapshot content changes", () => {
		for (const scenario of ALL) {
			for (let t = 1; t <= scenario.totalTicks; t += 1) {
				const prev = scenario.snapshotAt(t - 1);
				const next = scenario.snapshotAt(t);
				const prevContent = JSON.stringify({ ...prev, seq: 0 });
				const nextContent = JSON.stringify({ ...next, seq: 0 });
				if (prevContent !== nextContent) {
					expect(
						next.seq,
						`${scenario.id} content changed at tick ${t}`,
					).toBeGreaterThan(prev.seq);
				}
			}
		}
	});

	it("every snapshot passes deriveYardVisualState without throwing", () => {
		for (const scenario of ALL) {
			for (let t = 0; t <= scenario.totalTicks; t += 1) {
				expect(() =>
					deriveYardVisualState(scenario.snapshotAt(t)),
				).not.toThrow();
			}
		}
	});

	it("every expectedBeat's seamPredicate is satisfiable within ±5 ticks", () => {
		for (const scenario of ALL) {
			for (const beat of scenario.expectedBeats) {
				const lo = Math.max(0, beat.atTick - 5);
				const hi = Math.min(scenario.totalTicks, beat.atTick + 5);
				let satisfied = false;
				for (let t = lo; t <= hi && !satisfied; t += 1) {
					satisfied = beat.seamPredicate(stateAt(scenario, t));
				}
				expect(
					satisfied,
					`${scenario.id} beat "${beat.label}" @${beat.atTick}`,
				).toBe(true);
			}
		}
	});

	it("beat regions come from layout rects (inside the yard bounds)", () => {
		for (const scenario of ALL) {
			for (const beat of scenario.expectedBeats) {
				expect(beat.region.w).toBeGreaterThan(0);
				expect(beat.region.h).toBeGreaterThan(0);
				expect(beat.region.x).toBeGreaterThanOrEqual(0);
				expect(beat.region.y).toBeGreaterThanOrEqual(0);
				expect(beat.region.x + beat.region.w).toBeLessThanOrEqual(1280);
				expect(beat.region.y + beat.region.h).toBeLessThanOrEqual(720);
			}
		}
	});

	it("isTestMode parses &scenario= and keeps existing fields", () => {
		const parsed = isTestMode("?test=1&seed=7&scenario=quiet-yard");
		expect(parsed.testMode).toBe(true);
		expect(parsed.seed).toBe(7);
		expect(parsed.scenario).toBe("quiet-yard");
		expect(isTestMode("?test=1").scenario).toBe(null);
	});
});
