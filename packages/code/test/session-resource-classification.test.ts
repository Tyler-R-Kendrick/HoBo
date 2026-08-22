/**
 * Which resources the dashboard is allowed to stop.
 *
 * Every row on the resource dashboard has a stop button, and these predicates
 * decide whether pressing it does anything. The rule they enforce is stated in
 * the source, twice, in the refusal messages themselves:
 *
 * > Stations can't shut themselves down — the hosting Station, camp:code, and
 * > bindle:code stay up
 *
 * > Stations can't stop their own occupancy sidecars — dashboard, Evidence,
 * > OTLP, and the rest stay up with the Station
 *
 * The failure being prevented is specific and unrecoverable from inside the
 * product: the dashboard runs *on* the Station. A user who stops the hosting
 * Station kills the process serving the page they clicked on, and the way back
 * is a terminal and a command they have not been shown. Same for the sidecars
 * — Evidence and the dashboard itself are among them.
 *
 * So the classification is deliberately conservative, and the tests below are
 * mostly about the boundaries: `yard:x` controls a flow but
 * `yard:x:named-endpoints` controls a different plane; `camp:foo` is a camp
 * plane but `camp:foo/bar` is not. Each of those distinctions decides which
 * button does what, and getting one wrong either bricks the page or leaves a
 * control inert.
 *
 * Pure string predicates — no filesystem, no station.
 */
import { describe, expect, it } from "vitest";

import {
	controlsBindleProcess,
	controlsCampPlane,
	controlsNamedEndpointPlane,
	controlsOccupancyFlow,
	isHostStationStack,
	isProcessBackedResource,
	isStationResource,
} from "../src/session-resource-control.js";

describe("what counts as a station", () => {
	it("recognises a station id", () => {
		expect(isStationResource("station:local")).toBe(true);
	});

	it("recognises any station, not just the local one", () => {
		expect(isStationResource("station:some-remote")).toBe(true);
	});

	it("does not recognise a bindle as a station", () => {
		expect(isStationResource("bindle:code")).toBe(false);
	});

	it("does not recognise a bare word as a station", () => {
		expect(isStationResource("station")).toBe(false);
	});

	it("requires the prefix at the start", () => {
		// A substring match would classify `my-station:thing` as a station and
		// make its stop button inert.
		expect(isStationResource("my-station:thing")).toBe(false);
	});

	it("does not recognise an empty id", () => {
		expect(isStationResource("")).toBe(false);
	});
});

describe("the stack that cannot stop itself", () => {
	it("protects the hosting station", () => {
		// The dashboard runs on it. Stopping it kills the process serving the
		// page the user clicked on, and the way back is a terminal command
		// they have not been shown.
		expect(isHostStationStack("station:local")).toBe(true);
	});

	it("protects the code camp", () => {
		expect(isHostStationStack("camp:code")).toBe(true);
	});

	it("protects the code bindle", () => {
		expect(isHostStationStack("camp:code")).toBe(true);
		expect(isHostStationStack("bindle:code")).toBe(true);
	});

	it("does not protect another camp", () => {
		// Only the one hosting this session. Protecting every camp would make
		// the dashboard unable to stop anything it exists to manage.
		expect(isHostStationStack("camp:something-else")).toBe(false);
	});

	it("does not protect another bindle", () => {
		expect(isHostStationStack("bindle:my-app")).toBe(false);
	});

	it("does not protect a yard", () => {
		expect(isHostStationStack("yard:local")).toBe(false);
	});

	it("protects every station, not only the current one", () => {
		// Conservative on purpose: the predicate cannot tell which station is
		// hosting, so it treats them all as unstoppable from here.
		expect(isHostStationStack("station:anything")).toBe(true);
	});
});

describe("what controls a bindle process", () => {
	it.each(["bindle:code", "bindle:my-app"])("recognises %s", (id) => {
		expect(controlsBindleProcess(id)).toBe(true);
	});

	it.each([
		"web",
		"api",
		"debug",
		"service",
	])("recognises the bare %s process", (id) => {
		// The four unprefixed names a Bindle's own processes use. Missing one
		// would leave its row with a button that does nothing.
		expect(controlsBindleProcess(id)).toBe(true);
	});

	it("does not recognise a name merely containing one of them", () => {
		// `webhook` is not `web`; an exact match is what keeps an unrelated
		// resource from being stopped by the wrong button.
		expect(controlsBindleProcess("webhook")).toBe(false);
	});

	it("does not recognise a yard", () => {
		expect(controlsBindleProcess("yard:local")).toBe(false);
	});

	it("does not recognise a station", () => {
		expect(controlsBindleProcess("station:local")).toBe(false);
	});

	it("treats a bindle process as process-backed", () => {
		// The two are the same set today. Pinned so a future divergence is a
		// deliberate edit rather than a silent one.
		expect(isProcessBackedResource("bindle:code")).toBe(
			controlsBindleProcess("bindle:code"),
		);
	});

	it("treats a yard as not process-backed", () => {
		expect(isProcessBackedResource("yard:local")).toBe(false);
	});
});

