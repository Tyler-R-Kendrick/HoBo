export declare const AZURE_PROVIDER_ID = "@hobo/provider-azure";
export declare const AZURE_PROVIDER_VERSION = "hobo.provider-azure/v1";
export declare const AZURE_PROVIDER_TARGET = "azure";
export declare const IAC_PULUMI_DRIVER = "@hobo/iac-pulumi";
export declare const FULL_CAPABILITY_PORTS: readonly ["web", "service", "kv", "bucket", "queue", "topic", "sql", "secret"];

export declare const azureFull: {
  with: {
    blob(options?: Record<string, unknown>): unknown;
    containerApp(options?: Record<string, unknown>): unknown;
    flexiblePostgres(options?: Record<string, unknown>): unknown;
    keyVault(options?: Record<string, unknown>): unknown;
    serviceBusQueue(options?: Record<string, unknown>): unknown;
    serviceBusTopic(options?: Record<string, unknown>): unknown;
    staticWebApp(options?: Record<string, unknown>): unknown;
    tableStorage(options?: Record<string, unknown>): unknown;
  };
};

export declare function createAzureFullProvider(options?: Record<string, unknown>): Record<string, unknown>;
export declare function createAzureFullMultiCloudShopPlan(options?: Record<string, unknown>): Record<string, unknown>;
export declare function mergeAzureFullResolvedOptions(provider: Record<string, unknown>, optionBlocks: readonly unknown[]): Record<string, unknown>;
export declare function evaluateAzureFullPlan(provider: Record<string, unknown>, plan: Record<string, unknown>): Record<string, unknown>;
export declare function realizeAzureFullPlan(provider: Record<string, unknown>, plan: Record<string, unknown>): Record<string, unknown>;
export declare function simulateAzureFullApply(provider: Record<string, unknown>, plan: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export declare function createManifestBundle(regions: string[], serviceMatrix: Record<string, string[]>): Record<string, unknown>;
export declare function ingestAzureCapabilityManifest(registry: Map<string, unknown>, bundle: Record<string, unknown>): Record<string, unknown>;
export declare function createConformanceAdapter(provider: Record<string, unknown>): Record<string, unknown>;
export declare function runExtendedPortConformance(provider: Record<string, unknown>, ports?: string[]): Record<string, unknown>;
