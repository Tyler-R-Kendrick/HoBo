export const JUNCTION_REGISTRY_FEDERATION_CONTRACT: "hobo.junction-registry-federation/v1";
export const JUNCTION_ARTIFACT_SHARED_EVENT: "junction.ArtifactShared";

export interface Coordinate {
  name: string;
  version: string;
}

export interface FederatedYard {
  readonly yardId: string;
  certifyListing(input: { descriptor: unknown; candidate: unknown }): ContractResult;
  yankListing(coordinate: Coordinate, input: { reason: string }): ContractResult;
  exportBundle(input: { coordinate: Coordinate; targetYardId: string }): ContractResult & {
    bundle?: unknown;
    payloads?: Map<string, unknown>;
    sourceRegistryLogSeq?: number;
  };
  importBundle(input: { bundle: unknown; payloads: Map<string, unknown> }): ContractResult & {
    targetRegistryLogSeq?: number;
  };
  discover(coordinate: Coordinate): unknown | null;
  install(coordinate: Coordinate): unknown;
  applyPeerYank(input: { coordinate: Coordinate; sourceYardId: string; reason: string }): ContractResult;
  getListingState(coordinate: Coordinate): unknown;
  registryLog(): unknown[];
}

export interface JunctionRegistryFederation {
  shareArtifact(input: {
    sourceYardId: string;
    targetYardId: string;
    coordinate: Coordinate;
  }): ContractResult & {
    event?: JunctionArtifactSharedEvent | null;
    importResult?: unknown;
  };
  applyPeerYank(input: {
    sourceYardId: string;
    targetYardId: string;
    coordinate: Coordinate;
  }): ContractResult;
  events(): JunctionArtifactSharedEvent[];
}

export interface JunctionArtifactSharedEvent {
  type: typeof JUNCTION_ARTIFACT_SHARED_EVENT;
  contract: typeof JUNCTION_REGISTRY_FEDERATION_CONTRACT;
  sourceYardId: string;
  targetYardId: string;
  coordinate: Coordinate;
  bundleDigest: string;
  artifactDigests: string[];
  sourceRegistryLogSeq: number;
  targetRegistryLogSeq: number;
  sharedAt: string;
}

export interface ContractResult {
  ok: boolean;
  reasons: readonly string[];
  event?: unknown;
}

export function createFederatedYard(input: {
  yardId: string;
  trustBoundary: unknown;
  now?: () => string;
}): FederatedYard;

export function createJunctionRegistryFederation(input: {
  yards: FederatedYard[];
  now?: () => string;
}): JunctionRegistryFederation;
