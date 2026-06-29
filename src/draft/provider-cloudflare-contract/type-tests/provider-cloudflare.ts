import {
  CLOUDFLARE_PROVIDER_ID,
  cloudflare,
  createCloudflareEdgeShopPlan,
  createCloudflareProvider,
  evaluateCloudflarePlan,
  realizeCloudflarePlan
} from "../src/provider-cloudflare.js";

const provider = createCloudflareProvider({ campEvidence: "pass" });
const manifest = provider.capabilityManifest();
const plan = createCloudflareEdgeShopPlan({
  resourceOptions: {
    worker: [cloudflare.with.worker({ cpuMs: 20_000, compatibilityDate: "2026-06-01" })],
    assets: [cloudflare.with.r2({ jurisdiction: "eu" })],
    "app-db": [cloudflare.with.d1({ migrationsTable: "hobo_migrations" })],
    sessions: [cloudflare.with.kv({ ttlSeconds: 3600 })],
    jobs: [cloudflare.with.queues({ delivery: "at-least-once" })],
    "app-domain": [cloudflare.with.dns({ proxied: true })]
  }
});

const evaluation = evaluateCloudflarePlan(provider, plan);
const emission = realizeCloudflarePlan(provider, plan);

CLOUDFLARE_PROVIDER_ID satisfies "@hobo/provider-cloudflare";
manifest.claimedCapabilities satisfies Array<"compute" | "objectStore" | "database" | "kv" | "queue" | "dns">;
evaluation satisfies Record<string, unknown>;
emission satisfies Record<string, unknown>;
