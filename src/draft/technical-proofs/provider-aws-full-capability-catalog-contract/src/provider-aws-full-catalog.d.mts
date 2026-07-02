export const AWS_PROVIDER_ID: "@hobo/provider-aws";
export const AWS_PROVIDER_VERSION: "hobo.provider-aws/v1";
export const AWS_PROVIDER_TARGET: "aws";
export const IAC_PULUMI_DRIVER: "@hobo/iac-pulumi";
export const AWS_FULL_CATALOG_PORTS: readonly string[];

export const awsFull: {
  with: Record<string, (options?: Record<string, unknown>) => Record<string, unknown>>;
};

export function createAwsFullCatalogProvider(options?: Record<string, unknown>): any;
export function createAwsFullCatalogShopPlan(options?: Record<string, unknown>): any;
export function mergeAwsFullResolvedOptions(provider: unknown, optionBlocks?: unknown[]): any;
export function evaluateAwsFullCatalogPlan(provider: unknown, plan: unknown): any;
export function realizeAwsFullCatalogPlan(provider: unknown, plan: unknown): any;
export function simulateBrokeredKeylessApply(provider: unknown, plan: unknown, options?: Record<string, unknown>): any;
export function conformanceAdapter(provider: unknown): any;
export function runAwsFullCatalogConformance(provider: unknown, options?: Record<string, unknown>): any;
export function verifyAwsFullCatalog(provider: unknown, options?: Record<string, unknown>): any;
