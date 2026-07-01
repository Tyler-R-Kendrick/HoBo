import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createHelloBindlePlan,
  createProviderCloudflareDraft,
  parsePublishedManifest,
  publishCapabilityManifest,
} from "../src/index.js";
import { createCloudflareProvider, realizeCloudflarePlan } from "../../../technical-proofs/provider-cloudflare-contract/src/provider-cloudflare.js";

const pactPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "contracts",
  "provider-cloudflare-boundary.pact.json",
);

describe("ProviderCloudflareBoundary pact", () => {
  it("loads consumer/provider names and manifest publish satisfies the boundary contract", () => {
    const pact = JSON.parse(readFileSync(pactPath, "utf8"));
    const published = publishCapabilityManifest();
    const parsed = parsePublishedManifest(published);

    expect(pact.consumer.name).toBe("@hobo/runtime");
    expect(pact.provider.name).toBe("ProviderCloudflareBoundary");
    expect(pact.interactions[0]?.response.body.ok).toBe(true);
    expect(parsed.ok).toBe(true);
    expect(Object.keys(published).sort()).toEqual(pact.interactions[0]?.response.body.paths.sort());
  });

  it("realize hello-bindle satisfies the boundary contract resource ids", () => {
    const pact = JSON.parse(readFileSync(pactPath, "utf8"));
    const provider = createCloudflareProvider();
    const emission = realizeCloudflarePlan(provider, createHelloBindlePlan());

    expect(pact.interactions[1]?.response.body.ok).toBe(true);
    expect(emission.iac.nodes.map((node) => node.id).sort()).toEqual(
      pact.interactions[1]?.response.body.resourceIds.sort(),
    );
  });
});
