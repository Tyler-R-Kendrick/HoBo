import type {
  CapabilityManifest,
} from "../../provider-capability-manifest-contract/src/provider-capability-manifest.d.ts";

export const REGISTRY_INGEST_CONTRACT: "hobo.registry-capability-manifest-ingest/v1";
export const WELL_KNOWN_PREFIX: "/.well-known/capability-manifest/";
export const FIXTURE_SIGNATURE_ALG: "HOBO-FIXTURE-SHA256";

export interface FixtureSigningKey {
  keyId: string;
  issuer: string;
}

export interface RegistryIngestTrust {
  trustedIssuer?: string;
  now?: string;
}

export interface RegistryProviderRecord {
  providerId: string;
  manifest: CapabilityManifest;
  auth: CapabilityManifest["auth"];
  cost: CapabilityManifest["cost"];
  provenance: Record<string, unknown>;
  conformance: Record<string, unknown> | null;
  ingestedAt: string;
}

export interface RegistryEvent {
  type: "ProviderRegistered" | "CapabilityManifestUpdated";
  contract: typeof REGISTRY_INGEST_CONTRACT;
  seq: number;
  providerId: string;
  manifestSchema: string;
  provenance: Record<string, unknown>;
  conformanceReport: Record<string, unknown> | null;
  name?: string;
  version?: string;
  regions?: string[];
  capabilities?: string[];
  authMode?: string;
  costCurrency?: string;
  previousProviderId?: string | null;
}

export interface CapabilitySearchResult {
  rank: number;
  providerId: string;
  port: string;
  interface: string;
  version: string;
  stability: string;
  features: string[];
  regions: string[];
  authMode: string;
  costSkus: string[];
}

export interface CapabilityRegistry {
  ingestWellKnown(input: {
    documents: Record<string, string>;
    conformance?: Record<string, unknown> | null;
    servedRegions?: string[];
    provenance?: Record<string, unknown> | null;
    trust?: RegistryIngestTrust;
  }): {
    ok: boolean;
    providerId?: string;
    manifest?: CapabilityManifest;
    events: RegistryEvent[];
    errors: string[];
  };
  getProvider(providerId: string): RegistryProviderRecord | null;
  searchCapabilities(query?: Record<string, unknown>): {
    ok: boolean;
    contract?: typeof REGISTRY_INGEST_CONTRACT;
    query?: Record<string, unknown>;
    results: CapabilitySearchResult[];
    remediation?: Record<string, unknown>;
    reason?: string;
  };
  createPlannerCapabilitySource(): {
    contract: typeof REGISTRY_INGEST_CONTRACT;
    listCapabilities(port: string): CapabilitySearchResult[];
    search(query: Record<string, unknown>): ReturnType<CapabilityRegistry["searchCapabilities"]>;
    providers(): string[];
  };
  events(): RegistryEvent[];
  providers(): RegistryProviderRecord[];
}

export function createFixtureSigningKey(
  input?: Partial<FixtureSigningKey>,
): FixtureSigningKey;

export function signWellKnownBundle(
  documents: Record<string, string>,
  signingKey?: FixtureSigningKey,
): Record<string, string>;

export function createCapabilityRegistry(): CapabilityRegistry;

export function buildFixtureWellKnownBundle(
  provider?: ReturnType<typeof import("../../provider-capability-manifest-contract/src/provider-capability-manifest.js").createFixtureProvider>,
): Record<string, string>;

export function buildCloudflareWellKnownBundle(input?: {
  provider?: { capabilityManifest(): unknown; id?: string; conformanceReport?(): unknown };
  signingKey?: FixtureSigningKey;
}): {
  documents: Record<string, string>;
  conformance: Record<string, unknown>;
  servedRegions: string[];
  provenance: Record<string, unknown>;
};
