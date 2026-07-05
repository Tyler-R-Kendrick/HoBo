import assert from "node:assert/strict";
import { BUILT_IN_ENGINE_ID, TrainingEngineParseError } from "@hobo/core";
import { test } from "vitest";
import {
	AX_ENGINE_VERSION,
	createAxTrainingEngine,
	deriveSignature,
	hashTrajectory,
} from "../src/index.js";
import { mockModel, optimizeRequest, trajectory } from "./helpers.js";

const TRAJECTORIES = [
	trajectory("t1", "cannot reset password", "access", 0.95),
	trajectory("t2", "site is down", "outage", 0.97),
	trajectory("t3", "weird gibberish", "other", 0.2),
];

test("deriveSignature lowers intent + recorded I/O shape to an ax signature", () => {
	const request = optimizeRequest(TRAJECTORIES);
	const signature = deriveSignature(
		// deriveSignature takes a parsed request; the engine parses internally,
		// so mirror that here via the engine's own boundary types.
		JSON.parse(JSON.stringify(request)),
	);
	assert.equal(
		signature,
		'"maximize classification reward" subject:string -> category:string',
	);
});

test("optimize returns a provenance-pinned artifact candidate", async () => {
	const engine = createAxTrainingEngine({
		ai: mockModel("access"),
		maxMetricCalls: 8,
	});
	assert.equal(engine.engineId, BUILT_IN_ENGINE_ID);

	const candidate = await engine.optimize(
		optimizeRequest(TRAJECTORIES) as never,
	);

	assert.equal(candidate.kind, "artifact");
	if (candidate.kind !== "artifact") return;
	assert.equal(candidate.engineId, BUILT_IN_ENGINE_ID);
	assert.equal(candidate.artifact.engineVersion, AX_ENGINE_VERSION);
	assert.equal(candidate.artifact.methodRef, "classifyTicket");
	assert.ok(candidate.artifact.program);
	assert.equal(candidate.provenance.trajectoryHashes.length, 3);
	assert.equal(
		candidate.provenance.rubricRef,
		"rubric://support/classifier@1.0.0",
	);
});

test("optimize is deterministic for the same request (byte-stable candidate)", async () => {
	const engine = createAxTrainingEngine({
		ai: mockModel("access"),
		maxMetricCalls: 8,
	});
	const first = await engine.optimize(optimizeRequest(TRAJECTORIES) as never);
	const second = await engine.optimize(optimizeRequest(TRAJECTORIES) as never);
	assert.deepEqual(
		JSON.parse(JSON.stringify(first.provenance)),
		JSON.parse(JSON.stringify(second.provenance)),
	);
	assert.equal(first.id, second.id);
});

test("optimize parses its boundary and rejects malformed requests", async () => {
	const engine = createAxTrainingEngine({ ai: mockModel("access") });
	await assert.rejects(
		engine.optimize({ schema: "wrong" } as never),
		TrainingEngineParseError,
	);
});

test("hashTrajectory is canonical (key order independent)", () => {
	const base = TRAJECTORIES[0];
	assert.ok(base);
	const reordered = Object.fromEntries(Object.entries(base).reverse());
	assert.equal(
		hashTrajectory(base as never),
		hashTrajectory(reordered as never),
	);
});
