import { readFileSync } from "node:fs";
import { toJsonString } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { DesiredCiPolicySchema } from "../src/_generated/policy_pb.js";
import { defineCiPolicy, parseCiPolicy } from "../src/policy.js";

const valid = JSON.parse(
	readFileSync(
		new URL(
			"../data-models/fixtures/valid/desired-policy.json",
			import.meta.url,
		),
		"utf8",
	),
);
function input() {
	return structuredClone(valid);
}

describe("authored CI policy", () => {
	it("round-trips generated policy JSON while freezing all nested intent", () => {
		const authored = input();
		const policy = defineCiPolicy(authored);
		authored.providers[0].runsOn = "untrusted";
		expect(policy.providers[0]?.runsOn).toBe("ubuntu-24.04");
		expect(Object.isFrozen(policy.providers[0])).toBe(true);
		expect(Object.isFrozen(policy.thresholds[0]?.allow)).toBe(true);
		expect(parseCiPolicy(toJsonString(DesiredCiPolicySchema, policy))).toEqual(
			policy,
		);
	});
	it("rejects runtime-owned financial fields at the generated boundary", () => {
		const policy = input();
		policy.providers[0].freeMinutes = 100;
		expect(() => defineCiPolicy(policy)).toThrow();
		const account = input();
		account.spentMicros = 0;
		expect(() => defineCiPolicy(account)).toThrow();
	});
	it.each([
		"foreign",
		"duplicate",
		"threshold",
		"pool",
		"rollover",
		"credentials",
		"self-label",
		"unsafe-budget",
	])("rejects invalid %s policy", (kind) => {
		const policy = input();
		if (kind === "foreign") policy.thresholds[0].allow = ["unknown"];
		if (kind === "duplicate")
			policy.providers.push(structuredClone(policy.providers[0]));
		if (kind === "threshold")
			policy.thresholds.push(structuredClone(policy.thresholds[0]));
		if (kind === "pool") policy.pool.os = "windows";
		if (kind === "rollover") policy.budget.period = "calendar-month";
		if (kind === "credentials")
			policy.providers[0].connectionRef = "token value with spaces";
		if (kind === "self-label") policy.providers[0].runsOn = "HoBo";
		if (kind === "unsafe-budget") policy.budget.limitMicros = 9007199254740992;
		expect(() => defineCiPolicy(policy)).toThrow();
	});
	it("accepts explicit empty threshold profiles as a pause", () => {
		const policy = defineCiPolicy(input());
		expect(policy.thresholds[0]?.allow).toEqual([]);
	});
	it("accepts a Vercel Sandbox provider in the authored inventory", () => {
		const policy = input();
		policy.providers.push({
			id: "isolated",
			kind: "vercel",
			connectionRef: "vercel-team",
			runsOn: "sandbox",
			enabled: true,
		});
		expect(defineCiPolicy(policy).providers[1]?.kind).toBe("vercel");
	});
});
