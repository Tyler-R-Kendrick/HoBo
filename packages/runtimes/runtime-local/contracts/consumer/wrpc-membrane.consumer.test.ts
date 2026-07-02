import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface PactInteraction {
	description: string;
	request: { method: string; path: string; body?: Record<string, unknown> };
	response: { status: number; body: Record<string, unknown> };
}

interface PactContract {
	consumer: { name: string };
	provider: { name: string };
	interactions: PactInteraction[];
	metadata: { boundaryId: string; pactSpecification?: { version: string } };
}

async function loadPact(): Promise<PactContract> {
	const raw = await readFile(new URL("../wrpc-membrane.pact.json", import.meta.url), "utf8");
	return JSON.parse(raw) as PactContract;
}

test("wrpc-membrane consumer pact fixtures are well-formed", async () => {
	const pact = await loadPact();
	assert.equal(pact.consumer.name, "RuntimeLocalComponentCaller");
	assert.equal(pact.provider.name, "WrpcMembraneLinkLayer");
	assert.equal(pact.metadata.pactSpecification?.version, "3.0.0");
	assert.equal(pact.interactions.length, 4);

	const [establishSuccess, establishBelowFloor, unlinkedCall, linkedCall] = pact.interactions;

	assert.match(establishSuccess.description, /establish-link success/);
	assert.deepEqual(establishSuccess.response.body.negotiatedWire, {
		minor: "1.2",
		version: "1.2.0",
	});

	assert.equal(establishBelowFloor.response.body.code, "version-incompatible");
	assert.equal(establishBelowFloor.response.body.reason, "shared-minor-below-floor");
	assert.equal(establishBelowFloor.response.body.phase, "link-establishment");

	assert.equal(unlinkedCall.response.body.code, "no-route");

	assert.deepEqual(linkedCall.response.body.linkCalled, {
		transport: "in-process",
		boundaryMode: "live",
		codec: "json-wit",
		deadline: "2026-06-25T15:45:00.000Z",
	});
	assert.equal(pact.metadata.boundaryId, "wrpc-membrane");
});
