/**
 * The sidecar discovery file, the opt-out flag, and the status strap.
 *
 * `station-sidecars.test.ts` starts real sidecars and checks they serve. That
 * covers the happy path and none of what happens when the discovery file on
 * disk is *wrong* — which is the state it spends most of its life in, because
 * it outlives the process that wrote it.
 *
 * The file is how a second `hobo-code` invocation finds sidecars a first one
 * started. It is written by one process, read by another, and never cleaned up
 * on a crash. So every reader has to treat it as untrusted input:
 *
 * - A file from an older build carries a schema this one cannot read. Loading
 *   it anyway would hand callers a snapshot missing the fields they read,
 *   and the failure surfaces later as an undefined URL being fetched.
 * - A half-written file is ordinary — the writer can be killed mid-write.
 *   Throwing on that would take down a shell that was only trying to find out
 *   whether a dashboard was already up.
 *
 * `readStationSidecars` returning `null` for all of these is what makes the
 * caller start fresh instead. Each rejection below is a separate reason the
 * file can be untrustworthy, pinned separately so that removing one check is a
 * test failure rather than a silent widening.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	formatSidecarStrap,
	readStationSidecars,
	STATION_SIDECARS_SCHEMA,
	type StationSidecarSnapshot,
	sidecarsEnabled,
	stationSidecarsPath,
} from "../src/station-sidecars.js";

function home(): string {
	return mkdtempSync(join(tmpdir(), "hobo-sidecar-discovery-"));
}

/** Write raw text to where a station's discovery file belongs. */
function writeRaw(hoboHome: string, stationId: string, body: string): void {
	const path = stationSidecarsPath(hoboHome, stationId);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, body);
}

function snapshot(
	overrides: Partial<StationSidecarSnapshot> = {},
): StationSidecarSnapshot {
	return {
		schema: STATION_SIDECARS_SCHEMA,
		dashboardUrl: "http://127.0.0.1:8787/",
		evidenceUrl: "http://127.0.0.1:8788/",
		...overrides,
	} as StationSidecarSnapshot;
}

describe("where the discovery file lives", () => {
	it("puts it under the station it belongs to", () => {
		const path = stationSidecarsPath("/home/u/.hobo", "station:local");
		expect(path).toContain(join("stations", "station_local"));
		expect(path.endsWith("sidecars.json")).toBe(true);
	});

	it("sanitises a station id that would escape the directory", () => {
		// Station ids arrive from configuration and from remote peers. An id
		// containing `../` would otherwise write the discovery file — and later
		// unlink it — somewhere outside hoboHome entirely.
		//
		// The separators are what carry a traversal, and those are what get
		// replaced: `../../etc/evil` becomes the single directory name
		// `.._.._etc_evil`. The dots survive, which looks alarming and is not —
		// with no separator left, there is no parent to traverse to. So the
		// property asserted here is containment, not the absence of dots.
		const path = stationSidecarsPath("/home/u/.hobo", "../../etc/evil");
		expect(path).toBe("/home/u/.hobo/stations/.._.._etc_evil/sidecars.json");
		expect(path.startsWith("/home/u/.hobo/stations/")).toBe(true);
		expect(path.split("/").filter((part) => part === "..")).toEqual([]);
	});

	it("sanitises the colon that every station id carries", () => {
		// Colons are legal in POSIX filenames but not on Windows, and they read as
		// drive separators. Replacing them keeps one path shape everywhere.
		expect(stationSidecarsPath("/h", "station:local")).toContain(
			"station_local",
		);
	});

	it("keeps distinct stations in distinct files", () => {
		// Collapsing two stations onto one path would have a second station
		// overwrite the first's sidecar URLs, and callers would then connect to
		// the wrong machine's dashboard.
		expect(stationSidecarsPath("/h", "station:a")).not.toBe(
			stationSidecarsPath("/h", "station:b"),
		);
	});
});