describe("yards, flows and endpoint planes", () => {
	it("treats a plain yard as an occupancy flow", () => {
		expect(controlsOccupancyFlow("yard:local")).toBe(true);
	});

	it("does not treat a yard's endpoint plane as its flow", () => {
		// The boundary that matters: `yard:local` and
		// `yard:local:named-endpoints` are two rows with two different stop
		// buttons. Conflating them would stop the wrong one.
		expect(controlsOccupancyFlow("yard:local:named-endpoints")).toBe(false);
	});

	it("treats the endpoint suffix as its own plane", () => {
		expect(controlsNamedEndpointPlane("yard:local:named-endpoints")).toBe(true);
	});

	it("does not treat a plain yard as an endpoint plane", () => {
		expect(controlsNamedEndpointPlane("yard:local")).toBe(false);
	});

	it("recognises an endpoint plane on any owner, not just a yard", () => {
		// The check is on the suffix alone, so a camp's endpoint plane is
		// classified the same way.
		expect(controlsNamedEndpointPlane("camp:code:named-endpoints")).toBe(true);
	});

	it("does not treat a non-yard as a flow", () => {
		expect(controlsOccupancyFlow("camp:code")).toBe(false);
	});

	it("keeps the two classifications mutually exclusive for a yard", () => {
		// Every yard-shaped id is one or the other, never both -- a row that
		// matched both would have two handlers race for one button.
		for (const id of ["yard:local", "yard:local:named-endpoints"]) {
			expect(controlsOccupancyFlow(id) && controlsNamedEndpointPlane(id)).toBe(
				false,
			);
		}
	});
});

describe("camp planes", () => {
	it("recognises a camp", () => {
		expect(controlsCampPlane("camp:code")).toBe(true);
	});

	it("recognises a camp with a hyphenated name", () => {
		expect(controlsCampPlane("camp:my-camp")).toBe(true);
	});

	it("does not recognise something below a camp", () => {
		// The pattern excludes `/` on purpose: `camp:foo/bar` is a resource
		// inside a camp, not the camp plane itself, and stopping the plane
		// would take down its siblings too.
		expect(controlsCampPlane("camp:foo/bar")).toBe(false);
	});

	it("does not recognise a camp prefix with nothing after it", () => {
		expect(controlsCampPlane("camp:")).toBe(false);
	});

	it("requires the prefix at the start", () => {
		expect(controlsCampPlane("my-camp:code")).toBe(false);
	});

	it("does not recognise a yard as a camp plane", () => {
		expect(controlsCampPlane("yard:local")).toBe(false);
	});

	it("does not recognise a bindle as a camp plane", () => {
		expect(controlsCampPlane("bindle:code")).toBe(false);
	});
});

describe("the classifications together", () => {
	// A row gets exactly one kind of stop behaviour. Two predicates matching
	// one id would mean two handlers competing for the same button, and which
	// one won would depend on the order they happen to be checked in.
	const IDS = [
		"station:local",
		"camp:code",
		"bindle:code",
		"bindle:my-app",
		"yard:local",
		"yard:local:named-endpoints",
		"camp:other",
		"web",
		"api",
	];

	it.each(IDS)("classifies %s as at most one process-or-plane kind", (id) => {
		const matches = [
			controlsBindleProcess(id),
			controlsOccupancyFlow(id),
			controlsNamedEndpointPlane(id),
			controlsCampPlane(id),
		].filter(Boolean).length;
		expect(matches).toBeLessThanOrEqual(1);
	});

	it("classifies every listed id as something", () => {
		// An id that matched nothing would render a row with an inert button
		// and no explanation.
		for (const id of IDS) {
			const known =
				isHostStationStack(id) ||
				controlsBindleProcess(id) ||
				controlsOccupancyFlow(id) ||
				controlsNamedEndpointPlane(id) ||
				controlsCampPlane(id);
			expect(known).toBe(true);
		}
	});

	it("classifies an unknown id as nothing rather than guessing", () => {
		// The safe direction: an unrecognised resource gets no stop behaviour
		// instead of the nearest one.
		const id = "reticulator:splines";
		expect(
			isHostStationStack(id) ||
				controlsBindleProcess(id) ||
				controlsOccupancyFlow(id) ||
				controlsNamedEndpointPlane(id) ||
				controlsCampPlane(id),
		).toBe(false);
	});

	it("survives an empty id without matching anything", () => {
		expect(
			isHostStationStack("") ||
				controlsBindleProcess("") ||
				controlsOccupancyFlow("") ||
				controlsNamedEndpointPlane("") ||
				controlsCampPlane(""),
		).toBe(false);
	});
});
