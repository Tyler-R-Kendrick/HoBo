/**
 * Start/stop for the dashboard's managed resources.
 *
 * Station, Yard and Camp are primitives; their children are what a user can
 * actually toggle. The control surface exists to keep three invariants that a
 * naive "just call stop" implementation would break:
 *
 * **The hosting Station cannot shut itself down.** The dashboard runs inside
 * `camp:code`/`bindle:code`, so a stop that reached them would kill the very
 * process serving the button. Occupancy sidecars are refused for the same
 * reason — the Evidence and OTLP surfaces belong to the Station's own life.
 *
 * **Enablement is durable, not in-memory.** A resource disabled before a
 * restart must come back disabled; the flag lives in a JSON file beside the
 * session, keyed by station and environment so two environments in one home
 * never share state.
 *
 * **Halting a yard's flow or a camp halts what runs beneath it.** Starting a
 * Bindle while its yard flow is halted must refuse with a message naming what
 * to start, rather than launching a process the user believes is gated.
 *
 * The controller takes an injected dev-session starter and sidecar control, so
 * these tests drive the real decision logic without launching anything.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	controlsBindleProcess,
	controlsCampPlane,
	controlsNamedEndpointPlane,
	controlsOccupancyFlow,
	createOccupancyController,
	isHostStationStack,
	isManagedResourceEnabled,
	isOccupancySidecar,
	isProcessBackedResource,
	isStationResource,
	MANAGED_RESOURCE_STATE_SCHEMA,
	managedResourceStatePath,
	OCCUPANCY_FLOW_SCHEMA,
	occupancyCampIsActive,
	occupancyFlowIsActive,
	occupancyFlowPath,
	persistOccupancyRun,
	setManagedResourceEnabled,
	setOccupancyFlowActive,
} from "../src/session-resource-control.js";
import { CODE_BINDLE_ID, CODE_CAMP_ID } from "../src/session-resources.js";

const homes: string[] = [];

afterEach(() => {
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-resource-control-"));
	homes.push(dir);
	return dir;
}

const STATION = "station:local";
const ENVIRONMENT = "local-dev";

/** The station identity the controller resolves for a fresh home. */
const scope = (hoboHome: string) =>
	[hoboHome, STATION, ENVIRONMENT] as [string, string, string];

/** A controller whose side effects are all recorded rather than performed. */
function controller(hoboHome: string) {
	const started: string[] = [];
	const stopped: string[] = [];
	const devStarts: string[] = [];
	const control = createOccupancyController({
		hoboHome,
		env: { HOBO_ENV: ENVIRONMENT },
		projectRoot: hoboHome,
		sidecar: {
			async start(id) {
				started.push(id);
			},
			async stop(id) {
				stopped.push(id);
			},
		},
		async startDevSession(options) {
			devStarts.push(options.projectDir);
			return {
				appUrl: "http://127.0.0.1:1/",
				debugUrl: "http://127.0.0.1:1/?__hobo_debug=1",
				controlsUrl: "http://127.0.0.1:2/",
				reportUrl: "http://127.0.0.1:2/__hobo/evidence",
				sessionId: "session-1",
				pid: process.pid,
				close: async () => undefined,
				// SAFETY: the controller reads only the fields set above.
			} as never;
		},
	});
	return { control, started, stopped, devStarts };
}

