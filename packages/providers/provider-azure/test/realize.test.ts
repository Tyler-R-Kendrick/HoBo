import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
	assertLocalIacProgram,
	azure,
	mergeAzureOptions,
	realizeResourcePlan,
	realizeResourcePlans,
} from "../src/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../contracts/provider-azure-boundary.pact.json"),
		"utf8",
	),
);

describe("realize: ResourcePlan -> pulumi IacProgram", () => {
	it("realizes a compute plan into an azure:container-app resource (pact-recorded shape)", () => {
		const { iac } = realizeResourcePlan({
			name: "api",
			port: "compute",
			provider: "azure",
			deploymentId: "shop",
		});
		assertLocalIacProgram(iac);
		const interaction = pact.interactions[2];
		const expected = interaction.response.body.iac;
		assert.equal(iac.apiVersion, expected.apiVersion);
		assert.equal(iac.provider, expected.provider);
		assert.equal(iac.resources[0].name, "api");
		assert.equal(iac.resources[0].type, "azure:container-app");
		assert.equal(iac.stack, "azure/shop");
		assert.ok(iac.resources[0].outputs.includes("binding"));
	});

	it("realizes a whole plan with bind edges resolving across resources", () => {
		const { iac } = realizeResourcePlans(
			[
				{
					name: "api",
					port: "compute",
					provider: "azure",
					deps: ["sessions", "assets"],
				},
				{ name: "sessions", port: "kv", provider: "aws" },
				{ name: "assets", port: "objectStore", provider: "aws" },
				{ name: "ledger", port: "database", provider: "aws" },
				{ name: "jobs", port: "queue", provider: "aws" },
				{ name: "hot", port: "cache", provider: "aws" },
			],
			{ deploymentId: "shop" },
		);
		assertLocalIacProgram(iac);
		assert.equal(iac.resources.length, 6);
		const api = iac.resources.find((r) => r.name === "api");
		assert.deepEqual(
			(api?.inputs.bindings as Array<{ ref: string }>).map((b) => b.ref),
			[
				"${resources.sessions.outputs.binding}",
				"${resources.assets.outputs.binding}",
			],
		);
		assert.equal(
			iac.resources.find((r) => r.name === "ledger")?.type,
			"azure:postgres-flexible-server",
		);
	});

	it("rejects unrealizable ports (honest gap, never fabricated)", () => {
		assert.throws(() =>
			realizeResourcePlan({
				name: "gpu",
				port: "gpu-cluster",
				provider: "azure",
			}),
		);
	});

	it("merges only azure-owned .with() option blocks; foreign blocks drop", () => {
		const merged = mergeAzureOptions([
			azure.with.containerApps({ cpu: 0.5 }),
			{
				providerId: "cloudflare",
				port: "compute",
				optionName: "worker",
				negotiation: "prefer",
				options: { cpuMs: 50_000 },
			},
		]);
		assert.equal(merged.cpu, 0.5);
		assert.equal(merged.memoryGiB, 0.5);
		assert.equal("cpuMs" in merged, false);
	});
});
