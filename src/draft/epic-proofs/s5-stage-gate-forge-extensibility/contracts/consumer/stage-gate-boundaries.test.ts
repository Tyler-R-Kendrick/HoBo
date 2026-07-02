import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runS5StageGateForgeDrill } from "../../services/s5-stage-gate-reference.js";

const pactRoot = new URL("../pacts/", import.meta.url);

test("S5 stage gate simulation satisfies every declared Pact boundary", async () => {
  const result = await runS5StageGateForgeDrill();
  const pacts = await Promise.all([
    loadPact("forge-registry-certification.pact.json"),
    loadPact("bindle-deploy-journey.pact.json"),
    loadPact("stub-impl-eval-promotion.pact.json"),
    loadPact("live-fix-auto-rollback.pact.json"),
  ]);

  assert.deepEqual(
    [...result.contracts.covered].sort(),
    [
      "BindleDeployOrchestrator",
      "ForgeRegistryCertification",
      "LiveFixAutoRollbackGate",
      "StubImplEvalPromotionGate",
    ].sort(),
  );
  assert.equal(result.contracts.missing.length, 0);

  const providers = pacts.map((pact) => pact.provider.name).sort();
  assert.deepEqual(providers, [...result.contracts.covered].sort());
});

async function loadPact(name) {
  return JSON.parse(await readFile(new URL(path.posix.join("./", name), pactRoot), "utf8"));
}
