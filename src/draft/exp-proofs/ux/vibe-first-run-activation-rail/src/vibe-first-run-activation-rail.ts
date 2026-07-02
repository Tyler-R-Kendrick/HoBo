export const ACTIVATION_RAIL_ENTRY_POINTS = [
  "app-developer",
  "team-admin",
  "platform-engineer",
  "support-operator",
] as const;

export const ACTIVATION_RAIL_STAGES = [
  "invite-or-try-it",
  "workspace",
  "project",
  "plan-preview",
  "launch-attempt",
  "recovery",
  "value-proof",
] as const;

export const ACTIVATION_RAIL_OUTCOMES = [
  "happy-path",
  "blocked-path",
  "stale-or-unknown-evidence",
  "support-handoff",
] as const;

export const ACTIVATION_RAIL_PROOF_MODES = [
  "live",
  "simulated",
  "reference-fixture",
  "scope-out",
] as const;

type ActivationRailEntryPoint = (typeof ACTIVATION_RAIL_ENTRY_POINTS)[number];
type ActivationRailStageName = (typeof ACTIVATION_RAIL_STAGES)[number];
type ActivationRailOutcomeKind = (typeof ACTIVATION_RAIL_OUTCOMES)[number];
type ActivationRailProofMode = (typeof ACTIVATION_RAIL_PROOF_MODES)[number];

export type ActivationRailWireframe = {
  readonly entryPoint: ActivationRailEntryPoint;
  readonly primaryQuestion: string;
  readonly visibleStates: readonly ActivationRailStageName[];
  readonly nextAction: string;
  readonly accessibilityNotes: readonly string[];
};

export type ActivationRailState = {
  readonly stage: ActivationRailStageName;
  readonly entryCondition: string;
  readonly exitCondition: string;
  readonly owner: string;
  readonly evidenceObject: string;
  readonly missingPrerequisiteBehavior: string;
  readonly proofMode: ActivationRailProofMode;
  readonly quickstartFixtureIds: readonly string[];
};

export type ActivationRailOutcome = {
  readonly kind: ActivationRailOutcomeKind;
  readonly title: string;
  readonly userMessage: string;
  readonly owner: string;
  readonly proofMode: ActivationRailProofMode;
  readonly quickstartFixtureIds: readonly string[];
};

export type ActivationRailProofModeLegend = {
  readonly proofMode: ActivationRailProofMode;
  readonly label: string;
  readonly meaning: string;
};

export type VibeFirstRunActivationRail = {
  readonly issue: "HOBO-540";
  readonly phase: "M1";
  readonly targetPackage: "src/draft/exp-proofs/ux/vibe-first-run-activation-rail";
  readonly proofNote: "docs/design/proofs/vibe-first-run-activation-rail/README.md";
  readonly designRefs: readonly string[];
  readonly scopeOut: readonly string[];
  readonly wireframes: readonly ActivationRailWireframe[];
  readonly stateModel: readonly ActivationRailState[];
  readonly outcomes: readonly ActivationRailOutcome[];
  readonly proofModeLegend: readonly ActivationRailProofModeLegend[];
  readonly __brand: "ParsedVibeFirstRunActivationRail";
};

type UnparsedVibeFirstRunActivationRail = Omit<VibeFirstRunActivationRail, "__brand">;

const requiredScopeOut = [
  "live provider calls",
  "production UI",
  "customer data",
  "real credentials",
  "launch claims without evidence",
] as const;

