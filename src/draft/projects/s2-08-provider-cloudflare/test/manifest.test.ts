import { describe, expect, it } from "vitest";

import {
  INITIAL_CAPABILITY_PORTS,
  createProviderCloudflareDraft,
  equivalenceForPort,
  parsePublishedManifest,
  publishCapabilityManifest,
} from "../src/index.js";

describe("Capability Manifest publication (FR-031)", () => {
  it("publishes capabilities, auth, and cost.json under /.well-known/capability-manifest/", () => {
    const documents = publishCapabilityManifest();
    const parsed = parsePublishedManifest(documents);

    expect(parsed.ok).toBe(true);
    expect(parsed.auth.schema).toBe("hobo.provider-auth/v1");
    expect(parsed.cost.schema).toBe("hobo.cost/v1");
    expect(parsed.capabilities.capabilities).toHaveLength(3);
    expect(parsed.capabilities.capabilities.map((c: { port: string }) => c.port).sort()).toEqual([
      "compute",
      "kv",
      "objectStore",
    ]);
  });

  it("rejects manifests that publish static secrets", () => {
    const documents = publishCapabilityManifest();
    const auth = JSON.parse(documents["/.well-known/capability-manifest/auth.json"]);
    auth.staticKey = "secret";
    documents["/.well-known/capability-manifest/auth.json"] = `${JSON.stringify(auth, null, 2)}\n`;
    const parsed = parsePublishedManifest(documents);

    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toContain("auth must not publish static secrets");
  });
});

describe("Equivalence-class mappings", () => {
  it("maps web/service, kv, and objectStore to Cloudflare resource classes", () => {
    expect(equivalenceForPort("web/service").resourceClass).toBe("cloudflare:workers-script");
    expect(equivalenceForPort("kv").resourceClass).toBe("cloudflare:kv-namespace");
    expect(equivalenceForPort("objectStore").resourceClass).toBe("cloudflare:r2-bucket");
    expect(INITIAL_CAPABILITY_PORTS).toEqual(["web/service", "kv", "objectStore"]);
  });
});

describe("Provider factory", () => {
  it("covers all initial ports via claimed capabilities", () => {
    const provider = createProviderCloudflareDraft();
    for (const port of INITIAL_CAPABILITY_PORTS) {
      expect(provider.coversInitialPort(port)).toBe(true);
    }
  });
});
