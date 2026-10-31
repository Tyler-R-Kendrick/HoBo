import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initStation,
	loadStationEvents,
	PAM_RAIL_CAPABILITY,
	persistStationEvents,
	StationService,
	stationRoot,
} from "@hobo/stations";
import { afterEach, describe, expect, it } from "vitest";

import { runHoboCodeCli } from "../src/cli.js";
import { type JsonObject, parseJsonObject } from "../src/json.js";
import { openStationGateway } from "../src/machine-sessions.js";

// `hobo-code session serve --host <machine>` opens a Station authorization
// and hands it to the forward, which closes it. If the verb ends any other
// way once it is open, a throw included, the verb closes it: otherwise it
// waited out its lease with no pam.SessionEnded in the Station's audit.

const STATION = "station:local";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** A local Station whose active Rail enables privileged access. */
function stationWithPam(hoboHome: string): void {
	initStation({ hoboHome, id: STATION, tenant: "acme" });
	const service = StationService.fromEvents(
		loadStationEvents(hoboHome, STATION),
		{ stationId: STATION },
	);
	const rail = service.publishRail({
		id: "rail-pam",
		name: "PAM",
		version: "1.0.0",
		stationId: STATION,
		policyPacks: [PAM_RAIL_CAPABILITY],
	});
	service.approveRail(rail.contentHash);
	service.activateRail(rail.contentHash);
	persistStationEvents(hoboHome, STATION, service.events);
}

function audit(hoboHome: string): readonly JsonObject[] {
	const path = join(stationRoot(hoboHome, STATION), "pam-audit.jsonl");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => parseJsonObject(line));
}

describe("session serve --host, failing once the Station authorization is open", () => {
	it("closes the authorization, and the Station's audit says why", async () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-serve-auth-"));
		roots.push(root);
		const hoboHome = join(root, "h");
		const project = join(root, "p");
		mkdirSync(project);
		stationWithPam(hoboHome);
		writeFileSync(
			join(project, "devenv.machines.json"),
			`${JSON.stringify({
				machines: [
					{ id: "box", host: "box.ts.net", isolationClass: "development" },
				],
			})}\n`,
		);
		const closes: (string | undefined)[] = [];
		const result = await runHoboCodeCli(
			[
				"session",
				"serve",
				"--host",
				"box",
				"--port",
				"4242",
				"--station",
				STATION,
			],
			{
				hoboHome,
				cwd: project,
				env: { PATH: process.env.PATH ?? "", HOBO_HOME: hoboHome },
				// The Station's own gateway, which throws once it has authorized
				// the session: reading its audit types, the next step.
				openStationGateway: async (context) => {
					const gateway = await openStationGateway(context);
					return {
						...gateway,
						auditTypes: () => {
							throw new Error("the gateway's audit could not be read");
						},
						close: async (reason) => {
							closes.push(reason);
							await gateway.close(reason);
						},
					};
				},
			},
		);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_SESSION_FAILED");
		expect(result.message).toContain("the gateway's audit could not be read");
		expect(closes).toEqual(["session-serve-failed"]);
		const events = audit(hoboHome);
		expect(events.map((event) => event.type)).toEqual([
			"pam.GatewayStarted",
			"pam.SessionStarted",
			"pam.SessionEnded",
			"pam.GatewayStopped",
		]);
		expect(events.find((event) => event.type === "pam.SessionEnded")).toEqual(
			expect.objectContaining({ reason: "session-serve-failed" }),
		);
	});
});
