export type BrokerArtifactKind =
  | "contract-manifest"
  | "broker-environment"
  | "mapping-contract"
  | "broker-catalog-snapshot"
  | "resolution-receipt"
  | "resolution-rejection";

export interface BrokerArtifactEnvelope<TPayload = Record<string, unknown>> {
  kind: BrokerArtifactKind;
  schema: string;
  version: string;
  owner: string;
  provenance: BrokerArtifactProvenance;
  payload: TPayload;
}

export interface BrokerArtifactProvenance {
  source: {
    issue: string;
    refs: string[];
  };
  proofMode: "schema-test" | "contract-test" | "negative-test" | "policy-fixture";
  signature: {
    issuer: string;
    algorithm: "ed25519";
    digest: string;
  };
}

export declare const BROKER_ARTIFACT_SCHEMAS: Record<BrokerArtifactKind, string>;
export declare function createAcceptedBrokerFixture(): { artifacts: BrokerArtifactEnvelope[] };
export declare function createRejectionBrokerFixture(
  reason: "unsupported-capability" | "stale-catalog-snapshot" | "incompatible-mapping" | "ambiguous-mapping",
): { artifacts: BrokerArtifactEnvelope[] };
export declare function parseBrokerArtifactSet(input: unknown):
  | { ok: true; artifacts: BrokerArtifactEnvelope[]; errors: [] }
  | { ok: false; artifacts: []; errors: string[] };
export declare function evaluateBrokerArtifacts(artifacts: BrokerArtifactEnvelope[]): unknown;
export declare function stableDigest(value: unknown): string;
