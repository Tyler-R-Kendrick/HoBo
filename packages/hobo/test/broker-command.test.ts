import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrokerCatalog } from "@hobo/broker";
import { beforeAll, describe, expect, it } from "vitest";
import { createBrokerCommand } from "../src/broker-command.js";

const catalog: BrokerCatalog = {
	catalogHash: "sha256:catalog-cli",
	definitions: () => [
		{
			id: "@hobo/provider-cheap:hobo:http-service",
			providerId: "@hobo/provider-cheap",
			port: "hobo:http-service",
			features: [],
			regions: ["us-east-1"],
			cost: { sku: "cheap-svc", unit: "hour", marginalPrice: "0.01" },
			satisfies: (req) =>
				req.port === "hobo:http-service" ? { kind: "full" } : { kind: "none" },
		},
	],
};

const policies = {
	schemaVersion: "hobo.broker/v1",
	brokerId: "broker:cli-yard",
	placementPolicies: [
		{ id: "pp-bindle", scopeKind: "bindle", objective: "min-cost" },
	],
	billing: {
		quota: "deployments/day",
		quotaUsed: 0,
		quotaLimit: 10,
		budgetUsd: 100,
		spendCapUsd: 50,
	},
	delivery: { engine: "in-proc", syncMode: "manual" },
};

let dir: string;
let policiesPath: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "hobo-broker-cli-"));
	policiesPath = join(dir, "policies.json");
	await writeFile(policiesPath, JSON.stringify(policies));
});

function runContext(
	flags: Record<string, string>,
	args: string[] = ["resolve"],
) {
	return {
		args,
		flags,
		context: { cwd: dir },
		emitProgress: () => {},
	} as never;
}

describe("hobo broker — the Conductor on the CLI", () => {
	it("resolves a request to a receipt through the real pipeline", async () => {
		const requestPath = join(dir, "request.json");
		await writeFile(
			requestPath,
			JSON.stringify({
				schemaVersion: "hobo.broker/v1",
				requestId: "req-cli-1",
				scope: { bindleId: "bindle:site" },
				requirements: [{ resourceId: "api", port: "hobo:http-service" }],
				spendEstimateUsd: 5,
			}),
		);
		const command = createBrokerCommand({ catalog });
		const result = await command.run(
			runContext({ policies: policiesPath, request: requestPath }),
		);
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_BROKER_RESOLVED");
		const receipt = (result.data as { receipt: { placements: unknown[] } })
			.receipt;
		expect(receipt.placements).toHaveLength(1);
	});

	it("surfaces cataloged rejections with remediations and ok=false", async () => {
		const requestPath = join(dir, "request-over.json");
		await writeFile(
			requestPath,
			JSON.stringify({
				schemaVersion: "hobo.broker/v1",
				requestId: "req-cli-2",
				scope: { bindleId: "bindle:site" },
				requirements: [{ resourceId: "api", port: "hobo:http-service" }],
				spendEstimateUsd: 500,
			}),
		);
		const command = createBrokerCommand({ catalog });
		const result = await command.run(
			runContext({ policies: policiesPath, request: requestPath }),
		);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_BROKER_REJECTED");
		expect(result.message).toContain("billing:spend-cap-exceeded");
		expect(result.remediation?.[0]).toContain("spend cap");
	});

	it("prints the rejection matrix and rejects unknown subcommands", async () => {
		const command = createBrokerCommand({ catalog });
		const matrix = await command.run(runContext({}, ["matrix"]));
		expect(matrix.ok).toBe(true);
		expect(
			(matrix.data as { matrix: unknown[] }).matrix.length,
		).toBeGreaterThan(10);

		const unknown = await command.run(runContext({}, ["conduct"]));
		expect(unknown.ok).toBe(false);
		expect(unknown.code).toBe("HOBO_BROKER_USAGE");

		const missing = await command.run(runContext({}));
		expect(missing.ok).toBe(false);
		expect(missing.status).toBe("missing_inputs");
	});
});
