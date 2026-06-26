export declare const AWS_PROVIDER_ID = "@hobo/provider-aws";
export declare const AWS_PROVIDER_VERSION = "hobo.provider-aws/v1";
export declare const AWS_PROVIDER_TARGET = "aws";
export declare const IAC_PULUMI_DRIVER = "@hobo/iac-pulumi";

export type AwsCapability = "database" | "objectStore" | "compute" | "queue" | "cache";

export interface AwsOptionBlock<TPort extends AwsCapability, TOptions extends object> {
  providerId: "aws";
  port: TPort;
  optionName: string;
  negotiation: "prefer" | "require";
  options: TOptions;
}

export interface AwsRdsOptions {
  engine?: "postgres";
  instanceClass?: string;
  storageGb?: number;
  multiAz?: boolean;
  deletionProtection?: boolean;
}

export interface AwsFargateOptions {
  cpu?: number;
  memoryMb?: number;
  desiredCount?: number;
  publicIngress?: boolean;
  ingress?: "public" | "private";
}

export interface AwsAppRunnerOptions {
  cpu?: number;
  memoryMb?: number;
  ingress?: "public" | "private";
}

export interface AwsS3Options {
  encryption?: "aws:kms" | "AES256";
  versioning?: boolean;
  lifecycleDays?: number;
}

export interface AwsSqsOptions {
  fifo?: boolean;
  visibilityTimeoutSeconds?: number;
}

export interface AwsElasticacheOptions {
  engine?: "redis";
  nodeType?: string;
  replicas?: number;
}

export interface AwsWithBuilders {
  appRunner<T extends AwsAppRunnerOptions = {}>(options?: T): AwsOptionBlock<"compute", Required<Pick<AwsAppRunnerOptions, "cpu" | "memoryMb">> & T>;
  elasticache<T extends AwsElasticacheOptions = {}>(options?: T): AwsOptionBlock<"cache", Required<Pick<AwsElasticacheOptions, "engine" | "nodeType">> & T>;
  fargate<T extends AwsFargateOptions = {}>(options?: T): AwsOptionBlock<"compute", Required<Pick<AwsFargateOptions, "cpu" | "memoryMb">> & T>;
  rds<T extends AwsRdsOptions = {}>(options?: T): AwsOptionBlock<"database", Required<Pick<AwsRdsOptions, "engine" | "instanceClass">> & T>;
  s3<T extends AwsS3Options = {}>(options?: T): AwsOptionBlock<"objectStore", Required<Pick<AwsS3Options, "encryption" | "versioning">> & T>;
  sqs<T extends AwsSqsOptions = {}>(options?: T): AwsOptionBlock<"queue", Required<Pick<AwsSqsOptions, "fifo" | "visibilityTimeoutSeconds">> & T>;
}

export declare const aws: {
  with: AwsWithBuilders;
};

export interface AwsProvider {
  id: typeof AWS_PROVIDER_ID;
  apiVersion: typeof AWS_PROVIDER_VERSION;
  target: typeof AWS_PROVIDER_TARGET;
  capabilities: readonly unknown[];
  manifest: { claimedCapabilities: AwsCapability[] };
  with: AwsWithBuilders;
  registerDefaultDefinitions<T extends unknown[]>(registry: T): T;
  capabilityManifest(): {
    provider: typeof AWS_PROVIDER_ID;
    claimedCapabilities: AwsCapability[];
    auth: { mode: "svid-federation" };
    regions: string[];
    cost: { facts: Array<{ sku: string }> };
  };
  client(port: "database", outputs: Record<string, unknown>): AwsDatabaseClient;
  client(port: "objectStore", outputs: Record<string, unknown>): AwsObjectStoreClient;
  client(port: "compute", outputs: Record<string, unknown>): AwsComputeClient;
  client(port: "queue", outputs: Record<string, unknown>): AwsQueueClient;
  client(port: "cache", outputs: Record<string, unknown>): AwsCacheClient;
}

export interface AwsDatabaseClient {
  port: "database";
  providerId: typeof AWS_PROVIDER_ID;
  connectionString: string;
  ping(): "database:ok";
  describe(): Record<string, unknown>;
}

export interface AwsObjectStoreClient {
  port: "objectStore";
  providerId: typeof AWS_PROVIDER_ID;
  bucketName: unknown;
  ping(): "objectStore:ok";
  describe(): Record<string, unknown>;
}

export interface AwsComputeClient {
  port: "compute";
  providerId: typeof AWS_PROVIDER_ID;
  url: unknown;
  ping(): "compute:ok";
  describe(): Record<string, unknown>;
}

export interface AwsQueueClient {
  port: "queue";
  providerId: typeof AWS_PROVIDER_ID;
  queueUrl: unknown;
  ping(): "queue:ok";
  describe(): Record<string, unknown>;
}

export interface AwsCacheClient {
  port: "cache";
  providerId: typeof AWS_PROVIDER_ID;
  endpoint: unknown;
  ping(): "cache:ok";
  describe(): Record<string, unknown>;
}

export declare function createAwsProvider(options?: {
  regions?: string[];
  serviceMatrix?: Record<string, string[]>;
  campEvidence?: "pass" | "fail" | Record<string, Partial<Record<"realProviderDrift" | "iam" | "mtls" | "quota", boolean>>>;
}): AwsProvider;

export declare function createAwsMultiCloudShopPlan(options?: Record<string, unknown>): Record<string, unknown>;
export declare function mergeAwsResolvedOptions(provider: AwsProvider, optionBlocks: readonly unknown[]): Record<string, unknown>;
export declare function evaluateAwsPlan(provider: AwsProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function realizeAwsPlan(provider: AwsProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function simulateAwsApply(provider: AwsProvider, plan: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