describe("classifying a resource id", () => {
	it("recognises a station id", () => {
		expect(isStationResource("station:local")).toBe(true);
	});

	it("does not mistake a camp for a station", () => {
		expect(isStationResource("camp:local")).toBe(false);
	});

	it("treats the station, code camp and code bindle as one host stack", () => {
		// These three are the process serving the dashboard. Any one of them
		// stopping takes the UI down with it.
		expect(isHostStationStack("station:local")).toBe(true);
		expect(isHostStationStack(CODE_CAMP_ID)).toBe(true);
		expect(isHostStationStack(CODE_BINDLE_ID)).toBe(true);
	});

	it("leaves a user bindle outside the host stack", () => {
		expect(isHostStationStack("bindle:hello-world")).toBe(false);
	});

	it("recognises each occupancy sidecar by name", () => {
		for (const name of ["dashboard", "evidence", "otlp", "kms", "history"]) {
			expect(isOccupancySidecar(name)).toBe(true);
		}
	});

	it("does not treat an arbitrary name as a sidecar", () => {
		// A user resource called `worker` must remain stoppable; misclassifying
		// it would make it permanently refused.
		expect(isOccupancySidecar("worker")).toBe(false);
	});

	it("treats a bindle id as process-backed", () => {
		expect(controlsBindleProcess("bindle:hello-world")).toBe(true);
	});

	it("treats the well-known role names as process-backed", () => {
		// The dashboard shows a Bindle's roles by name; each one maps to the same
		// dev process, so each has to be recognised.
		for (const role of ["web", "api", "debug", "service"]) {
			expect(controlsBindleProcess(role)).toBe(true);
		}
	});

	it("does not treat a camp as process-backed", () => {
		expect(controlsBindleProcess(CODE_CAMP_ID)).toBe(false);
	});

	it("mirrors process-backed onto the resource predicate", () => {
		expect(isProcessBackedResource("web")).toBe(true);
		expect(isProcessBackedResource("yard:local")).toBe(false);
	});

	it("treats a yard as the occupancy flow control", () => {
		expect(controlsOccupancyFlow("yard:local")).toBe(true);
	});

	it("treats a yard flow suffix as the occupancy flow control", () => {
		expect(controlsOccupancyFlow("yard:local:flow")).toBe(true);
	});

	it("excludes the named-endpoint plane from flow control", () => {
		// The endpoint plane is a child of the yard, not the yard's traffic gate;
		// toggling it must not halt every camp underneath.
		expect(controlsOccupancyFlow("yard:local:named-endpoints")).toBe(false);
		expect(controlsNamedEndpointPlane("yard:local:named-endpoints")).toBe(true);
	});

	it("recognises a bare camp plane", () => {
		expect(controlsCampPlane("camp:hello-world")).toBe(true);
	});

	it("does not treat a nested camp path as a camp plane", () => {
		expect(controlsCampPlane("camp:hello-world/web")).toBe(false);
	});
});

