import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildHelloBindle } from "../../test/helpers.js";

const pactPath = fileURLToPath(
  new URL("../pacts/componentize-build-boundary.pact.json", import.meta.url),
);

describe("componentize boundary consumer pact", () => {
  it("matches the componentize-build-boundary interaction", async () => {
    const pact = JSON.parse(await readFile(pactPath, "utf8"));
    const interaction = pact.interactions[0];
    const result = await buildHelloBindle();

    expect(interaction.request.method).toBe("POST");
    expect(interaction.request.path).toBe("/componentize/hello-bindle");
    expect(result.oci.manifest.mediaType).toBe(interaction.response.body.oci.mediaType);
    expect(interaction.response.body.validation.passed).toBe(true);
    expect(interaction.response.body.smoke.exitCode).toBe(0);
  }, 180_000);
});
