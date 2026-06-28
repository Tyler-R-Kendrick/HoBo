import {
  ConnectivityTier,
  type ConnectivityTierValue
} from "../../connectivity-tier-ir-contract/src/connectivity-tier-ir.mjs";
import {
  projectYardManifest,
  validateYardManifest,
  type DeclaredYardTopology,
  type YardManifest
} from "../src/yard-topology-manifest.mjs";

const tier: ConnectivityTierValue = ConnectivityTier.CROSS_PROVIDER_PRIVATE_INTERCONNECT;

const topology: DeclaredYardTopology = {
  yard: {
    id: "yard-aws-prod",
    provider: "aws",
    regions: ["us-east-1"],
    junctionId: "junction-shop-prod"
  },
  exposedEndpoints: [
    {
      logicalName: "shop.api",
      resourceId: "shop.api",
      campId: "prod-aws",
      provider: "aws",
      region: "us-east-1",
      dnsName: "api.aws.shop.com",
      residencyTag: "us-only"
    }
  ],
  crossYardLinks: [
    {
      id: "shop.api->shop.db",
      bindleId: "shop",
      source: {
        yardId: "yard-aws-prod",
        resourceId: "shop.api",
        endpoint: "shop.api",
        residencyTag: "us-only"
      },
      target: {
        yardId: "yard-azure-prod",
        resourceId: "shop.db",
        endpoint: "shop.db",
        residencyTag: "us-only"
      },
      requiredTier: tier,
      dnsRules: [
        {
          recordName: "db.internal.shop.com",
          type: "CNAME",
          targets: ["shop-db.privatelink.azure.internal"]
        }
      ]
    }
  ],
  topologyOverrides: [
    {
      id: "force-overlay-mesh",
      kind: "connectivity-tier",
      linkId: "shop.api->shop.db",
      requiredTier: ConnectivityTier.OVERLAY_MESH,
      reason: "regulated workload override"
    }
  ]
};

const manifest: YardManifest = projectYardManifest(topology);
const result = validateYardManifest(manifest);

if (!result.ok) {
  throw new Error(result.reason);
}