describe("durable enablement", () => {
	it("reports a resource enabled when nothing was ever written", () => {
		const hoboHome = home();
		// Absence of the state file means nothing has been disabled; defaulting
		// the other way would present a fresh station as entirely off.
		expect(isManagedResourceEnabled(...scope(hoboHome), "web")).toBe(true);
	});

	it("records a disable and reads it back", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), "web", false);
		expect(isManagedResourceEnabled(...scope(hoboHome), "web")).toBe(false);
	});

	it("re-enables a disabled resource", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), "web", false);
		setManagedResourceEnabled(...scope(hoboHome), "web", true);
		expect(isManagedResourceEnabled(...scope(hoboHome), "web")).toBe(true);
	});

	it("stamps the state file with its schema", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), "web", false);
		const parsed = JSON.parse(
			readFileSync(managedResourceStatePath(...scope(hoboHome)), "utf8"),
		);
		// The schema tag is how a future reader knows whether it can trust the
		// shape it found rather than guessing from the keys.
		expect(parsed.schema).toBe(MANAGED_RESOURCE_STATE_SCHEMA);
	});

	it("sorts the disabled list so the file does not churn", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), "web", false);
		setManagedResourceEnabled(...scope(hoboHome), "api", false);
		const parsed = JSON.parse(
			readFileSync(managedResourceStatePath(...scope(hoboHome)), "utf8"),
		);
		// Unsorted output would rewrite the file on every toggle and make any
		// diff of durable state unreadable.
		expect(parsed.disabled).toEqual(["api", "web"]);
	});

	it("keeps two environments in one home apart", () => {
		const hoboHome = home();
		setManagedResourceEnabled(hoboHome, STATION, "local-dev", "web", false);
		// A shared file would let a `dev` toggle silently halt `prod`.
		expect(isManagedResourceEnabled(hoboHome, STATION, "prod", "web")).toBe(
			true,
		);
	});

	it("keeps two stations in one home apart", () => {
		const hoboHome = home();
		setManagedResourceEnabled(hoboHome, "station:a", ENVIRONMENT, "web", false);
		expect(
			isManagedResourceEnabled(hoboHome, "station:b", ENVIRONMENT, "web"),
		).toBe(true);
	});

	it("collapses a station id's path separators into one segment", () => {
		const hoboHome = home();
		const path = managedResourceStatePath(
			hoboHome,
			"station:../evil",
			ENVIRONMENT,
		);
		// The sanitiser rewrites everything outside `[A-Za-z0-9._-]`, so the
		// slashes go and what is left is a single directory name. State can only
		// ever be written inside the session directory.
		expect(path).toContain(join("sessions", "station_.._evil", "local-dev"));
	});

	it("GAP: a station id of exactly `..` is left intact as a path segment", () => {
		const hoboHome = home();
		// `.` and `-` survive the character class, so the one id that is entirely
		// dots passes through unchanged and resolves one directory above the
		// session root. Multi-level traversal is not reachable — separators are
		// always collapsed — so this is bounded, but the segment should be
		// rejected rather than emitted. Pinned rather than changed here: the fix
		// belongs with the shared `safeLabel` helper, not this test's package.
		expect(managedResourceStatePath(hoboHome, "..", ENVIRONMENT)).toContain(
			join("sessions", "..", "local-dev"),
		);
	});

	it("treats an unreadable state file as nothing disabled", () => {
		const hoboHome = home();
		const path = managedResourceStatePath(...scope(hoboHome));
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{ not json", "utf8");
		// A corrupt file must not brick the dashboard into showing everything
		// stopped; failing open is recoverable, failing closed is not.
		expect(isManagedResourceEnabled(...scope(hoboHome), "web")).toBe(true);
	});

	it("reports the occupancy camp active by default", () => {
		const hoboHome = home();
		expect(occupancyCampIsActive(...scope(hoboHome))).toBe(true);
	});

	it("reports the occupancy camp inactive once disabled", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), CODE_CAMP_ID, false);
		expect(occupancyCampIsActive(...scope(hoboHome))).toBe(false);
	});

	it("checks a named camp when one is given", () => {
		const hoboHome = home();
		setManagedResourceEnabled(...scope(hoboHome), "camp:hello", false);
		expect(occupancyCampIsActive(...scope(hoboHome), "camp:hello")).toBe(false);
	});
});

