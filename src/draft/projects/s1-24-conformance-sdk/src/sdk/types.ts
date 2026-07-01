/**
 * Types derived from data-models/proto/sdk_conformance.proto.
 * Do not invent parallel interfaces — keep aligned with protobuf messages.
 */

export type AnnexCategory =
  | "error-mapping"
  | "cancellation"
  | "async-ordering"
  | "ifc-side-effects";

export type LaneStatus = "passed" | "failed";

export type Authorship = "hand-authored" | "generated";

export const SEMANTICS_ANNEX_SPEC_VERSION = "hobo.sdk.semantics-annex/v1" as const;

export interface WitResult<T> {
  ok?: T;
  err?: { tag: string; message?: string; [key: string]: unknown };
}

export interface CancellationSignal {
  reason: string;
  deadlineMs?: number;
}

export interface CollectionFact {
  sequence: number;
  kind: "resource" | "handler";
  name?: string;
  resource?: string;
  event?: string;
}

export interface LoweredOutput {
  witCalls: readonly WitCall[];
  manifest: ManifestIr;
}

export interface WitCall {
  interface: string;
  function: string;
  args: Record<string, unknown>;
}

export interface ManifestIr {
  schema: "hobo.manifest/v1";
  bindle: string;
  resources: readonly { kind: string; name: string; [key: string]: unknown }[];
  handlers?: readonly {
    resource: string;
    event: string;
    exportName: string;
  }[];
  [key: string]: unknown;
}

export interface LowerProgram {
  bindle: string;
  resources: readonly { kind: string; name: string }[];
  handlers?: readonly {
    resource: string;
    event: string;
    exportName: string;
  }[];
}

export interface SdkIdiomAdapter {
  lower(program: LowerProgram): LoweredOutput;
  mapResult<T>(result: WitResult<T>): T;
  mapCancellation(signal: CancellationSignal): WitResult<never>;
  collect(facts: readonly CollectionFact[]): Promise<WitResult<string[]>>;
}

export interface SemanticsAnnexVector {
  readonly name: string;
  readonly category: AnnexCategory;
  readonly specVersion: typeof SEMANTICS_ANNEX_SPEC_VERSION;
  readonly result?: WitResult<unknown>;
  readonly expectedThrow?: { name: string; tag: string };
  readonly signal?: CancellationSignal;
  readonly expected?: WitResult<unknown>;
  readonly facts?: readonly CollectionFact[];
  readonly expectedError?: string;
}

export interface LoweringFixture {
  readonly name: string;
  readonly program: LowerProgram;
  readonly expectedWitCalls: readonly WitCall[];
  readonly expectedManifest: ManifestIr;
}

export interface VectorCaseResult {
  readonly name: string;
  readonly category?: string;
  readonly status: LaneStatus;
  readonly reason?: string;
  readonly expectedJson?: string;
  readonly actualJson?: string;
  readonly diffPaths?: readonly string[];
}

export interface LaneReport {
  readonly lane: string;
  readonly status: LaneStatus;
  readonly boundedByCorpus?: boolean;
  readonly cases: readonly VectorCaseResult[];
}

export interface SdkConformanceReport {
  readonly suite: "@hobo/conformance/sdk";
  readonly contract: "hobo:sdk@0.1.0";
  readonly layerName: string;
  readonly authorship: Authorship;
  readonly status: LaneStatus;
  readonly corpusClaim: string;
  readonly lanes: readonly LaneReport[];
}

export interface SourceFileScan {
  readonly path: string;
  readonly source: string;
}

export interface RunSdkIdiomConformanceOptions {
  readonly layerName?: string;
  readonly authorship?: Authorship;
  readonly corpus: readonly LoweringFixture[];
  readonly corpusPath?: string;
  readonly annexVectors: readonly SemanticsAnnexVector[];
  readonly annexPath?: string;
  readonly adapter: SdkIdiomAdapter;
  readonly helperClaims?: readonly string[];
  readonly sourceFiles?: readonly SourceFileScan[];
}
