import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runComponentSmoke, validateWasmComponentArtifact } from "../../src/index.js";
import { buildHelloBindle } from "../../test/helpers.js";

const pactPath = fileURLToPath(
  new URL("../pacts/componentize-build-boundary.pact.json", import.meta.url),
);

describe("componentize boundary provider pact", () => {
  it("verifies the provider response envelope", async () => {
    const pact = JSON.parse(await readFile(pactPath, "utf8"));
    const expected = pact.interactions[0].response.body;
    const result = await buildHelloBindle();
    const validation = validateWasmComponentArtifact(result.component);
    const smoke = await runComponentSmoke(result.component, { exportName: "health" });

    expect(validation.passed).toBe(expected.validation.passed);
    expect(smoke.exitCode).toBe(expected.smoke.exitCode);
    expect(result.oci.manifest.mediaType).toBe(expected.oci.mediaType);
  }, 240_000);
});
