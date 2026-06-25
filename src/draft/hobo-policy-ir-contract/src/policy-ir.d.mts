export const POLICY_IR_SCHEMA_VERSION: "hobo.policy-ir/v1";
export const POLICY_DECIDED_EVENT_TYPE: "policy.Decided";
export const SUBJECT_KINDS: readonly ["user", "service", "agent", "system"];
export const PHASES: readonly [
  "author",
  "local",
  "test",
  "plan",
  "apply",
  "runtime",
  "observe",
  "train",
  "promote",
  "repair",
];
export const EFFECTS: readonly [
  "allow",
  "allow-degraded",
  "deny",
  "warn",
  "mutate",
  "require-approval",
];

export type SubjectKind = (typeof SUBJECT_KINDS)[number];
export type Phase = (typeof PHASES)[number];
export type Effect = (typeof EFFECTS)[number];

export interface PrincipalRef {
  kind: SubjectKind;
  id: string;
}

export interface DecisionSubject extends PrincipalRef {
  roles?: string[];
  scopes?: string[];
  delegatedBy?: PrincipalRef | string;
}

export interface DecisionResource {
  kind: string;
  id: string;
}

export interface DecisionRequest {
  schemaVersion: typeof POLICY_IR_SCHEMA_VERSION;
  subject: DecisionSubject;
  action: string;
  resource: DecisionResource;
  phase: Phase;
  context: Record<string, unknown>;
  inputHash: `sha256:${string}`;
}

export interface DecisionEvidence {
  policyIds: string[];
  inputHash: `sha256:${string}`;
  engine: string;
}

export interface Decision {
  schemaVersion: typeof POLICY_IR_SCHEMA_VERSION;
  effect: Effect;
  reason: string;
  violations: unknown[];
  mutations: unknown[];
  approvals: unknown[];
  obligations: Array<{ kind: string; [key: string]: unknown }>;
  evidence: DecisionEvidence;
}

export class PolicyIrValidationError extends Error {
  code: string;
  path: string;
}

export function createDecisionRequest(input: unknown): DecisionRequest;
export function parseDecisionRequest(input: unknown): DecisionRequest;
export function createDecision(requestInput: unknown, decisionInput: unknown): Decision;
export function parseDecision(input: unknown, requestInput?: unknown): Decision;
export function serializePolicyIrDocument(input: unknown): string;
export function parsePolicyIrDocument(input: unknown): { request: DecisionRequest; decision: Decision };
export function migratePolicyIrDocument(input: unknown): DecisionRequest;
export function createPolicyDecidedEvent(input: {
  request: unknown;
  decision: unknown;
  id?: string;
}): {
  id: string;
  type: typeof POLICY_DECIDED_EVENT_TYPE;
  schemaVersion: typeof POLICY_IR_SCHEMA_VERSION;
  subject: DecisionSubject;
  action: string;
  resource: DecisionResource;
  phase: Phase;
  data: Decision;
};
export function toWitDecisionRecord(input: unknown): unknown;
export function fromWitDecisionRecord(input: unknown, requestInput?: unknown): Decision;
export function hashDecisionRequest(input: unknown): `sha256:${string}`;
export function canonicalJson(input: unknown): string;