describe("yard flow", () => {
	it("reports flow active when nothing was written", () => {
		const hoboHome = home();
		// A station with no flow file has never been halted; traffic flows.
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});

	it("halts flow and reads it back", () => {
		const hoboHome = home();
		setOccupancyFlowActive(...scope(hoboHome), false);
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(false);
	});

	it("resumes flow", () => {
		const hoboHome = home();
		setOccupancyFlowActive(...scope(hoboHome), false);
		setOccupancyFlowActive(...scope(hoboHome), true);
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});

	it("stamps the flow file with its schema", () => {
		const hoboHome = home();
		setOccupancyFlowActive(...scope(hoboHome), false);
		const parsed = JSON.parse(
			readFileSync(occupancyFlowPath(...scope(hoboHome)), "utf8"),
		);
		expect(parsed).toEqual({ schema: OCCUPANCY_FLOW_SCHEMA, active: false });
	});

	it("treats an unreadable flow file as flowing", () => {
		const hoboHome = home();
		const path = occupancyFlowPath(...scope(hoboHome));
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{", "utf8");
		// A corrupt gate that reads as "halted" would strand every Bindle with
		// no way to start them from the UI.
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});

	it("treats a flow file missing the flag as flowing", () => {
		const hoboHome = home();
		const path = occupancyFlowPath(...scope(hoboHome));
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{}", "utf8");
		// Only an explicit `false` halts; an older file without the key predates
		// the gate and must not be read as a halt.
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});
});

describe("the host stack refuses to control itself", () => {
	it("refuses to start a station", async () => {
		const { control } = controller(home());
		await expect(control.start("station:local")).rejects.toThrow(
			/can't shut themselves down/,
		);
	});

	it("refuses to stop a station", async () => {
		const { control } = controller(home());
		await expect(control.stop("station:local")).rejects.toThrow(
			/can't shut themselves down/,
		);
	});

	it("refuses to stop the code camp", async () => {
		const { control } = controller(home());
		await expect(control.stop(CODE_CAMP_ID)).rejects.toThrow(
			/can't shut themselves down/,
		);
	});

	it("refuses to stop the code bindle", async () => {
		const { control } = controller(home());
		// Stopping `bindle:code` would kill the process answering the request.
		await expect(control.stop(CODE_BINDLE_ID)).rejects.toThrow(
			/can't shut themselves down/,
		);
	});

	it("refuses to stop an occupancy sidecar", async () => {
		const { control } = controller(home());
		await expect(control.stop("evidence")).rejects.toThrow(
			/own occupancy sidecars/,
		);
	});

	it("refuses to start an occupancy sidecar", async () => {
		const { control } = controller(home());
		await expect(control.start("otlp")).rejects.toThrow(
			/own occupancy sidecars/,
		);
	});

	it("names what stays up in the refusal", async () => {
		const { control } = controller(home());
		// The message is the only explanation the user gets for a disabled
		// button; it has to name the three things that stay up.
		await expect(control.stop(CODE_CAMP_ID)).rejects.toThrow(/camp:code/);
	});

	it("touches no sidecar when it refuses", async () => {
		const { control, stopped } = controller(home());
		await control.stop(CODE_CAMP_ID).catch(() => undefined);
		expect(stopped).toEqual([]);
	});
});

describe("starting and stopping planes", () => {
	it("halting a yard writes the flow gate", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local");
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(false);
	});

	it("starting a yard resumes the flow gate", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local");
		await control.start("yard:local");
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});

	it("halting a yard leaves the code camp alone", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local");
		// The code camp hosts the dashboard; a yard halt that disabled it would
		// take the UI down as a side effect of a traffic gate.
		expect(isManagedResourceEnabled(...scope(hoboHome), CODE_CAMP_ID)).toBe(
			true,
		);
	});

	it("halting a yard flow suffix disables the suffix id too", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local:flow");
		// The dashboard renders `yard:local:flow` as its own row; without this
		// the row would still read as running after the gate closed.
		expect(
			isManagedResourceEnabled(...scope(hoboHome), "yard:local:flow"),
		).toBe(false);
	});

	it("starting a yard flow suffix re-enables the suffix id", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local:flow");
		await control.start("yard:local:flow");
		expect(
			isManagedResourceEnabled(...scope(hoboHome), "yard:local:flow"),
		).toBe(true);
	});

	it("toggling the named-endpoint plane writes only its own flag", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("yard:local:named-endpoints");
		expect(
			isManagedResourceEnabled(
				...scope(hoboHome),
				"yard:local:named-endpoints",
			),
		).toBe(false);
		// The endpoint plane is not a traffic gate; halting it must leave flow up.
		expect(occupancyFlowIsActive(...scope(hoboHome))).toBe(true);
	});

	it("stopping a user camp disables it", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("camp:hello-world");
		expect(
			isManagedResourceEnabled(...scope(hoboHome), "camp:hello-world"),
		).toBe(false);
	});

	it("starting a user camp re-enables it", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("camp:hello-world");
		await control.start("camp:hello-world");
		expect(
			isManagedResourceEnabled(...scope(hoboHome), "camp:hello-world"),
		).toBe(true);
	});

	it("starting an unclassified resource just records the flag", async () => {
		const hoboHome = home();
		const { control, devStarts } = controller(hoboHome);
		await control.start("rail:queue");
		expect(isManagedResourceEnabled(...scope(hoboHome), "rail:queue")).toBe(
			true,
		);
		// An unrecognised id must not fall through into launching a dev process.
		expect(devStarts).toEqual([]);
	});

	it("stopping an unclassified resource just records the flag", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		await control.stop("rail:queue");
		expect(isManagedResourceEnabled(...scope(hoboHome), "rail:queue")).toBe(
			false,
		);
	});
});

