import assert from "node:assert/strict";
import { test } from "vitest";

import {
	parseOptimizeRequest,
	parseTrainingArtifact,
	parseTrainingCandidate,
	parseTrajectory,
	TRAINING_ARTIFACT_SCHEMA,
	TRAINING_CANDIDATE_SCHEMA,
	TRAINING_OPTIMIZE_REQUEST_SCHEMA,
	TRAINING_TRAJECTORY_SCHEMA,
	TrainingEngineParseError,
} from "../src/ports/training-engine.js";

const TRAJECTORY_HASH = `sha256:${"a".repeat(64)}`;

function goldenRegion() {
	return {
		regionId: "region-classifyTicket-body",
		artifactRef: "git://repo/src/support.ts#classifyTicket",
		startOffset: 0,
		endOffset: 80,
		owner: "training-engine",
	};
}

function goldenTrajectory(overrides: Record<string, unknown> = {}) {
	return {
		schema: TRAINING_TRAJECTORY_SCHEMA,
		id: "trajectory-1",
		traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		run: {
			id: "run-training-1",
			tenantId: "tenant-a",
			bindle: "bindle/support",
			agent: {
				id: "agent:support-classifier",
				principalRef:
					"spiffe://tenant-a/bindle/support/agent/support-classifier",
			},
		},
		subject: {
			method: "classifyTicket",
			contractRef: "contract://support/classification@1.0.0",
			generatedRegion: goldenRegion(),
		},
		spans: [
			{
				id: "span-root",
				parentId: null,
				name: "support.classifyTicket",
				startTime: "2026-06-25T09:00:00.000Z",
				endTime: "2026-06-25T09:00:00.120Z",
				attributes: { "openinference.span.kind": "CHAIN" },
			},
			{
				id: "span-llm",
				parentId: "span-root",
				name: "llm.classifyTicket",
				startTime: "2026-06-25T09:00:00.010Z",
				endTime: "2026-06-25T09:00:00.100Z",
				attributes: { "openinference.span.kind": "LLM" },
			},
		],
		payloads: {
			"ticket.intent": {
				classification: "public",
				redaction: "none",
				value: "password-reset",
			},
		},
		reward: {
			source: "live-eval",
			rubricRef: "rubric://support/classifier@1.0.0",
			score: 0.94,
		},
		...overrides,
	};
}

function goldenOptimizeRequest() {
	return {
		schema: TRAINING_OPTIMIZE_REQUEST_SCHEMA,
		requestId: "optimize-request-1",
		generatedRegion: goldenRegion(),
		trajectories: [goldenTrajectory()],
		rubric: {
			id: "rubric://support/classifier@1.0.0",
			objective: "maximize classification reward",
		},
		contract: {
			ref: "contract://support/classification@1.0.0",
			method: "classifyTicket",
			allowedRegionId: "region-classifyTicket-body",
		},
	};
}

test("parses and freezes a golden trajectory", () => {
	const trajectory = parseTrajectory(goldenTrajectory());
	assert.equal(trajectory.id, "trajectory-1");
	assert.equal(trajectory.spans.length, 2);
	assert.ok(Object.isFrozen(trajectory));
	assert.ok(Object.isFrozen(trajectory.reward));
});

test("rejects a malformed traceparent", () => {
	assert.throws(
		() => parseTrajectory(goldenTrajectory({ traceparent: "not-a-trace" })),
		TrainingEngineParseError,
	);
});

test("rejects an unknown OpenInference span kind", () => {
	const trajectory = goldenTrajectory();
	(trajectory.spans[0] as { attributes: Record<string, unknown> }).attributes =
		{ "openinference.span.kind": "MYSTERY" };
	assert.throws(() => parseTrajectory(trajectory), TrainingEngineParseError);
});

test("rejects an unredacted sensitive payload (ADR-0099 fail-closed)", () => {
	const trajectory = goldenTrajectory({
		payloads: {
			"user.email": {
				classification: "pii",
				redaction: "none",
				value: "person@example.com",
			},
		},
	});
	assert.throws(() => parseTrajectory(trajectory), TrainingEngineParseError);
});

test("accepts a tokenized sensitive payload", () => {
	const trajectory = parseTrajectory(
		goldenTrajectory({
			payloads: {
				"user.email": {
					classification: "pii",
					redaction: "tokenized",
					tokenRef: "token://tenant-a/abc",
				},
			},
		}),
	);
	assert.equal(trajectory.payloads["user.email"]?.redaction, "tokenized");
});

test("parses an optimize request and enforces region correlation", () => {
	const request = parseOptimizeRequest(goldenOptimizeRequest());
	assert.equal(request.trajectories.length, 1);

	const mismatched = goldenOptimizeRequest();
	mismatched.contract.allowedRegionId = "some-other-region";
	assert.throws(
		() => parseOptimizeRequest(mismatched),
		TrainingEngineParseError,
	);
});

test("parses a patch candidate and rejects out-of-region edits (ADR-0048)", () => {
	const base = {
		schema: TRAINING_CANDIDATE_SCHEMA,
		kind: "patch",
		id: "candidate-1",
		engineId: "hobo.training-engine/built-in-opto@0.1.0",
		region: goldenRegion(),
		edits: [{ startOffset: 14, endOffset: 34, replacement: "return x;" }],
		provenance: {
			trajectoryHashes: [TRAJECTORY_HASH],
			rubricRef: "rubric://support/classifier@1.0.0",
			contractRef: "contract://support/classification@1.0.0",
		},
	};
	const candidate = parseTrainingCandidate(base, goldenRegion());
	assert.equal(candidate.kind, "patch");

	const outOfRegion = {
		...base,
		edits: [{ startOffset: 81, endOffset: 90, replacement: "overwrite" }],
	};
	assert.throws(
		() => parseTrainingCandidate(outOfRegion, goldenRegion()),
		TrainingEngineParseError,
	);
});

test("parses an artifact candidate (ADR-0125 apply-at-load form)", () => {
	const candidate = parseTrainingCandidate({
		schema: TRAINING_CANDIDATE_SCHEMA,
		kind: "artifact",
		id: "candidate-2",
		engineId: "hobo.training-engine/built-in-opto@0.1.0",
		artifact: {
			schema: TRAINING_ARTIFACT_SCHEMA,
			engineId: "hobo.training-engine/built-in-opto@0.1.0",
			engineVersion: "22.0.0",
			methodRef: "bindle/support#classifyTicket",
			program: { instructions: "Classify the ticket.", demos: [] },
		},
		provenance: {
			trajectoryHashes: [TRAJECTORY_HASH],
			rubricRef: "rubric://support/classifier@1.0.0",
			contractRef: "contract://support/classification@1.0.0",
		},
	});
	assert.equal(candidate.kind, "artifact");
	if (candidate.kind === "artifact") {
		assert.equal(candidate.artifact.engineVersion, "22.0.0");
	}
});

test("parseTrainingArtifact rejects a missing program", () => {
	assert.throws(
		() =>
			parseTrainingArtifact({
				schema: TRAINING_ARTIFACT_SCHEMA,
				engineId: "engine",
				engineVersion: "1",
				methodRef: "m",
				program: null,
			}),
		TrainingEngineParseError,
	);
});
