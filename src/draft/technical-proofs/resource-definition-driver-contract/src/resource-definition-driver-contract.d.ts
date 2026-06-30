export type DriverId = "terraform" | "template" | "echo" | "container" | "custom-webhook";

export type DriverContract = {
  id: DriverId;
  mutability: "managed" | "read-only";
};

export type ProviderRef = string | { id: string };

export type MatchContext = {
  tenant?: string;
  app?: string;
  env?: string;
  envType?: string;
  resourceType?: string;
  resourceClass?: string;
  resourceId?: string;
};

export type ResourceDefinition = {
  apiVersion: "hobo.resource-definition/v1";
  id: string;
  type: string;
  engine?: string;
  className?: string;
  paradigm?: string;
  provider: string;
  driver: DriverId;
  with: Record<string, unknown>;
  match: MatchContext;
  priority: number;
  mapping?: string | Record<string, unknown>;
  coProvisioned: Array<Record<string, unknown>>;
};

export type ResourceDefinitionInput = {
  id?: string;
  type: string;
  engine?: string;
  className?: string;
  class?: string;
  paradigm?: string;
  provider: ProviderRef;
  driver: DriverId;
  with?: Record<string, unknown>;
  match?: MatchContext;
  priority?: number;
  mapping?: string | Record<string, unknown>;
  coProvisioned?: Array<Record<string, unknown>>;
};

export type ProviderDefaults = {
  id: string;
  defaultDefinitions: ResourceDefinitionInput[];
};

export type CatalogAmbiguity = {
  key: string;
  definitionIds: string[];
  reason: string;
};

export type CatalogSnapshot = {
  apiVersion: "hobo.resource-definition-catalog/v1";
  id: string;
  definitions: ResourceDefinition[];
  contentHash: string;
  ambiguities: CatalogAmbiguity[];
};

export type DriverProvisionInput = {
  context: MatchContext;
  inputs: unknown;
  oldState?: unknown;
};

export type DriverProvisionResult = {
  outputs: Record<string, unknown>;
  manifests?: unknown[];
  state?: unknown;
};

export interface Driver {
  id: DriverId;
  provision(input: DriverProvisionInput): Promise<DriverProvisionResult> | DriverProvisionResult;
  destroy(input: { context: MatchContext; state: unknown }): Promise<void> | void;
  refresh?(input: { context: MatchContext; state: unknown }): Promise<unknown> | unknown;
}

export declare function defineResource(input: ResourceDefinitionInput): ResourceDefinition;
export declare function createResourceCatalog(input?: { id?: string }): {
  register(providerOrDefinition: ResourceDefinitionInput | ResourceDefinition | ProviderDefaults): ResourceDefinition[];
  definitionsForType(type: string): ResourceDefinition[];
  snapshot(): CatalogSnapshot;
  contentHash(): string;
  ambiguities(): CatalogAmbiguity[];
};
export declare function createDriver(driver: Driver): Driver;
export declare function driverContractFor(driverId: DriverId): DriverContract;
export declare function stableDigest(value: unknown): string;
