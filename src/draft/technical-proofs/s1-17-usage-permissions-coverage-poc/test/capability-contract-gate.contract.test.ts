import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildUsagePermissionManifest,
  parseUsagePermissionInput,
} from "../src/usage-permissions.js";

const pactPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "contracts",
  "capability-contract-gate.pact.json",
);

describe("capability-contract-gate pact", () => {
  it("satisfies the 422 capability.required-not-granted interaction", () => {
    const pact = JSON.parse(readFileSync(pactPath, "utf8"));
    const interaction = pact.interactions[0];

    expect(pact.consumer.name).toBe("SdkAuthoringReferenceApp");
    expect(pact.provider.name).toBe("CapabilityContractGate");
    expect(interaction.response.status).toBe(422);
    expect(interaction.response.body.reason).toBe("capability.required-not-granted");

    const { manifest } = buildUsagePermissionManifest(
      parseUsagePermissionInput({
        bindle: "support-sync",
        resources: [
          {
            kind: "kv",
            name: "profile-cache",
            port: "wasi:keyvalue",
            catalogVerbs: ["get", "set"],
            observedCalls: [
              { verb: "get", source: "handler" },
              { verb: "set", source: "handler" },
            ],
            declaredAllow: interaction.request.body.granted,
          },
        ],
      }),
    );

    const [resource] = manifest.resources;
    expect(resource?.capabilityContract.required).toEqual(interaction.request.body.required);
    expect(resource?.capabilityContract.granted).toEqual(interaction.request.body.granted);
    expect(resource?.capabilityContract.failures[0]?.code).toBe(
      interaction.response.body.reason,
    );
  });
});
