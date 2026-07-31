import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import {
	beqOpenUi,
	fixtures,
	replayFormalCertificate,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const pactPath = join(here, "pacts/formal-interop-boundary.pact.json");

test("PACT fixture encodes BEq and certificate fail-closed interactions", () => {
	const pact = JSON.parse(readFileSync(pactPath, "utf8")) as {
		interactions: Array<{ description: string; response: { status: number } }>;
	};
	assert.ok(pact.interactions.length >= 3);
	const meaningZero = pact.interactions.find((i) =>
		i.description.includes("meaning-zero"),
	);
	assert.equal(meaningZero?.response.status, 422);
});

test("shipped BEq and certificate APIs match PACT outcomes", () => {
	const gold = beqOpenUi(fixtures.gold, fixtures.gold);
	assert.equal(gold.ok, true);

	const meaningZero = beqOpenUi(fixtures.meaningZero, fixtures.gold);
	assert.equal(meaningZero.ok, false);

	const typed = replayFormalCertificate({
		claimId: "c1",
		theoremName: "Forest.wf",
		irDigest: "sha256:ir",
		proofDigest: "sha256:proof",
		sourceItp: "lean",
		typed: true,
	});
	assert.equal(typed.ok, true);

	const untyped = replayFormalCertificate({
		claimId: "c2",
		theoremName: "free-form",
		irDigest: "",
		proofDigest: "",
		sourceItp: "llm",
		typed: false,
	});
	assert.equal(untyped.ok, false);
	assert.equal(untyped.code, "UNTYPED_CLAIM");
});
