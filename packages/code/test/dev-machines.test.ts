/**
 * A remote pane used to be `ssh -t <whatever the user typed>` — an arbitrary
 * host, an ambient key, and no record. These tests pin the replacement: the
 * reachable set is declared, every field that reaches a command line is
 * allowlisted, and a malformed entry is reported rather than dropped.
 */
import { describe, expect, it } from "vitest";
import {
	DEV_MACHINES_FILE,
	loadDevMachines,
	machinesForAgent,
	pamTarget,
	parseDevMachine,
	sshDestination,
} from "../src/dev-machines.js";

function loader(contents: string) {
	return loadDevMachines(
		"/pkg",
		() => contents,
		(p) => p.endsWith(DEV_MACHINES_FILE),
	);
}

describe("declared dev machines", () => {
	it("reads the registry beside the devenv files", () => {
		const loaded = loader(
			JSON.stringify({
				schemaVersion: "hobo.code.dev-machines/v1",
				machines: [
					{ id: "build-box", host: "build-box.tail1234.ts.net", isolationClass: "development" },
					{
						id: "gpu",
						host: "gpu.tail1234.ts.net",
						user: "agent",
						isolationClass: "ephemeral",
						agents: ["ollama"],
						note: "inference only",
					},
				],
			}),
		);
		expect(loaded.declared).toBe(true);
		expect(loaded.machines.map((m) => m.id)).toEqual(["build-box", "gpu"]);
		expect(loaded.rejected).toEqual([]);
		expect(sshDestination(loaded.machines[1] as never)).toBe("agent@gpu.tail1234.ts.net");
	});

	it("reports an absent registry without inventing machines", () => {
		const loaded = loadDevMachines("/pkg", () => "", () => false);
		expect(loaded.declared).toBe(false);
		expect(loaded.machines).toEqual([]);
	});

	it("says why a malformed file yielded nothing", () => {
		expect(loader("{not json").rejected[0]?.problem).toMatch(/unreadable/);
		expect(loader(JSON.stringify({ machines: "nope" })).rejected[0]?.problem).toMatch(
			/no machines array/,
		);
	});
});

describe("fields that reach a command line are allowlisted", () => {
	it("refuses a host that could smuggle an argument", () => {
		for (const host of [
			"box; rm -rf /",
			"box $(id)",
			"box`id`",
			"box with space",
			"-oProxyCommand=evil",
			"",
		]) {
			const parsed = parseDevMachine(
				{ id: "m", host, isolationClass: "development" },
				0,
			);
			expect("problem" in parsed, host).toBe(true);
		}
	});

	it("refuses an id that is not a safe pane name", () => {
		for (const id of ["../x", "a b", "a;b", "-flag", ""]) {
			const parsed = parseDevMachine(
				{ id, host: "box.ts.net", isolationClass: "development" },
				0,
			);
			expect("problem" in parsed, id).toBe(true);
		}
	});

	it("refuses an unknown isolation class rather than defaulting", () => {
		// Defaulting would silently place an agent on a production host under
		// whatever policy the gateway applies to the weakest class.
		const parsed = parseDevMachine(
			{ id: "m", host: "box.ts.net", isolationClass: "whatever" },
			0,
		);
		expect("problem" in parsed && parsed.problem.problem).toMatch(/isolationClass/);
	});

	it("rejects a duplicate id instead of letting one pane mean two hosts", () => {
		const loaded = loader(
			JSON.stringify({
				machines: [
					{ id: "box", host: "a.ts.net", isolationClass: "development" },
					{ id: "box", host: "b.ts.net", isolationClass: "production" },
				],
			}),
		);
		expect(loaded.machines).toHaveLength(1);
		expect(loaded.rejected[0]?.problem).toMatch(/duplicate id/);
	});

	it("keeps the good entries when one is bad", () => {
		const loaded = loader(
			JSON.stringify({
				machines: [
					{ id: "good", host: "a.ts.net", isolationClass: "development" },
					{ id: "bad", host: "b ts net", isolationClass: "development" },
				],
			}),
		);
		expect(loaded.machines.map((m) => m.id)).toEqual(["good"]);
		expect(loaded.rejected.map((r) => r.machine)).toEqual(["bad"]);
	});
});

describe("placement and brokering", () => {
	const machines = [
		{ id: "any", host: "a.ts.net", isolationClass: "development" as const },
		{
			id: "gpu",
			host: "g.ts.net",
			isolationClass: "ephemeral" as const,
			agents: ["ollama"],
		},
	];

	it("restricts a machine to its declared agents", () => {
		expect(machinesForAgent(machines, "claude").map((m) => m.id)).toEqual(["any"]);
		expect(machinesForAgent(machines, "ollama").map((m) => m.id)).toEqual(["any", "gpu"]);
	});

	it("registers as a PAM target carrying the declared isolation class", () => {
		// The gateway's policy keys off this, so a machine and its brokered
		// session must not be two different notions of "which host".
		expect(pamTarget(machines[1] as never)).toEqual({
			id: "ssh:gpu",
			kind: "ssh",
			isolationClass: "ephemeral",
			address: "g.ts.net",
		});
	});
});