describe("gating a Bindle process", () => {
	it("refuses to start a Bindle while yard flow is halted", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		setOccupancyFlowActive(...scope(hoboHome), false);
		await expect(control.start("web")).rejects.toThrow(/Yard flow is halted/);
	});

	it("names what to start when flow is halted", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		setOccupancyFlowActive(...scope(hoboHome), false);
		// A refusal the user cannot act on is just a broken button.
		await expect(control.start("web")).rejects.toThrow(/yard:local:flow/);
	});

	it("launches nothing when flow is halted", async () => {
		const hoboHome = home();
		const { control, devStarts } = controller(hoboHome);
		setOccupancyFlowActive(...scope(hoboHome), false);
		await control.start("web").catch(() => undefined);
		expect(devStarts).toEqual([]);
	});

	it("refuses to start a Bindle while its camp is halted", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		setManagedResourceEnabled(...scope(hoboHome), "camp:hello", false);
		await expect(control.start("bindle:hello")).rejects.toThrow(
			/Camp is halted/,
		);
	});

	it("names the camp to start in the refusal", async () => {
		const hoboHome = home();
		const { control } = controller(hoboHome);
		setManagedResourceEnabled(...scope(hoboHome), "camp:hello", false);
		await expect(control.start("bindle:hello")).rejects.toThrow(/camp:hello/);
	});
});

describe("the persisted run record", () => {
	it("writes the project and bindle it started", () => {
		const hoboHome = home();
		persistOccupancyRun({
			hoboHome,
			stationId: STATION,
			environment: ENVIRONMENT,
			projectDir: "/work/app",
			bindleName: "app",
		});
		const path = join(
			hoboHome,
			"durable",
			"code",
			"sessions",
			"station_local",
			"local-dev",
			"run.json",
		);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
			projectDir: "/work/app",
			bindleName: "app",
		});
	});

	it("omits a pid that was not supplied", () => {
		const hoboHome = home();
		persistOccupancyRun({
			hoboHome,
			stationId: STATION,
			environment: ENVIRONMENT,
			projectDir: "/work/app",
			bindleName: "app",
		});
		const path = join(
			hoboHome,
			"durable",
			"code",
			"sessions",
			"station_local",
			"local-dev",
			"run.json",
		);
		// A `null` pid would be read back as a process to signal on stop, and
		// `process.kill(null)` targets the current process group.
		expect(Object.hasOwn(JSON.parse(readFileSync(path, "utf8")), "pid")).toBe(
			false,
		);
	});

	it("keeps a pid and session id when supplied", () => {
		const hoboHome = home();
		persistOccupancyRun({
			hoboHome,
			stationId: STATION,
			environment: ENVIRONMENT,
			projectDir: "/work/app",
			bindleName: "app",
			pid: 4321,
			sessionId: "s-1",
		});
		const path = join(
			hoboHome,
			"durable",
			"code",
			"sessions",
			"station_local",
			"local-dev",
			"run.json",
		);
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		expect(parsed).toMatchObject({ pid: 4321, sessionId: "s-1" });
	});

	it("creates the session directory it writes into", () => {
		const hoboHome = home();
		// The home is fresh; nothing has created `durable/code/sessions/...` yet.
		expect(() =>
			persistOccupancyRun({
				hoboHome,
				stationId: STATION,
				environment: ENVIRONMENT,
				projectDir: "/work/app",
				bindleName: "app",
			}),
		).not.toThrow();
	});

	it("sanitises the station id in the run path", () => {
		const hoboHome = home();
		persistOccupancyRun({
			hoboHome,
			stationId: "station:../escape",
			environment: ENVIRONMENT,
			projectDir: "/work/app",
			bindleName: "app",
		});
		// Nothing may be written above the home directory.
		expect(
			readFileSync(
				join(
					hoboHome,
					"durable",
					"code",
					"sessions",
					"station_.._escape",
					"local-dev",
					"run.json",
				),
				"utf8",
			),
		).toContain("/work/app");
	});
});