export const VIBE_FIRST_RUN_ACTIVATION_RAIL = {
  issue: "HOBO-540",
  phase: "M1",
  targetPackage: "src/draft/exp-proofs/ux/vibe-first-run-activation-rail",
  proofNote: "docs/design/proofs/vibe-first-run-activation-rail/README.md",
  designRefs: [
    "docs/design/workspace-onboarding-ux.md",
    "docs/design/outcome-activation-rail.md",
    "docs/design/proofs/resource-lifecycle-quickstart-examples/README.md",
  ],
  scopeOut: requiredScopeOut,
  wireframes: [
    {
      entryPoint: "app-developer",
      primaryQuestion: "What can I safely try first?",
      visibleStates: ["invite-or-try-it", "workspace", "plan-preview", "value-proof"],
      nextAction: "Open the fixture-backed quickstart and preview a simulated plan.",
      accessibilityNotes: ["Keyboard order follows rail stage order.", "State labels are text, not color-only."],
    },
    {
      entryPoint: "team-admin",
      primaryQuestion: "What must be ready before inviting the team?",
      visibleStates: ["workspace", "project", "plan-preview", "recovery"],
      nextAction: "Confirm workspace, project, and ownership prerequisites before invite expansion.",
      accessibilityNotes: ["Owner and blocker labels are exposed as headings.", "Action text avoids icon-only affordances."],
    },
    {
      entryPoint: "platform-engineer",
      primaryQuestion: "Which provider and policy prerequisites block the first plan?",
      visibleStates: ["project", "plan-preview", "launch-attempt", "recovery"],
      nextAction: "Inspect the Gatekeeper and provider-readiness evidence before launch simulation.",
      accessibilityNotes: ["Risk labels include plain-language summaries.", "Reduced-motion mode keeps the same state order."],
    },
    {
      entryPoint: "support-operator",
      primaryQuestion: "Where is the user stuck and who owns the next unblock?",
      visibleStates: ["plan-preview", "launch-attempt", "recovery", "value-proof"],
      nextAction: "Open the redacted support handoff with evidence id, owner, and safe wording.",
      accessibilityNotes: ["Support route is reachable without hover.", "Unknown evidence is announced as blocked, not success."],
    },
  ],
  stateModel: [
    {
      stage: "invite-or-try-it",
      entryCondition: "User has an invite link or anonymous try-it path.",
      exitCondition: "Persona and desired outcome are captured.",
      owner: "Workspace & Onboarding UX",
      evidenceObject: "activation.outcome",
      missingPrerequisiteBehavior: "Show access requirement and preserve anonymous fixture path.",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-define-object-graph-v1"],
    },
    {
      stage: "workspace",
      entryCondition: "Outcome is captured and workspace context is available.",
      exitCondition: "Workspace profile, tenant boundary, and admin owner are known.",
      owner: "Organization & Workspace Model",
      evidenceObject: "workspace.profile",
      missingPrerequisiteBehavior: "Keep rail blocked with owner route instead of implying workspace readiness.",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-define-object-graph-v1"],
    },
    {
      stage: "project",
      entryCondition: "Workspace is selected with permission to create or choose a project.",
      exitCondition: "Project, environment, and safe-test fixture are selected.",
      owner: "Settings & Project Lifecycle",
      evidenceObject: "project.context",
      missingPrerequisiteBehavior: "Route to project setup and keep deploy actions disabled.",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-collect-manifest-ir-v1"],
    },
    {
      stage: "plan-preview",
      entryCondition: "A collected manifest or accepted quickstart fixture exists.",
      exitCondition: "Plan, risk, policy disposition, and approval needs are visible.",
      owner: "Plan/Diff Viewer",
      evidenceObject: "deployment.plan",
      missingPrerequisiteBehavior: "Show missing manifest or unknown evidence as a blocked preview.",
      proofMode: "simulated",
      quickstartFixtureIds: ["rlq-plan-safe-preview-v1"],
    },
    {
      stage: "launch-attempt",
      entryCondition: "Plan preview has no unresolved blockers or unsupported live claims.",
      exitCondition: "Simulated launch status, rollback path, and guardrail outcomes are recorded.",
      owner: "Deployment Dashboard & Topology Explorer",
      evidenceObject: "deployment.status",
      missingPrerequisiteBehavior: "Disable live launch and show simulated-only proof mode.",
      proofMode: "simulated",
      quickstartFixtureIds: ["rlq-deploy-run-accepted-v1", "rlq-inspect-event-projection-v1"],
    },
    {
      stage: "recovery",
      entryCondition: "Plan, launch, or evidence state is blocked, stale, unknown, or failed.",
      exitCondition: "Safe next action, owning team, and support route are identified.",
      owner: "Support Workflow",
      evidenceObject: "support.handoff",
      missingPrerequisiteBehavior: "Create a support-safe handoff without exposing customer data.",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-manage-stale-evidence-v1", "rlq-recover-snapshot-restore-v1"],
    },
    {
      stage: "value-proof",
      entryCondition: "Simulated or fixture-backed outcome has inspectable evidence.",
      exitCondition: "User-facing proof, docs link, and follow-up owner are recorded.",
      owner: "Workspace & Onboarding UX",
      evidenceObject: "activation.value-proof",
      missingPrerequisiteBehavior: "Show evidence unavailable rather than a green success state.",
      proofMode: "scope-out",
      quickstartFixtureIds: ["rlq-recover-scope-out-v1"],
    },
  ],
  outcomes: [
    {
      kind: "happy-path",
      title: "Fixture plan reaches value proof",
      userMessage: "Your first proof is simulated and inspectable from the quickstart fixtures.",
      owner: "Workspace & Onboarding UX",
      proofMode: "simulated",
      quickstartFixtureIds: ["rlq-deploy-run-accepted-v1"],
    },
    {
      kind: "blocked-path",
      title: "Prerequisite blocks launch",
      userMessage: "Launch is blocked until the named owner resolves the prerequisite.",
      owner: "Plan/Diff Viewer",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-plan-safe-preview-v1"],
    },
    {
      kind: "stale-or-unknown-evidence",
      title: "Evidence is stale or unknown",
      userMessage: "The rail cannot mark success until fresh replay-derived evidence exists.",
      owner: "Deployment Dashboard & Topology Explorer",
      proofMode: "reference-fixture",
      quickstartFixtureIds: ["rlq-manage-stale-evidence-v1"],
    },
    {
      kind: "support-handoff",
      title: "Support-safe handoff",
      userMessage: "Support gets owner, evidence id, next action, and redaction state.",
      owner: "Support Workflow",
      proofMode: "live",
      quickstartFixtureIds: ["rlq-recover-snapshot-restore-v1"],
    },
  ],
  proofModeLegend: [
    {
      proofMode: "live",
      label: "Live-gated",
      meaning: "Names a future live handoff that remains gated by release, policy, and credential controls.",
    },
    {
      proofMode: "simulated",
      label: "Simulated",
      meaning: "Runs against mocked service boundaries and deterministic quickstart fixtures.",
    },
    {
      proofMode: "reference-fixture",
      label: "Reference fixture",
      meaning: "Reads checked-in fixture or transcript-equivalent evidence.",
    },
    {
      proofMode: "scope-out",
      label: "Scope-out",
      meaning: "Explicitly prevents downstream artifacts from making unsupported launch claims.",
    },
  ],
} as const satisfies UnparsedVibeFirstRunActivationRail;

