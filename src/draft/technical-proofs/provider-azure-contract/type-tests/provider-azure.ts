import {
  AZURE_PROVIDER_ID,
  azure,
  createAzureMultiCloudShopPlan,
  createAzureProvider,
  evaluateAzurePlan,
  realizeAzurePlan
} from "../src/provider-azure.js";

const provider = createAzureProvider({ campEvidence: "pass" });
const manifest = provider.capabilityManifest();
const plan = createAzureMultiCloudShopPlan({
  resourceOptions: {
    "orders-db": [azure.with.flexiblePostgres({ sku: "GP_Standard_D2s_v3", zoneRedundantHa: true })],
    assets: [azure.with.blob({ redundancy: "ZRS", immutableStorage: true })],
    web: [azure.with.containerApp({ ingress: "external", daprEnabled: true })],
    jobs: [azure.with.serviceBus({ sessions: true })],
    "session-cache": [azure.with.cacheForRedis({ sku: "Premium" })]
  }
});

const evaluation = evaluateAzurePlan(provider, plan);
const emission = realizeAzurePlan(provider, plan);

AZURE_PROVIDER_ID satisfies "@hobo/provider-azure";
manifest.claimedCapabilities satisfies Array<"database" | "objectStore" | "compute" | "queue" | "cache">;
evaluation satisfies Record<string, unknown>;
emission satisfies Record<string, unknown>;

// @ts-expect-error Azure option blocks do not accept raw ARM/Bicep escape hatches in this contract.
azure.with.containerApp({ rawArmTemplate: { type: "Microsoft.App/containerApps" } });

if (false) {
  // @ts-expect-error client is typed to declared Azure seed ports only.
  provider.client("dns", {});
}
