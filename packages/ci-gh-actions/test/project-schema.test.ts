import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	ciEnvironmentPolicySha256,
	ciEnvironmentSecretsSha256,
	parseCiProjectConfig,
	selectCiEnvironment,
} from "../src/project-config.js";
import {
	CiProjectDocumentSchema,
	ciProjectJsonSchema,
} from "../src/project-schema.js";

const examplePath = new URL("../examples/project/ci.json", import.meta.url);
function source() {
	return JSON.parse(readFileSync(examplePath, "utf8"));
}

function inlineSource() {
	const input = source();
	for (const name of ["local", "integration"]) {
		const environment = input.environments[name];
		environment.secrets = structuredClone(input.definitions.secrets.relay);
		environment.policy.pool = structuredClone(input.definitions.pools.linux);
		environment.policy.routing = structuredClone(
			input.definitions.routing.freeThenCheapest,
		);
		environment.policy.budget = structuredClone(
			input.definitions.budgets[name],
		);
		environment.policy.providers = [
			structuredClone(
				input.definitions.providers[
					name === "local" ? "localGithub" : "integrationSandbox"
				],
			),
		];
	}
	delete input.definitions;
	return input;
}

describe("typed project component references", () => {
	it.each([
		"inline",
		"mixed",
	])("accepts %s components across environments with identical policy and secret digests", async (mode) => {
		const referenced = source();
		const inline = inlineSource();
		const input = mode === "inline" ? inline : source();
		if (mode === "mixed") {
			input.environments.local.policy.pool =
				inline.environments.local.policy.pool;
			input.environments.integration.policy.routing =
				inline.environments.integration.policy.routing;
			input.environments.local.secrets = inline.environments.local.secrets;
			input.environments.integration.policy.providers =
				inline.environments.integration.policy.providers;
		} else {
			expect(input).not.toHaveProperty("definitions");
			expect(JSON.stringify(input)).not.toContain('"$ref"');
		}
		expect(CiProjectDocumentSchema.safeParse(input).success).toBe(true);
		const expected = parseCiProjectConfig(JSON.stringify(referenced));
		const actual = parseCiProjectConfig(JSON.stringify(input));
		for (const name of ["local", "integration"]) {
			expect(await ciEnvironmentPolicySha256(actual, name)).toBe(
				await ciEnvironmentPolicySha256(expected, name),
			);
			expect(await ciEnvironmentSecretsSha256(actual, name)).toBe(
				await ciEnvironmentSecretsSha256(expected, name),
			);
		}
	});
	it("validates inline components just as strictly as referenced components", () => {
		const input = inlineSource();
		input.environments.local.policy.pool.os = "windows";
		expect(CiProjectDocumentSchema.safeParse(input).success).toBe(false);
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow();
	});
	it("ships the exact schema generated from the runtime authoring contract", () => {
		expect(
			JSON.parse(
				readFileSync(
					new URL("../schema/ci-project.schema.json", import.meta.url),
					"utf8",
				),
			),
		).toEqual(ciProjectJsonSchema());
	});
	it("expands independent component references with the same digest as inline intent", async () => {
		const input = source();
		const config = parseCiProjectConfig(JSON.stringify(input));
		const selected = selectCiEnvironment(config, "local");
		expect(selected.policy.pool).toMatchObject({
			label: "hobo",
			os: "linux",
			architecture: "x64",
		});
		const inline = {
			defaultEnvironment: "local",
			environments: {
				local: {
					relayOrigin: selected.relayOrigin,
					allowInsecureLoopback: true,
					policy: JSON.parse(
						JSON.stringify(selected.policy, (key, value) =>
							key === "$typeName" ? undefined : value,
						),
					),
				},
			},
		};
		expect(await ciEnvironmentPolicySha256(config, "local")).toBe(
			await ciEnvironmentPolicySha256(
				parseCiProjectConfig(JSON.stringify(inline)),
				"local",
			),
		);
	});
	it.each([
		{ $ref: "#/definitions/routing/free-first" },
		{ $ref: "#/definitions/pools/missing" },
		{ $ref: "https://attacker.example/pool.json" },
		{ $ref: "file:///run/secrets/value" },
		{ $ref: "#/definitions/pools/linux", label: "hobo" },
	])("rejects wrong, missing, external and ambiguous pool references", (pool) => {
		const input = source();
		input.environments.local.policy.pool = pool;
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow(
			"invalid CI project configuration",
		);
	});
	it("validates unused definitions and forbids reference chains", () => {
		const input = source();
		input.definitions.pools.invalid = { $ref: "#/definitions/pools/linux" };
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow();
		input.definitions.pools.invalid = {
			label: "hobo",
			os: "windows",
			architecture: "x64",
		};
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow();
	});
	it("rejects duplicate phases in unused declarations and recursive hobo providers", () => {
		const input = source();
		input.definitions.secrets.invalid = {
			TOKEN: { requiredFor: ["execution", "execution"] },
		};
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow();
		delete input.definitions.secrets.invalid;
		input.definitions.providers.invalid = {
			id: "bad",
			kind: "github",
			connectionRef: "bad",
			runsOn: "HoBo",
		};
		expect(() => parseCiProjectConfig(JSON.stringify(input))).toThrow();
	});
});
