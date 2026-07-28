// public-contract: isolation schema id.
export const CODE_ISOLATION_SCHEMA = "hobo.code.isolation/v1" as const;
// public-contract: evidence schema id.
export const CODE_EVIDENCE_SCHEMA = "hobo.code.evidence/v1" as const;
// public-contract: package id consumers assert against.
export const HOBO_CODE_PACKAGE = "@hobo/code" as const;

export type IsolationKind = "rift" | "worktree";
export type IsolationStatus = "open" | "cleaned" | "failed";
export type AgentSemanticState = "blocked" | "working" | "done" | "idle";

// domain-view: richer parse-don't-validate view over IsolationBackend wire form
export interface IsolationBackend {
	readonly kind: IsolationKind;
	readonly platform: string;
	readonly cowCapable: boolean;
	readonly reason: string;
}

// domain-view: richer parse-don't-validate view over IsolationContext wire form
export interface IsolationContext {
	readonly schemaVersion: typeof CODE_ISOLATION_SCHEMA;
	readonly runId: string;
	readonly branch: string;
	readonly rootPath: string;
	readonly backend: IsolationBackend;
	readonly stationId?: string;
	/** Durable learning artifacts live outside the ephemeral isolation root. */
	readonly durableRoot: string;
	readonly createdAt: string;
	readonly status: IsolationStatus;
	/** Canonical project is read-only for agent runs. */
	readonly projectRoot: string;
	readonly mediatedOnly: true;
}

export interface HandbackReport {
	readonly runId: string;
	readonly ok: boolean;
	readonly branch: string;
	readonly gates: readonly string[];
	readonly isolationStatus: IsolationStatus;
	readonly orphans: readonly string[];
	readonly message: string;
}

// domain-view: richer parse-don't-validate view over PromotionRequest wire form
export interface PromotionRequest {
	readonly runId: string;
	readonly isolationRoot: string;
	readonly targetProject: string;
	readonly gateResults: readonly string[];
	/** Exclusive squash-merge only (ADR-0139). */
	readonly squashOnly: true;
}

// domain-view: richer parse-don't-validate view over PromotionResult wire form
export interface PromotionResult {
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly mergedBranch?: string;
	readonly cleaned: boolean;
}

// domain-view: richer parse-don't-validate view over EvidenceTriple wire form
export interface EvidenceTriple {
	readonly schemaVersion: typeof CODE_EVIDENCE_SCHEMA;
	readonly flagKey: string;
	readonly scenario: string;
	readonly playwrightScriptPath: string;
	readonly recordingMp4Path: string;
	readonly screenshotPaths: readonly string[];
	readonly durableRoot: string;
}

// domain-view: richer parse-don't-validate view over AgentPaneState wire form
export interface AgentPaneState {
	readonly agentId: string;
	readonly semanticState: AgentSemanticState;
	readonly summary: string;
	readonly highlightBuffer: string;
}

// domain-view: richer parse-don't-validate view over InferenceBudgetSnapshot wire form
export interface InferenceBudgetSnapshot {
	readonly provider: string;
	readonly spendUsd: number;
	readonly capUsd: number;
	/** Privacy-first monetization is opt-in only; default false. */
	readonly monetizationEnabled: boolean;
	readonly routingPolicy: string;
}

export interface LockedVisualArtifact {
	readonly id: string;
	readonly source: "openui";
	readonly lockedAt: string;
	readonly htmlPath: string;
	readonly immutable: true;
	readonly edits: readonly string[];
}

export interface ScaffoldResult {
	readonly templateId: string;
	readonly outputDir: string;
	readonly files: readonly string[];
	readonly openFeatureFlag: string;
	readonly gherkinFeature: string;
	readonly respectsKonsistent: true;
	readonly respectsGenerated: true;
}

export interface PlatformMatrixRow {
	readonly platform: string;
	readonly preferredBackend: IsolationKind;
	readonly fallback: IsolationKind;
	readonly cowCapable: boolean;
	readonly ciDefault: IsolationKind;
	readonly notes: string;
}
