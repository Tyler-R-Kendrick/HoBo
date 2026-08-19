import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	hashDeploymentPlan,
	parseDeploymentPlan,
	ResourcePlanError,
} from "../src/index.js";

/**
 * Executable PACT verification for the one service boundary this shape crosses.
 *
 * A `DeploymentPlan` travels inside `deployment.Planned` alongside a
 * `planHash`, and every consumer that receives it — the deployment saga, the
 * deployment-view projection, a deployment driver — must be able to recompute
 * that hash from the plan body. That agreement is the boundary contract, and
 * the pact is verified by executing it rather than by reading it: each
 * interaction's plan is parsed and hashed here, and the result is compared to
 * the digest the pact declares.
 */

type Interaction = {
	description: string;
	request: { body: { plan: unknown } };
	response: { body: { planHash?: string; error?: string; path?: string } };
};

const pact = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL(
				"../contracts/pacts/deployment-plan-digest.pact.json",
				import.meta.url,
			),
		),
		"utf8",
	),
) as {
	consumer: { name: string };
	provider: { name: string };
	interactions: Interaction[];
};

describe(`PACT ${pact.consumer.name} -> ${pact.provider.name}`, () => {
	it("declares the interactions this suite verifies", () => {
		expect(pact.interactions).toHaveLength(4);
	});

	const digestCases = pact.interactions.filter(
		(i) => i.response.body.planHash !== undefined,
	);
	const refusalCases = pact.interactions.filter(
		(i) => i.response.body.error !== undefined,
	);

	it("covers both outcomes the boundary has", () => {
		expect(digestCases).toHaveLength(3);
		expect(refusalCases).toHaveLength(1);
	});

	it.each(
		digestCases.map((i) => [i.description, i] as const),
	)("%s", (_description, interaction) => {
		const parsed = parseDeploymentPlan(interaction.request.body.plan);
		expect(hashDeploymentPlan(parsed)).toBe(interaction.response.body.planHash);
	});

	it.each(
		refusalCases.map((i) => [i.description, i] as const),
	)("%s", (_description, interaction) => {
		let thrown: unknown;
		try {
			parseDeploymentPlan(interaction.request.body.plan);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ResourcePlanError);
		const error = thrown as ResourcePlanError;
		expect(error.code).toBe(interaction.response.body.error);
		expect(error.path).toBe(interaction.response.body.path);
	});
});
