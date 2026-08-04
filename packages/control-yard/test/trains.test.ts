import { describe, expect, it } from "vitest";
import { YARD_LAYOUT } from "../src/layout.js";
import { presentYard } from "../src/phaser/yard-presenter.js";
import {
	anyDerailed,
	type DeploymentsWireView,
	type DeploymentWireRow,
	deriveTrains,
	isPartialView,
	phaseForRow,
	reasonForRow,
} from "../src/trains.js";

function row(over: Partial<DeploymentWireRow> = {}): DeploymentWireRow {
	return {
		deploymentId: "dep-1",
		status: "planned",
		resources: { "svc/api": "provisioned", "svc/db": "provisioning" },
		...over,
	};
}

function view(over: Partial<DeploymentsWireView> = {}): DeploymentsWireView {
	return { available: true, deployments: [row()], count: 1, ...over };
}

describe("train traffic", () => {
	it("draws no trains when the projection is unavailable (never fabricates traffic)", () => {
		expect(deriveTrains({ available: false })).toEqual([]);
		expect(deriveTrains(null)).toEqual([]);
		expect(deriveTrains({ available: true, deployments: [] })).toEqual([]);
	});

	it("maps saga status to train phase", () => {
		expect(phaseForRow(row({ status: "requested" }))).toBe("assembling");
		expect(phaseForRow(row({ status: "planned" }))).toBe("running");
		expect(phaseForRow(row({ status: "deployed" }))).toBe("arrived");
		expect(phaseForRow(row({ status: "rejected" }))).toBe("derailed");
		expect(phaseForRow(row({ status: "rolled-back" }))).toBe("backing");
	});

	it("derails on a failed resource even when the header status looks healthy", () => {
		const derailed = phaseForRow(
			row({ status: "deployed", resources: { "svc/api": "failed" } }),
		);
		expect(derailed).toBe("derailed");
	});

	it("maps each resource lifecycle to a car visual", () => {
		const [train] = deriveTrains(
			view({
				deployments: [
					row({
						resources: {
							a: "provisioning",
							b: "provisioned",
							c: "destroying",
							d: "destroyed",
						},
					}),
				],
			}),
		);
		const visuals = Object.fromEntries(
			(train?.cars ?? []).map((c) => [c.resource, c.visual]),
		);
		expect(visuals).toEqual({
			a: "outline",
			b: "solid",
			c: "hatched",
			d: "ghost",
		});
	});

	it("reverses the consist when backing up (compensation order)", () => {
		const [forward] = deriveTrains(
			view({ deployments: [row({ status: "planned" })] }),
		);
		const [backing] = deriveTrains(
			view({ deployments: [row({ status: "rolled-back" })] }),
		);
		expect(forward?.cars.map((c) => c.resource)).toEqual(["svc/api", "svc/db"]);
		expect(backing?.cars.map((c) => c.resource)).toEqual(["svc/db", "svc/api"]);
	});

	it("keeps a long consist inside the rail track bounds in every phase", () => {
		const track = YARD_LAYOUT.zones.activeRailTrack;
		// A wide deployment must not trail cars off the west end of the rail.
		const resources = Object.fromEntries(
			Array.from({ length: 8 }, (_, i) => [`svc/r${i}`, "provisioned"]),
		) as Record<string, "provisioned">;
		for (const status of [
			"requested",
			"planned",
			"deployed",
			"rejected",
			"rolled-back",
		] as const) {
			const [train] = deriveTrains(
				view({ deployments: [row({ status, resources })] }),
			);
			expect(train).toBeDefined();
			if (!train) continue;
			expect(train.locomotiveX).toBeGreaterThanOrEqual(track.x);
			expect(train.locomotiveX).toBeLessThanOrEqual(track.x + track.width);
			for (const car of train.cars) {
				expect(car.x, `${status} car ${car.resource}`).toBeGreaterThanOrEqual(
					track.x,
				);
				expect(car.x + car.w).toBeLessThanOrEqual(track.x + track.width);
			}
		}
	});

	it("stacks concurrent trains on distinct sidings", () => {
		const trains = deriveTrains(
			view({
				deployments: [
					row({ deploymentId: "d1" }),
					row({ deploymentId: "d2" }),
					row({ deploymentId: "d3" }),
				],
			}),
		);
		const ys = new Set(trains.map((t) => t.y));
		expect(trains).toHaveLength(3);
		expect(ys.size).toBe(3);
	});

	it("surfaces the real failure reason, never a generic one", () => {
		expect(
			reasonForRow(
				row({ status: "rejected", rejection: { reason: "budget cap" } }),
			),
		).toBe("budget cap");
		expect(reasonForRow(row({ resources: { "svc/db": "failed" } }))).toBe(
			"failed: svc/db",
		);
		expect(reasonForRow(row())).toBeNull();
	});

	it("reports derailment for the hit-stop/hurt cue", () => {
		expect(anyDerailed(deriveTrains(view()))).toBe(false);
		expect(
			anyDerailed(
				deriveTrains(view({ deployments: [row({ status: "rejected" })] })),
			),
		).toBe(true);
	});
});

describe("train rendering", () => {
	function render(over: Partial<DeploymentsWireView> = {}) {
		const trains = deriveTrains(view(over));
		return presentYard({
			visual: null,
			zone: "platformRest",
			selectedZone: null,
			speech: null,
			particles: [],
			testMode: true,
			ready: true,
			world: null,
			scenarioMode: false,
			waybills: [],
			highball: false,
			trains,
		}).items;
	}

	it("draws a locomotive and one car per resource", () => {
		const items = render();
		expect(items.find((i) => i.id === "train-dep-1-loco")).toBeDefined();
		expect(
			items.filter((i) => /^train-dep-1-car-\d+$/.test(i.id)),
		).toHaveLength(2);
	});

	it("renders nothing when the projection is unavailable", () => {
		const items = render({ available: false });
		expect(items.some((i) => i.id.startsWith("train-"))).toBe(false);
	});

	it("spends spark only on a derail, and states the real reason", () => {
		const clean = render();
		expect(clean.some((i) => "stroke" in i && i.stroke === "#c34b35")).toBe(
			false,
		);
		const items = render({
			deployments: [
				row({ status: "rejected", rejection: { reason: "budget cap" } }),
			],
		});
		const reason = items.find((i) => i.id === "train-dep-1-reason");
		expect(reason?.kind).toBe("text");
		if (reason?.kind === "text") {
			expect(reason.text).toBe("budget cap");
			expect(reason.color).toBe("#c34b35");
		}
	});
});

describe("partial deployment views are badged, never drawn as complete", () => {
	it("detects a view that could not read part of the estate", () => {
		expect(isPartialView(null)).toBe(false);
		expect(isPartialView({ available: true, deployments: [] })).toBe(false);
		expect(
			isPartialView({
				available: true,
				deployments: [],
				skippedYards: ["yard-b"],
			}),
		).toBe(true);
	});

	it("renders a PARTIAL badge on the rail, and only then", () => {
		const base = {
			visual: null,
			boPos: { x: 200, y: 600 },
			boAnimationId: "",
			zone: "platformRest" as const,
			selectedZone: null,
			speech: null,
			particles: [],
			testMode: true,
			ready: true,
			hasImage: () => false,
			world: null,
			scenarioMode: false,
			waybills: [],
			highball: false,
			trains: [],
		};
		const has = (partial: boolean) =>
			presentYard({ ...base, trainsPartial: partial }).items.some(
				(i) => i.id === "trains-partial-badge",
			);
		expect(has(true)).toBe(true);
		expect(has(false)).toBe(false);
	});
});