export type ActivationRailScopeDecision =
  | { readonly allowed: true; readonly reason: "activation-rail-fixture" }
  | {
      readonly allowed: false;
      readonly reason:
        | "live-provider"
        | "production-ui"
        | "customer-data"
        | "real-credential"
        | "unsupported-launch-claim";
    };

export function classifyActivationRailScope(proposal: string): ActivationRailScopeDecision {
  const normalized = proposal.toLowerCase();
  if (/live provider|provider call|live cloud/.test(normalized)) {
    return { allowed: false, reason: "live-provider" };
  }
  if (/production ui|ship.*ui|dashboard implementation/.test(normalized)) {
    return { allowed: false, reason: "production-ui" };
  }
  if (/customer data|tenant data|real user/.test(normalized)) {
    return { allowed: false, reason: "customer-data" };
  }
  if (/real credential|live credential|secret|api key|token/.test(normalized)) {
    return { allowed: false, reason: "real-credential" };
  }
  if (/launch claim|claim without evidence|guarantee/.test(normalized)) {
    return { allowed: false, reason: "unsupported-launch-claim" };
  }
  return { allowed: true, reason: "activation-rail-fixture" };
}

export function parseVibeFirstRunActivationRail(value: unknown): VibeFirstRunActivationRail {
  assertObject(value, "activationRail");
  assertLiteral(value.issue, "HOBO-540", "issue");
  assertLiteral(value.phase, "M1", "phase");
  assertLiteral(
    value.targetPackage,
    "src/draft/exp-proofs/ux/vibe-first-run-activation-rail",
    "targetPackage",
  );
  assertLiteral(
    value.proofNote,
    "docs/design/proofs/vibe-first-run-activation-rail/README.md",
    "proofNote",
  );
  assertNonEmptyStringArray(value.designRefs, "designRefs");
  assertScopeOut(value.scopeOut);
  const wireframes = assertWireframes(value.wireframes);
  const stateModel = assertStateModel(value.stateModel);
  const outcomes = assertOutcomes(value.outcomes);
  assertProofModeLegend(value.proofModeLegend);
  assertWireframeCoverage(wireframes);
  assertStageCoverage(stateModel);
  assertOutcomeCoverage(outcomes);

  return {
    ...(value as UnparsedVibeFirstRunActivationRail),
    __brand: "ParsedVibeFirstRunActivationRail",
  };
}

