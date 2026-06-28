export declare const CLOUDFLARE_PROVIDER_ID = "@hobo/provider-cloudflare";
export declare const CLOUDFLARE_PROVIDER_VERSION = "hobo.provider-cloudflare/v1";
export declare const CLOUDFLARE_PROVIDER_TARGET = "cloudflare";
export declare const CLOUDFLARE_TERRAFORM_DRIVER = "terraform:cloudflare";
export declare const CLOUDFLARE_WRANGLER_DRIVER = "wrangler";

export type CloudflareCapability = "compute" | "objectStore" | "database" | "kv" | "queue" | "dns";

export interface CloudflareOptionBlock<TPort extends CloudflareCapability, TOptions extends object> {
  providerId: "cloudflare";
  port: TPort;
  optionName: string;
  negotiation: "prefer" | "require";
  options: TOptions;
}

export interface WorkerOptions {
  compatibilityDate?: string;
  cpuMs?: number;
  memoryMb?: number;
  scriptSizeMb?: number;
  smartPlacement?: boolean;
}

export interface R2Options {
  jurisdiction?: "auto" | "eu" | "fedramp";
  s3Compatibility?: "aws-sdk-v3-basic" | "strict-s3-rejected";
  publicAccess?: boolean;
}

export interface D1Options {
  migrationsTable?: string;
  readReplication?: boolean;
}

export interface HyperdrivePostgresOptions {
  backingProvider?: "neon";
  pooledConnections?: boolean;
}

export interface KvOptions {
  ttlSeconds?: number;
  eventualConsistency?: boolean;
}

export interface QueuesOptions {
  delivery?: "at-least-once";
  retentionDays?: number;
}

export interface DnsOptions {
  proxied?: boolean;
  ttl?: number;
}

export interface CloudflareWithBuilders {
  worker<T extends WorkerOptions = {}>(options?: T): CloudflareOptionBlock<"compute", Required<Pick<WorkerOptions, "compatibilityDate" | "cpuMs" | "memoryMb" | "scriptSizeMb">> & T>;
  r2<T extends R2Options = {}>(options?: T): CloudflareOptionBlock<"objectStore", Required<Pick<R2Options, "jurisdiction" | "s3Compatibility" | "publicAccess">> & T>;
  d1<T extends D1Options = {}>(options?: T): CloudflareOptionBlock<"database", Required<Pick<D1Options, "migrationsTable" | "readReplication">> & T>;
  hyperdrivePostgres<T extends HyperdrivePostgresOptions = {}>(options?: T): CloudflareOptionBlock<"database", Required<Pick<HyperdrivePostgresOptions, "backingProvider" | "pooledConnections">> & T>;
  kv<T extends KvOptions = {}>(options?: T): CloudflareOptionBlock<"kv", Required<Pick<KvOptions, "ttlSeconds" | "eventualConsistency">> & T>;
  queues<T extends QueuesOptions = {}>(options?: T): CloudflareOptionBlock<"queue", Required<Pick<QueuesOptions, "delivery" | "retentionDays">> & T>;
  dns<T extends DnsOptions = {}>(options?: T): CloudflareOptionBlock<"dns", Required<Pick<DnsOptions, "proxied" | "ttl">> & T>;
}

export declare const cloudflare: {
  with: CloudflareWithBuilders;
};

export interface CloudflareProvider {
  id: typeof CLOUDFLARE_PROVIDER_ID;
  apiVersion: typeof CLOUDFLARE_PROVIDER_VERSION;
  target: typeof CLOUDFLARE_PROVIDER_TARGET;
  capabilities: readonly unknown[];
  manifest: { claimedCapabilities: CloudflareCapability[] };
  with: CloudflareWithBuilders;
  registerDefaultDefinitions<T extends unknown[]>(registry: T): T;
  realize(plan: Record<string, unknown>): Record<string, unknown>;
  capabilityManifest(): {
    provider: typeof CLOUDFLARE_PROVIDER_ID;
    claimedCapabilities: CloudflareCapability[];
    auth: { mode: "svid-federation" };
    hostRuntime: { providerNativeWasm: "opt-in" };
    colos: string[];
    capabilities: readonly unknown[];
    cost: { facts: Array<{ sku: string }> };
  };
  client(port: "compute", outputs: Record<string, unknown>): CloudflareComputeClient;
  client(port: "objectStore", outputs: Record<string, unknown>): CloudflareObjectStoreClient;
  client(port: "database", outputs: Record<string, unknown>): CloudflareDatabaseClient;
  client(port: "kv", outputs: Record<string, unknown>): CloudflareKvClient;
  client(port: "queue", outputs: Record<string, unknown>): CloudflareQueueClient;
  client(port: "dns", outputs: Record<string, unknown>): CloudflareDnsClient;
  verifyKvEvidence(options?: { tags?: Array<"local" | "camp"> }): Record<string, unknown>;
}

export interface CloudflareComputeClient {
  port: "compute";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  url: unknown;
  ping(): "compute:ok";
  describe(): Record<string, unknown>;
}

export interface CloudflareObjectStoreClient {
  port: "objectStore";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  bucketName: unknown;
  ping(): "objectStore:ok";
  describe(): Record<string, unknown>;
}

export interface CloudflareDatabaseClient {
  port: "database";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  connectionString: unknown;
  ping(): "database:ok";
  describe(): Record<string, unknown>;
}

export interface CloudflareKvClient {
  port: "kv";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  namespaceId: unknown;
  ping(): "kv:ok";
  describe(): Record<string, unknown>;
}

export interface CloudflareQueueClient {
  port: "queue";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  queueName: unknown;
  ping(): "queue:ok";
  describe(): Record<string, unknown>;
}

export interface CloudflareDnsClient {
  port: "dns";
  providerId: typeof CLOUDFLARE_PROVIDER_ID;
  zoneId: unknown;
  ping(): "dns:ok";
  describe(): Record<string, unknown>;
}

export declare function createCloudflareProvider(options?: {
  colos?: string[];
  serviceMatrix?: Record<string, string[]>;
  campEvidence?: "pass" | "fail" | Record<string, Partial<Record<"realProviderDrift" | "iam" | "mtls" | "quota", boolean>>>;
}): CloudflareProvider;

export declare function createCloudflareEdgeShopPlan(options?: Record<string, unknown>): Record<string, unknown>;
export declare function mergeCloudflareResolvedOptions(provider: CloudflareProvider, optionBlocks: readonly unknown[]): Record<string, unknown>;
export declare function evaluateCloudflarePlan(provider: CloudflareProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function realizeCloudflarePlan(provider: CloudflareProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function simulateCloudflareApply(provider: CloudflareProvider, plan: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