describe("reading the discovery file", () => {
	it("reads back what was written", () => {
		const hoboHome = home();
		writeRaw(hoboHome, "station:local", JSON.stringify(snapshot()));
		expect(readStationSidecars(hoboHome, "station:local")?.dashboardUrl).toBe(
			"http://127.0.0.1:8787/",
		);
	});

	it("reports nothing when no sidecars have run", () => {
		// The common case on a cold start. Throwing here would make every first
		// invocation an error.
		expect(readStationSidecars(home(), "station:local")).toBeNull();
	});

	it("rejects a file written by a different schema version", () => {
		// An older build's file can be missing fields this one reads. Accepting it
		// defers the failure to whoever fetches the undefined URL.
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify({
				...snapshot(),
				schema: "hobo.code.station-sidecars/v0",
			}),
		);
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects a file with no schema at all", () => {
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify({
				dashboardUrl: "http://127.0.0.1:8787/",
				evidenceUrl: "http://127.0.0.1:8788/",
			}),
		);
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects a file missing the dashboard url", () => {
		// Both URLs are read unconditionally by callers. A snapshot with one
		// missing is not a partial success, it is a snapshot that will crash
		// something later.
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify({
				schema: STATION_SIDECARS_SCHEMA,
				evidenceUrl: "http://127.0.0.1:8788/",
			}),
		);
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects a file missing the evidence url", () => {
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify({
				schema: STATION_SIDECARS_SCHEMA,
				dashboardUrl: "http://127.0.0.1:8787/",
			}),
		);
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects a url field that is not a string", () => {
		// JSON will happily carry a number or an object here. `typeof` is the
		// check that stops one reaching `new URL`.
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify({ ...snapshot(), dashboardUrl: 8787 }),
		);
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects a half-written file rather than throwing", () => {
		// The writer can be killed mid-write, so this is ordinary rather than
		// exotic. A throw here takes down a shell that was only asking whether a
		// dashboard was already up.
		const hoboHome = home();
		writeRaw(hoboHome, "station:local", '{"schema":"hobo.code.stat');
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects an empty file", () => {
		// What a crash between create and write leaves behind.
		const hoboHome = home();
		writeRaw(hoboHome, "station:local", "");
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("rejects valid JSON that is not an object", () => {
		const hoboHome = home();
		writeRaw(hoboHome, "station:local", '"just a string"');
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("keeps the optional fields it does not require", () => {
		// Only the two URLs are mandatory. Dropping the rest would lose the pid
		// that tells a later process whether the sidecar is still alive.
		const hoboHome = home();
		writeRaw(
			hoboHome,
			"station:local",
			JSON.stringify(snapshot({ evidencePid: 4242 })),
		);
		expect(readStationSidecars(hoboHome, "station:local")?.evidencePid).toBe(
			4242,
		);
	});
});

describe("the opt-out flag", () => {
	it("runs sidecars by default", () => {
		expect(sidecarsEnabled({})).toBe(true);
	});

	for (const value of ["0", "false", "off"]) {
		it(`treats ${value} as off`, () => {
			expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: value })).toBe(false);
		});
	}

	it("ignores surrounding whitespace", () => {
		// A value set from a shell script or a .env file routinely arrives padded.
		// Without the trim, `HOBO_CODE_SIDECARS=0 ` silently keeps them on.
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: " 0 " })).toBe(false);
	});

	it("stays on for any other value", () => {
		// The flag is an opt-out, not a boolean parse. Reading "no" or "nope" as
		// off would be guessing; only the three documented spellings turn it off,
		// and anything else keeps the default behaviour.
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: "1" })).toBe(true);
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: "yes" })).toBe(true);
	});

	it("stays on for an empty value", () => {
		// `HOBO_CODE_SIDECARS=` with nothing after it is how a variable gets
		// unset-ish in a shell. Treating it as off would surprise anyone who
		// cleared the variable expecting the default back.
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: "" })).toBe(true);
	});

	it("is case-sensitive about the off spellings", () => {
		// Pinning what is, not what might be preferable: "FALSE" keeps sidecars
		// running. Anyone lowercasing the value here should expect this to flip.
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: "FALSE" })).toBe(true);
	});
});

describe("the status strap", () => {
	it("shows nothing when no sidecar is up", () => {
		// An empty strap renders as no chips. A strap of empty chips would render
		// as stray separators with nothing between them.
		expect(
			formatSidecarStrap({ schema: STATION_SIDECARS_SCHEMA } as never),
		).toEqual([]);
	});

	it("shows host and port rather than the whole url", () => {
		// The strap sits in one terminal line beside everything else. Full URLs
		// would push the rest of the line off screen.
		expect(formatSidecarStrap(snapshot())).toEqual([
			"dash:127.0.0.1:8787",
			"evidence:127.0.0.1:8788",
		]);
	});

	it("omits a sidecar that is not running rather than showing it blank", () => {
		const strap = formatSidecarStrap(
			snapshot({ evidenceUrl: "" }) as StationSidecarSnapshot,
		);
		expect(strap).toEqual(["dash:127.0.0.1:8787"]);
	});

	it("lists every optional sidecar in a fixed order", () => {
		// Fixed order is what makes the strap readable at a glance: the chip for
		// evidence is always in the same place, so a user's eye learns where to
		// look rather than re-reading the line each time.
		const strap = formatSidecarStrap(
			snapshot({
				evalsUrl: "http://127.0.0.1:1/",
				rolloutUrl: "http://127.0.0.1:2/",
				experimentUrl: "http://127.0.0.1:3/",
				kmsUrl: "http://127.0.0.1:4/",
				historyUrl: "http://127.0.0.1:5/",
				statusUrl: "http://127.0.0.1:6/",
			}),
		);
		expect(strap.map((chip) => chip.split(":")[0])).toEqual([
			"dash",
			"evidence",
			"evals",
			"rollout",
			"experiment",
			"kms",
			"history",
			"status",
		]);
	});

	it("keeps a non-loopback host intact", () => {
		// A forwarded sidecar can legitimately be on another host, and the strap
		// is where a user notices that.
		expect(
			formatSidecarStrap(snapshot({ dashboardUrl: "http://dev-box:8787/" })),
		).toContain("dash:dev-box:8787");
	});

	it("drops the default port the way a URL does", () => {
		// `new URL(...).host` omits :80 for http. Pinning it so the chip's shape
		// is a known consequence rather than a surprise in a screenshot.
		expect(
			formatSidecarStrap(snapshot({ dashboardUrl: "http://example.com/" })),
		).toContain("dash:example.com");
	});
});
