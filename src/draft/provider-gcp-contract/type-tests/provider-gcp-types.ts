import { createGcpMultiCloudShopPlan, createGcpProvider, gcp, type GcpProvider } from "../src/provider-gcp.js";

const provider: GcpProvider = createGcpProvider();
const cloudSql = gcp.with.cloudSql({ databaseVersion: "POSTGRES_16", tier: "db-custom-2-7680", storageGb: 50 });
const cloudRun = gcp.with.cloudRun({ minInstances: 1, ingress: "all", cpuAlwaysAllocated: true });
const pubSub = gcp.with.pubSub({ ordering: true });
const manifest = provider.capabilityManifest();
const client = provider.client("database", {
  endpoint: "postgres://fixture",
  connectionString: "postgres://gcp/us-central1/orders",
  secretRef: "svid://token/orders"
});
const emission = provider.realize(createGcpMultiCloudShopPlan());

cloudSql.options.storageGb satisfies number;
cloudRun.options.ingress satisfies "all" | "internal" | "internal-and-cloud-load-balancing";
cloudRun.options.cpuAlwaysAllocated satisfies boolean;
pubSub.options.ordering satisfies boolean;
client.connectionString satisfies string;
emission satisfies Record<string, unknown>;
manifest.capabilities[0].resourceClasses satisfies string[];

// @ts-expect-error Cloud SQL options reject untyped option escape hatches.
gcp.with.cloudSql({ rawTerraformResourceType: "google_sql_database_instance" });

// @ts-expect-error client is typed to declared GCP ports only.
provider.client("email", {});
