/**
 * Executable step definitions for control-yard-core-loop.feature.
 *
 * Drives the HEADLESS @hobo/control-yard library directly — `deriveWaybills`,
 * `isHighball`, `waybillForZone`, `createSpikeLedger`, `createYardEngine`,
 * `deriveYardVisualState` — against the committed deterministic scenarios.
 * Nothing here touches Phaser, the DOM, or control-api: the browser suite
 * (packages/control-yard/test/e2e/) covers the visible half of the loop.
 */
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import type { ZoneId } from "../../packages/control-yard/src/layout.js";
import type { YardScenario } from "../../packages/control-yard/src/scenarios/index.js";
import { SCENARIOS } from "../../packages/control-yard/src/scenarios/index.js";
import {
	createSpikeLedger,
	deriveWaybills,
	isHighball,
	type SpikeLedger,
	type Waybill,
	waybillForZone,
} from "../../packages/control-yard/src/waybills.js";
import { createYardEngine } from "../../packages/control-yard/src/yard-engine.js";

/** The projection shape the scenarios emit — no @hobo/management import needed. */
type YardProjectionSnapshot = ReturnType<YardScenario["snapshotAt"]>;

type CoreLoopWorld = {
	scenarioId?: string;
	snapshot?: YardProjectionSnapshot;
	spikes?: SpikeLedger;
};

/** Spike-filtered desk, exactly as main.ts's recomputeWaybills() builds it. */
function desk(world: CoreLoopWorld): Waybill[] {
	const snap = world.snapshot;
	assert.ok(snap, "no snapshot loaded — use the Given step first");
	const ledger = world.spikes;
	assert.ok(ledger, "no spike ledger — use the Given step first");
	return ledger.filter(deriveWaybills(snap));
}

function loadTick(world: CoreLoopWorld, tick: number): void {
	const id = world.scenarioId;
	assert.ok(id, "no scenario selected");
	const scenario = SCENARIOS[id];
	assert.ok(scenario, `unknown scenario: ${id}`);
	const snap = scenario.snapshotAt(tick);
	world.snapshot = snap;
	world.spikes?.onSeq(snap.seq);
}

Given(
	"the {string} scenario at tick {int}",
	function (this: CoreLoopWorld, id: string, tick: number) {
		assert.ok(SCENARIOS[id], `unknown scenario: ${id}`);
		this.scenarioId = id;
		this.spikes = createSpikeLedger();
		loadTick(this, tick);
	},
);

When(
	"the projection advances to tick {int}",
	function (this: CoreLoopWorld, tick: number) {
		loadTick(this, tick);
	},
);

When("the operator stamps the top waybill", function (this: CoreLoopWorld) {
	const top = desk(this)[0];
	assert.ok(top, "nothing on the desk to stamp");
	// A stamp fires the waybill's real confirm op; it never mutates the
	// projection locally (reality is the level designer). The world's response
	// arrives as the next snapshot — see "the flagged cause is fixed".
	assert.ok(top.confirmOp, `waybill ${top.id} has no confirm op`);
});

When("the flagged cause is fixed", function (this: CoreLoopWorld) {
	const snap = this.snapshot;
	assert.ok(snap, "no snapshot loaded");
	// The remediation the doctor's hint describes actually landing: the next
	// projection carries no hazards and a healthy activity row.
	this.snapshot = Object.freeze({
		...snap,
		doctor: Object.freeze({ ...snap.doctor, hazards: Object.freeze([]) }),
		activity: Object.freeze(
			snap.activity.map((a) => Object.freeze({ ...a, status: "working" })),
		),
		seq: snap.seq + 1,
	}) as YardProjectionSnapshot;
	this.spikes?.onSeq(this.snapshot.seq);
});

When("the operator spikes the top waybill", function (this: CoreLoopWorld) {
	const top = desk(this)[0];
	assert.ok(top, "nothing on the desk to spike");
	this.spikes?.spike(top.id);
});

Then(
	"exactly {int} waybill(s) is/are offered",
	function (this: CoreLoopWorld, count: number) {
		const offered = desk(this);
		assert.equal(
			offered.length,
			count,
			`expected ${count} waybill(s), got ${offered.length}: ${offered.map((w) => w.kind).join(", ")}`,
		);
	},
);

Then(
	"at least {int} waybill(s) is/are offered",
	function (this: CoreLoopWorld, count: number) {
		const offered = desk(this);
		assert.ok(
			offered.length >= count,
			`expected at least ${count} waybill(s), got ${offered.length}`,
		);
	},
);

Then("the top waybill is {string}", function (this: CoreLoopWorld, kind: string) {
	const top = desk(this)[0];
	assert.ok(top, "the desk is empty");
	assert.equal(top.kind, kind);
});

Then(
	"the top waybill confirms with the {string} op",
	function (this: CoreLoopWorld, op: string) {
		const top = desk(this)[0];
		assert.ok(top, "the desk is empty");
		assert.equal(top.confirmOp, op);
	},
);

Then(
	"the top waybill has blast radius {string}",
	function (this: CoreLoopWorld, radius: string) {
		const top = desk(this)[0];
		assert.ok(top, "the desk is empty");
		assert.equal(top.blastRadius, radius);
	},
);

Then(
	"no {string} waybill is offered",
	function (this: CoreLoopWorld, kind: string) {
		const offered = desk(this);
		assert.ok(
			!offered.some((w) => w.kind === kind),
			`did not expect a ${kind} waybill, desk: ${offered.map((w) => w.kind).join(", ")}`,
		);
	},
);

Then("the board is Highball", function (this: CoreLoopWorld) {
	const snap = this.snapshot;
	assert.ok(snap, "no snapshot loaded");
	assert.equal(isHighball(snap, desk(this)), true, "expected a clean board");
});

Then("the board is not Highball", function (this: CoreLoopWorld) {
	const snap = this.snapshot;
	assert.ok(snap, "no snapshot loaded");
	assert.equal(isHighball(snap, desk(this)), false, "expected real work on the board");
});

Then("a hazard is showing", function (this: CoreLoopWorld) {
	assert.ok(
		(this.snapshot?.doctor.hazards.length ?? 0) > 0,
		"expected at least one hazard",
	);
});

Then("no hazard is showing", function (this: CoreLoopWorld) {
	assert.equal(this.snapshot?.doctor.hazards.length ?? -1, 0);
});

Then("Bo stands at the {string}", function (this: CoreLoopWorld, zone: string) {
	const snap = this.snapshot;
	assert.ok(snap, "no snapshot loaded");
	const engine = createYardEngine();
	const visual = engine.applySnapshot(snap);
	assert.equal(visual.bo.zone, zone);
});

Then(
	"the {string} zone opens a {string} waybill",
	function (this: CoreLoopWorld, zone: string, kind: string) {
		const routed = waybillForZone(zone as ZoneId, desk(this));
		assert.ok(routed, `${zone} routed to no waybill`);
		assert.equal(routed.kind, kind);
	},
);

Then(
	"the {string} zone opens the top waybill",
	function (this: CoreLoopWorld, zone: string) {
		const offered = desk(this);
		const routed = waybillForZone(zone as ZoneId, offered);
		assert.ok(routed, `${zone} routed to no waybill`);
		assert.equal(routed.id, offered[0]?.id);
	},
);

Then(
	"the {string} zone opens no waybill",
	function (this: CoreLoopWorld, zone: string) {
		assert.equal(waybillForZone(zone as ZoneId, desk(this)), null);
	},
);
