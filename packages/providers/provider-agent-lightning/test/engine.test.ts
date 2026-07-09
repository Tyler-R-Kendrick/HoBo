import assert from "node:assert/strict";
import {
	parseTrainingArtifactProgram,
	TrainingEngineParseError,
} from "@hobo/core";
import { test } from "vitest";

import {
	type AgentLightningTransport,
	createAgentLightningTrainingEngine,
} from "../src/index.js";
import { optimizeRequest, trajectory } from "./helpers.js";

const TRAJECTORIES = [
	trajectory("t1", "cannot reset password", "access", 0.95),
	trajectory("t2", "site is down", "outage", 0.97),
];

function stubTransport(
	overrides: Partial<
		Awaited<ReturnType<AgentLightningTransport["submit"]>>
	> = {},
): AgentLightningTransport {
	return {
		submit: async () => ({
			rolloutId: "rollout-1",
			instructions: "Classify the support ticket by category.",
			serializedPolicyJson: JSON.stringify({ policy: "optimized" }),
			demos: [
				{
					input: { subject: "cannot reset password" },
					output: { category: "access" },
				},
			],
			...overrides,
		}),
	};
}

test("optimize lifts an Agent Lightning rollout into a provenance-pinned artifact", async () => {
	const engine = createAgentLightningTrainingEngine({
		transport: stubTransport(),
	});

	const candidate = await engine.optimize(optimizeRequest(TRAJECTORIES));

	assert.equal(candidate.body.case, "artifact");
	if (candidate.body.case !== "artifact") throw new Error("expected artifact");
	assert.equal(
		candidate.engineId,
		"hobo.training-engine/agent-lightning@0.1.0",
	);
	assert.equal(candidate.body.value.methodRef, "classifyTicket");
	assert.equal(candidate.provenance?.trajectoryHashes.length, 2);
	for (const hash of candidate.provenance?.trajectoryHashes ?? []) {
		assert.match(hash, /^sha256:[a-f0-9]{64}$/);
	}
});

test("the artifact program carries the tuned instructions, demos, and engine payload", async () => {
	const engine = createAgentLightningTrainingEngine({
		transport: stubTransport(),
	});

	const candidate = await engine.optimize(optimizeRequest(TRAJECTORIES));
	if (candidate.body.case !== "artifact") throw new Error("expected artifact");
	const program = parseTrainingArtifactProgram(
		candidate.body.value.programJson,
	);

	assert.equal(
		program.instructions,
		"Classify the support ticket by category.",
	);
	assert.equal(program.demos.length, 1);
	const payload = JSON.parse(program.enginePayloadJson);
	assert.equal(payload.rolloutId, "rollout-1");
	assert.equal(
		payload.serializedPolicyJson,
		JSON.stringify({ policy: "optimized" }),
	);
});

test("falls back to the rubric objective when the rollout returns no instructions", async () => {
	const engine = createAgentLightningTrainingEngine({
		transport: stubTransport({ instructions: "" }),
	});

	const candidate = await engine.optimize(optimizeRequest(TRAJECTORIES));
	if (candidate.body.case !== "artifact") throw new Error("expected artifact");
	const program = parseTrainingArtifactProgram(
		candidate.body.value.programJson,
	);
	assert.equal(program.instructions, "maximize classification reward");
});

test("re-parses the request, rejecting an out-of-contract optimize request", async () => {
	const engine = createAgentLightningTrainingEngine({
		transport: stubTransport(),
	});
	const bad = optimizeRequest(TRAJECTORIES);
	await assert.rejects(
		() => engine.optimize({ ...bad, requestId: "" }),
		TrainingEngineParseError,
	);
});