export function summarizeActivationRailWireframes(
  rail: VibeFirstRunActivationRail,
): ReadonlyArray<{
  readonly entryPoint: ActivationRailEntryPoint;
  readonly primaryQuestion: string;
  readonly visibleStates: readonly ActivationRailStageName[];
  readonly nextAction: string;
  readonly accessibilityNotes: readonly string[];
}> {
  return rail.wireframes.map((wireframe) => ({
    entryPoint: wireframe.entryPoint,
    primaryQuestion: wireframe.primaryQuestion,
    visibleStates: wireframe.visibleStates,
    nextAction: wireframe.nextAction,
    accessibilityNotes: wireframe.accessibilityNotes,
  }));
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertLiteral<T extends string>(value: unknown, expected: T, name: string): asserts value is T {
  if (value !== expected) {
    throw new TypeError(`${name} must be ${expected}`);
  }
}

function assertStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${name} must be a string array`);
  }
  return value;
}

function assertNonEmptyStringArray(value: unknown, name: string): void {
  const entries = assertStringArray(value, name);
  if (entries.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function assertScopeOut(value: unknown): void {
  const entries = assertStringArray(value, "scopeOut");
  for (const expected of requiredScopeOut) {
    if (!entries.includes(expected)) {
      throw new TypeError(`scopeOut missing ${expected}`);
    }
  }
}

function assertWireframes(value: unknown): ActivationRailWireframe[] {
  if (!Array.isArray(value)) {
    throw new TypeError("wireframes must be an array");
  }
  return value.map((entry, index) => {
    assertObject(entry, `wireframe ${index}`);
    assertEntryPoint(entry.entryPoint);
    assertNonEmptyString(entry.primaryQuestion, `${entry.entryPoint}.primaryQuestion`);
    assertStageArray(entry.visibleStates, `${entry.entryPoint}.visibleStates`);
    assertNonEmptyString(entry.nextAction, `${entry.entryPoint}.nextAction`);
    assertNonEmptyStringArray(entry.accessibilityNotes, `${entry.entryPoint}.accessibilityNotes`);
    return entry as ActivationRailWireframe;
  });
}

function assertStateModel(value: unknown): ActivationRailState[] {
  if (!Array.isArray(value)) {
    throw new TypeError("stateModel must be an array");
  }
  return value.map((entry, index) => {
    assertObject(entry, `state ${index}`);
    assertStage(entry.stage);
    assertNonEmptyString(entry.entryCondition, `${entry.stage}.entryCondition`);
    assertNonEmptyString(entry.exitCondition, `${entry.stage}.exitCondition`);
    assertNonEmptyString(entry.owner, `${entry.stage}.owner`);
    assertEvidenceObject(entry.evidenceObject, `${entry.stage}.evidenceObject`);
    assertNonEmptyString(entry.missingPrerequisiteBehavior, `${entry.stage}.missingPrerequisiteBehavior`);
    assertProofMode(entry.proofMode);
    assertFixtureIds(entry.quickstartFixtureIds, `${entry.stage}.quickstartFixtureIds`);
    return entry as ActivationRailState;
  });
}

function assertOutcomes(value: unknown): ActivationRailOutcome[] {
  if (!Array.isArray(value)) {
    throw new TypeError("outcomes must be an array");
  }
  return value.map((entry, index) => {
    assertObject(entry, `outcome ${index}`);
    assertOutcomeKind(entry.kind);
    assertNonEmptyString(entry.title, `${entry.kind}.title`);
    assertNonEmptyString(entry.userMessage, `${entry.kind}.userMessage`);
    assertNonEmptyString(entry.owner, `${entry.kind}.owner`);
    assertProofMode(entry.proofMode);
    assertFixtureIds(entry.quickstartFixtureIds, `${entry.kind}.quickstartFixtureIds`);
    return entry as ActivationRailOutcome;
  });
}

function assertProofModeLegend(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new TypeError("proofModeLegend must be an array");
  }
  const modes = new Set<ActivationRailProofMode>();
  for (const [index, entry] of value.entries()) {
    assertObject(entry, `proofMode ${index}`);
    assertProofMode(entry.proofMode);
    assertNonEmptyString(entry.label, `${entry.proofMode}.label`);
    assertNonEmptyString(entry.meaning, `${entry.proofMode}.meaning`);
    modes.add(entry.proofMode);
  }
  for (const mode of ACTIVATION_RAIL_PROOF_MODES) {
    if (!modes.has(mode)) {
      throw new TypeError(`proofModeLegend missing ${mode}`);
    }
  }
}

function assertWireframeCoverage(wireframes: readonly ActivationRailWireframe[]): void {
  const entryPoints = wireframes.map((wireframe) => wireframe.entryPoint);
  for (const entryPoint of ACTIVATION_RAIL_ENTRY_POINTS) {
    if (!entryPoints.includes(entryPoint)) {
      throw new TypeError(`missing entry point ${entryPoint}`);
    }
  }
  if (new Set(entryPoints).size !== entryPoints.length) {
    throw new TypeError("entry points must be unique");
  }
}

function assertStageCoverage(stateModel: readonly ActivationRailState[]): void {
  const stages = stateModel.map((state) => state.stage);
  for (const stage of ACTIVATION_RAIL_STAGES) {
    if (!stages.includes(stage)) {
      throw new TypeError(`missing activation stage ${stage}`);
    }
  }
  if (new Set(stages).size !== stages.length) {
    throw new TypeError("activation stages must be unique");
  }
}

function assertOutcomeCoverage(outcomes: readonly ActivationRailOutcome[]): void {
  const kinds = outcomes.map((outcome) => outcome.kind);
  for (const kind of ACTIVATION_RAIL_OUTCOMES) {
    if (!kinds.includes(kind)) {
      throw new TypeError(`missing outcome ${kind}`);
    }
  }
  if (new Set(kinds).size !== kinds.length) {
    throw new TypeError("outcomes must be unique");
  }
}

function assertStageArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
  for (const stage of value) {
    assertStage(stage);
  }
}

function assertFixtureIds(value: unknown, name: string): void {
  const entries = assertStringArray(value, name);
  if (entries.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
  for (const entry of entries) {
    if (!/^rlq-[a-z0-9-]+-v[0-9]+$/.test(entry)) {
      throw new TypeError(`${name} contains invalid fixture id ${entry}`);
    }
  }
}

function assertEntryPoint(value: unknown): asserts value is ActivationRailEntryPoint {
  if (!ACTIVATION_RAIL_ENTRY_POINTS.includes(value as ActivationRailEntryPoint)) {
    throw new TypeError(`unknown entry point ${String(value)}`);
  }
}

function assertStage(value: unknown): asserts value is ActivationRailStageName {
  if (!ACTIVATION_RAIL_STAGES.includes(value as ActivationRailStageName)) {
    throw new TypeError(`unknown activation stage ${String(value)}`);
  }
}

function assertOutcomeKind(value: unknown): asserts value is ActivationRailOutcomeKind {
  if (!ACTIVATION_RAIL_OUTCOMES.includes(value as ActivationRailOutcomeKind)) {
    throw new TypeError(`unknown outcome ${String(value)}`);
  }
}

function assertProofMode(value: unknown): asserts value is ActivationRailProofMode {
  if (!ACTIVATION_RAIL_PROOF_MODES.includes(value as ActivationRailProofMode)) {
    throw new TypeError(`unsupported proof mode ${String(value)}`);
  }
}

function assertEvidenceObject(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z]+(\.[a-z-]+)+$/.test(value)) {
    throw new TypeError(`${name} must be a dotted evidence object`);
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}
