import type {
  Decision,
  DecisionRequest,
  Effect,
} from "../../hobo-policy-ir-contract/src/policy-ir.d.mts";

export const POLICY_IR_SCHEMA_VERSION: "hobo.policy-ir/v1";
export type {
  Decision,
  DecisionRequest,
  Effect,
} from "../../hobo-policy-ir-contract/src/policy-ir.d.mts";

export const BUILT_IN_POLICY_ENGINE_ID: "hobo.policy-engine/built-in-typescript@0.1.0";
export const POLICY_RULESET_SCHEMA_VERSION: "hobo.policy-ruleset/v1";
export const BUILT_IN_POLICY_ENGINE_EXECUTION_MODE: "yard-local";

export interface TypescriptRuleContext {
  request: DecisionRequest;
}

export interface TypescriptRuleDecision {
  effect: Effect;
  reason: string;
  violations?: unknown[];
  mutations?: unknown[];
  approvals?: unknown[];
  obligations?: Array<{ kind: string; [key: string]: unknown }>;
}

export interface TypescriptRule {
  authoring: "typed-typescript-rule";
  id: string;
  when(context: TypescriptRuleContext): boolean;
  decide(context: TypescriptRuleContext): TypescriptRuleDecision;
}

export interface PolicyRuleset {
  schemaVersion: typeof POLICY_RULESET_SCHEMA_VERSION;
  id: string;
  version: string;
  policyPacks: unknown[];
  rules: TypescriptRule[];
}

export interface BuiltInPolicyEngine {
  engineId: string;
  executionMode: typeof BUILT_IN_POLICY_ENGINE_EXECUTION_MODE;
  evaluate(request: unknown, ruleset: unknown): Decision;
}

export function createGoldenDecisionRequest(overrides?: unknown): DecisionRequest;
export function defineTypescriptRule(rule: {
  id: string;
  when(context: TypescriptRuleContext): boolean;
  decide(context: TypescriptRuleContext): TypescriptRuleDecision;
}): TypescriptRule;
export function createRuleset(input?: {
  id?: string;
  version?: string;
  policyPacks?: unknown[];
  rules?: TypescriptRule[];
}): PolicyRuleset;
export function createBuiltInPolicyEngine(input?: { engineId?: string }): BuiltInPolicyEngine;
export function evaluatePolicy(engine: BuiltInPolicyEngine, request: unknown, ruleset: unknown): Decision;
export function evaluateAndRecordPolicyDecision(input: {
  engine: BuiltInPolicyEngine;
  request: unknown;
  ruleset: unknown;
  auditSink(event: unknown): void | Promise<void>;
}): Promise<Decision>;
export function requestTuple(request: unknown): string;
