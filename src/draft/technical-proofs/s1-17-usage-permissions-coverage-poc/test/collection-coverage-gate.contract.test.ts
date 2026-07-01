import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { evaluateCollectionCoverage } from "../src/collection-coverage.js";

const pactPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "contracts",
  "collection-coverage-gate.pact.json",
);

describe("collection-coverage-gate pact", () => {
  it("satisfies the cannot-prove-resource-name fail-closed interaction", () => {
    const pact = JSON.parse(readFileSync(pactPath, "utf8"));
    const interaction = pact.interactions[0];

    expect(pact.consumer.name).toBe("CollectionCoverageGateConsumer");
    expect(pact.provider.name).toBe("CollectionCoverageGate");
    expect(interaction.response.status).toBe(422);
    expect(interaction.response.body.reason).toBe(
      "collection.coverage.cannot-prove-resource-name",
    );

    const result = evaluateCollectionCoverage({
      sourceText: interaction.request.body.sourceText,
      observedResourceIds: interaction.request.body.observedResourceIds,
      fileName: "dynamic.ts",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe(interaction.response.body.reason);
  });
});
