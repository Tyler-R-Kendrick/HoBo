export type CheckKind =
  | "multi-vantage-resolve"
  | "ttl-aware-propagation"
  | "acme-challenge"
  | "endpoint-health";

export type DomainValidationEventType =
  | "domain.ValidationStarted"
  | "domain.Validated"
  | "domain.ValidationFailed";

export interface ValidationCheckResult {
  ok: boolean;
  reason?: string;
  evidence?: Record<string, unknown>;
}

export interface ValidationCheckEvidence {
  kind: CheckKind;
  status: "passed";
  evidence: Record<string, unknown>;
}

export interface DomainValidationEvent {
  type: DomainValidationEventType;
  data: Record<string, unknown>;
}

export interface DomainValidationRequest {
  domain: string;
  changeId: string;
  camp: string;
  stage(): Promise<unknown> | unknown;
  liveZone?: {
    assertUnchanged(label: string): void;
  };
}

export interface DomainValidationGate {
  validate(request: DomainValidationRequest): Promise<{
    status: "validated" | "failed";
    events: DomainValidationEvent[];
    checks: ValidationCheckEvidence[];
    failedCheck?: CheckKind | "shadow-stage" | "live-zone-invariant";
    reason?: string;
  }>;
}

export declare const REQUIRED_CHECK_KINDS: readonly CheckKind[];

export declare function createDomainValidationGate(options: {
  checks: Record<
    CheckKind,
    (request: DomainValidationRequest) => Promise<ValidationCheckResult> | ValidationCheckResult
  >;
  timeoutMs?: number;
  clock?: () => string;
}): DomainValidationGate;

export declare function domainValidationChecks(fixtures: Record<string, unknown>): Record<CheckKind, () => ValidationCheckResult>;

export declare function createLiveZoneSnapshot(adapter: {
  inspectLiveZone(domain: string): unknown[];
}, domain: string): {
  assertUnchanged(label: string): void;
};

export declare function assertValidationEventSequence(events: DomainValidationEvent[]): true;
