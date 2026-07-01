import {
  VIBE_DEPLOYMENT_DASHBOARD_MOCKUPS,
  parseVibeDeploymentDashboardMockups,
} from "../../vibe-deployment-dashboard-mockups/src/vibe-deployment-dashboard-mockups.ts";
import {
  VIBE_DASHBOARD_FRESHNESS_RBAC_FIXTURES,
  parseDashboardFreshnessRbacFixtures,
  renderSupportHandoffPacket,
  type DashboardReadStateFixture,
} from "../../vibe-dashboard-freshness-rbac-fixtures/src/vibe-dashboard-freshness-rbac-fixtures.ts";

export const REQUIRED_TOPOLOGY_STATUS_SURFACES = [
  "deployment-timeline",
  "topology-graph",
  "run-inspector",
  "freshness-rbac-state",
  "support-handoff",
] as const;

export const REQUIRED_TOPOLOGY_STATUS_STATES = [
  "fresh",
  "stale",
  "unavailable",
  "redacted",
  "unauthorized",
  "partial",
  "failed",
  "rolled-back",
  "completed",
] as const;

export const REQUIRED_TOPOLOGY_STATUS_SCENARIOS = [
  "happy-path",
  "blocked-path",
  "stale-or-unknown-evidence",
  "support-handoff",
] as const;

export const REQUIRED_TOPOLOGY_STATUS_PROOF_MODES = [
  "live",
  "simulated",
  "reference fixture",
  "scope-out",
] as const;

type TopologyStatusSurfaceId = (typeof REQUIRED_TOPOLOGY_STATUS_SURFACES)[number];
type TopologyStatusState = (typeof REQUIRED_TOPOLOGY_STATUS_STATES)[number];
type TopologyStatusScenarioId = (typeof REQUIRED_TOPOLOGY_STATUS_SCENARIOS)[number];
type TopologyStatusProofMode = (typeof REQUIRED_TOPOLOGY_STATUS_PROOF_MODES)[number];
type SourceIssue = "HOBO-544" | "HOBO-545";

export type TopologyStatusRequestClassification =
  | { readonly allowed: true; readonly reason: "reference-prototype" }
  | {
      readonly allowed: false;
      readonly reason:
        | "production-dashboard"
        | "graph-renderer"
        | "projection-runtime"
        | "rbac-implementation"
        | "live-provider-traversal"
        | "launch-claim";
    };

export interface TopologyStatusSourceDependency {
  readonly issue: SourceIssue;
  readonly title: string;
  readonly status: "accepted";
  readonly evidence: string;
}

export interface TopologyStatusSurface {
  readonly id: TopologyStatusSurfaceId;
  readonly title: string;
  readonly consumesFrom: readonly SourceIssue[];
  readonly operatingQuestion: string;
}

export interface TopologyStatusSupportHandoff {
  readonly issue: "HOBO-561";
  readonly sourceIssue: SourceIssue;
  readonly correlationId: string;
  readonly customerSafeWording: string;
  readonly visibleFields: readonly string[];
  readonly withheldFields: readonly string[];
  readonly ownerRoute: string;
  readonly nextAction: string;
  readonly liveTicketCreated: false;
}

export interface TopologyStatusSnapshot {
  readonly state: TopologyStatusState;
  readonly surface: TopologyStatusSurfaceId;
  readonly sourceIssue: SourceIssue;
  readonly sourceFixtureId: string;
  readonly projectionSource: `${string}View`;
  readonly freshnessLabel: string;
  readonly tenantRbacDisposition: string;
  readonly safeNextAction: string;
  readonly proofMode: TopologyStatusProofMode;
  readonly supportHandoff?: TopologyStatusSupportHandoff;
}

export interface TopologyStatusScenario {
  readonly id: TopologyStatusScenarioId;
  readonly title: string;
  readonly snapshotStates: readonly TopologyStatusState[];
  readonly proofModeLabels: readonly TopologyStatusProofMode[];
  readonly safeOutcome: string;
}

export interface VibeTopologyStatusPrototype {
  readonly issue: "HOBO-561";
  readonly phase: "M2";
  readonly targetPackage: "src/draft/exp-proofs/vibe-topology-status-prototype";
  readonly proofNote: "docs/design/proofs/vibe-topology-status-prototype/README.md";
  readonly designRefs: readonly string[];
  readonly sourceDependencies: readonly TopologyStatusSourceDependency[];
  readonly surfaces: readonly TopologyStatusSurface[];
  readonly snapshots: readonly TopologyStatusSnapshot[];
  readonly scenarios: readonly TopologyStatusScenario[];
  readonly accessibilityNotes: readonly string[];
  readonly scopeOut: readonly string[];
}

function fixtureByState(state: DashboardReadStateFixture["state"]): DashboardReadStateFixture {
  const proof = parseDashboardFreshnessRbacFixtures(VIBE_DASHBOARD_FRESHNESS_RBAC_FIXTURES);
  const fixture = proof.fixtures.find((candidate) => candidate.state === state);
  if (!fixture) {
    throw new TypeError(`missing HOBO-545 fixture for ${state}`);
  }
  return fixture;
}

function supportHandoffFromFixture(fixture: DashboardReadStateFixture): TopologyStatusSupportHandoff {
  const packet = renderSupportHandoffPacket(fixture);

  return {
    issue: "HOBO-561",
    sourceIssue: "HOBO-545",
    correlationId: packet.correlationId,
    customerSafeWording: packet.customerSafeWording,
    visibleFields: packet.visibleFields,
    withheldFields: packet.withheldFields,
    ownerRoute: packet.ownerRoute.actor,
    nextAction: packet.nextAction,
    liveTicketCreated: false,
  };
}

function normalizeSafeNextAction(nextAction: string): string {
  return /\b(inspect|wait|route|rollback|review|handoff|escalate)\b/i.test(nextAction)
    ? nextAction
    : `review projection evidence: ${nextAction}`;
}

function snapshotFromFixture(
  fixture: DashboardReadStateFixture,
  state: TopologyStatusState = fixture.state as TopologyStatusState,
): TopologyStatusSnapshot {
  return {
    state,
    surface: state === "support-routed" ? "support-handoff" : "freshness-rbac-state",
    sourceIssue: "HOBO-545",
    sourceFixtureId: fixture.fixtureId,
    projectionSource: fixture.projectionSource,
    freshnessLabel: `${fixture.status}; seq=${fixture.freshness.projectionSequence}; maxAge=${fixture.freshness.maxAgeSeconds}s`,
    tenantRbacDisposition: `${fixture.scope.tenant}/${fixture.scope.project}/${fixture.scope.environment}; RBAC role ${fixture.scope.rbacRole}; redaction ${fixture.scope.redactionState}`,
    safeNextAction: normalizeSafeNextAction(fixture.nextAction),
    proofMode: fixture.proofMode,
    supportHandoff: supportHandoffFromFixture(fixture),
  };
}

const fresh = snapshotFromFixture(fixtureByState("fresh"));
const stale = snapshotFromFixture(fixtureByState("stale"));
const unavailable = snapshotFromFixture(fixtureByState("unavailable"));
const redacted = snapshotFromFixture(fixtureByState("redacted"));
const unauthorized = snapshotFromFixture(fixtureByState("unauthorized"));
const partial = snapshotFromFixture(fixtureByState("partial"));

export const VIBE_TOPOLOGY_STATUS_PROTOTYPE = {
  issue: "HOBO-561",
  phase: "M2",
  targetPackage: "src/draft/exp-proofs/vibe-topology-status-prototype",
  proofNote: "docs/design/proofs/vibe-topology-status-prototype/README.md",
  designRefs: [
    "docs/design/deployment-dashboard-topology-explorer.md",
    "docs/design/developer-experience.md#plan-07",
    "docs/design/data-plane.md#plan-32",
    "docs/design/proofs/vibe-deployment-dashboard-mockups/README.md",
    "docs/design/proofs/vibe-dashboard-freshness-rbac-fixtures/README.md",
  ],
  sourceDependencies: resolveTopologyStatusDependencies(),
  surfaces: [
    {
      id: "deployment-timeline",
      title: "Deployment timeline over accepted projection snapshots",
      consumesFrom: ["HOBO-544", "HOBO-545"],
      operatingQuestion:
        "What deployment state is current, failed, rolled back, or completed, and which event-backed snapshot proves it?",
    },
    {
      id: "topology-graph",
      title: "Topology graph status from projection-backed mockups",
      consumesFrom: ["HOBO-544", "HOBO-545"],
      operatingQuestion:
        "Which topology nodes and edges are visible, stale, unavailable, redacted, or scope-limited without live provider traversal?",
    },
    {
      id: "run-inspector",
      title: "Run inspector state from redacted replay and support fixtures",
      consumesFrom: ["HOBO-544", "HOBO-545"],
      operatingQuestion:
        "Which run, event, actor, and replay snapshot explain the deployment outcome for a developer or support operator?",
    },
    {
      id: "freshness-rbac-state",
      title: "Freshness and tenant/RBAC status strip",
      consumesFrom: ["HOBO-545"],
      operatingQuestion:
        "Can the surface disclose freshness, tenant-first scope, role disposition, and redaction without implementing RBAC?",
    },
    {
      id: "support-handoff",
      title: "Support-safe evidence handoff",
      consumesFrom: ["HOBO-544", "HOBO-545"],
      operatingQuestion:
        "What redacted packet can support use, and what stays withheld, without creating a live ticket or SLA promise?",
    },
  ],
  snapshots: [
    fresh,
    stale,
    unavailable,
    redacted,
    unauthorized,
    partial,
    {
      state: "failed",
      surface: "deployment-timeline",
      sourceIssue: "HOBO-544",
      sourceFixtureId: "health-cost-incident",
      projectionSource: "AvailabilityView",
      freshnessLabel: "unknown incident/cost rollup freshness; failure must not render green",
      tenantRbacDisposition:
        "tenant scoped showback; cost and incident details redacted outside project grants",
      safeNextAction: "escalate incident inc-41 and review can-deploy warning",
      proofMode: "live",
      supportHandoff: {
        issue: "HOBO-561",
        sourceIssue: "HOBO-544",
        correlationId: "cor_hobo_561_failed",
        customerSafeWording:
          "No customer payloads or provider credentials are included in the failed-state handoff.",
        visibleFields: ["tenant", "project", "environment", "correlationId", "state"],
        withheldFields: ["rawProjectionPayload", "providerCredential", "customerSecret"],
        ownerRoute: "SupportHandoffActor",
        nextAction: "escalate incident inc-41 and attach redacted projection evidence",
        liveTicketCreated: false,
      },
    },
    {
      state: "rolled-back",
      surface: "deployment-timeline",
      sourceIssue: "HOBO-544",
      sourceFixtureId: "rlq-recover-snapshot-restore-v1",
      projectionSource: "DeploymentView",
      freshnessLabel: "rollback represented by accepted quickstart recovery fixture",
      tenantRbacDisposition:
        "tenant scoped first; restore details stay fixture-backed and provider data stays withheld",
      safeNextAction: "review rollback event and handoff recovery evidence to support",
      proofMode: "simulated",
      supportHandoff: {
        issue: "HOBO-561",
        sourceIssue: "HOBO-544",
        correlationId: "cor_hobo_561_rollback",
        customerSafeWording:
          "No customer payloads or provider credentials are included in the rollback handoff.",
        visibleFields: ["tenant", "project", "environment", "correlationId", "state"],
        withheldFields: ["rawProjectionPayload", "providerCredential", "customerSecret"],
        ownerRoute: "DeploymentProjectionActor",
        nextAction: "handoff recovery event id and snapshot restore note",
        liveTicketCreated: false,
      },
    },
    {
      state: "completed",
      surface: "run-inspector",
      sourceIssue: "HOBO-544",
      sourceFixtureId: "deployment-state",
      projectionSource: "RunView",
      freshnessLabel: "reads-your-writes sequence accepted by deployment-state fixture",
      tenantRbacDisposition:
        "project grant required; event redaction profile controls run details",
      safeNextAction: "inspect run run-982 and continue release review",
      proofMode: "reference fixture",
      supportHandoff: {
        issue: "HOBO-561",
        sourceIssue: "HOBO-544",
        correlationId: "cor_hobo_561_completed",
        customerSafeWording:
          "No customer payloads or provider credentials are included in the completed-run packet.",
        visibleFields: ["tenant", "project", "environment", "correlationId", "state"],
        withheldFields: ["rawProjectionPayload", "providerCredential", "customerSecret"],
        ownerRoute: "RunProjectionActor",
        nextAction: "handoff support packet with event id evt-771 if needed",
        liveTicketCreated: false,
      },
    },
  ],
  scenarios: [
    {
      id: "happy-path",
      title: "Fresh and completed deployment review",
      snapshotStates: ["fresh", "completed"],
      proofModeLabels: ["reference fixture", "live"],
      safeOutcome: "render current state from snapshots and keep support handoff attached",
    },
    {
      id: "blocked-path",
      title: "RBAC, redaction, failure, and rollback guardrails",
      snapshotStates: ["redacted", "unauthorized", "failed", "rolled-back"],
      proofModeLabels: ["reference fixture", "live", "simulated", "scope-out"],
      safeOutcome:
        "show blocked or recovery states with owner route and no provider/customer payload leakage",
    },
    {
      id: "stale-or-unknown-evidence",
      title: "Stale, unavailable, and partial projection reads",
      snapshotStates: ["stale", "unavailable", "partial"],
      proofModeLabels: ["reference fixture", "simulated"],
      safeOutcome: "wait for projection replay or route support with known-safe fields only",
    },
    {
      id: "support-handoff",
      title: "Customer-safe handoff across every non-green state",
      snapshotStates: [
        "stale",
        "unavailable",
        "redacted",
        "unauthorized",
        "partial",
        "failed",
        "rolled-back",
      ],
      proofModeLabels: ["reference fixture", "live", "simulated", "scope-out"],
      safeOutcome: "produce redacted evidence packets without creating live support tooling",
    },
  ],
  accessibilityNotes: [
    "Keyboard order follows deployment timeline, topology graph, run inspector, freshness/RBAC strip, and support handoff regions.",
    "Screen reader labels announce projection source, freshness label, tenant/RBAC disposition, proof mode, and safe next action.",
    "Color is never the only signal; failed, rolled-back, stale, redacted, unauthorized, partial, and unavailable states carry text labels.",
    "Motion is optional; topology transitions and replay scrubbers must respect reduced-motion preferences.",
  ],
  scopeOut: [
    "No production dashboard frontend.",
    "No graph renderer.",
    "No projection runtime, read store, GraphQL facade, or subscription service.",
    "No tenant RBAC implementation.",
    "No live provider traversal.",
    "No launch claims without evidence.",
  ],
} as const satisfies VibeTopologyStatusPrototype;

export function resolveTopologyStatusDependencies(): readonly TopologyStatusSourceDependency[] {
  const dashboard = parseVibeDeploymentDashboardMockups(VIBE_DEPLOYMENT_DASHBOARD_MOCKUPS);
  const fixtures = parseDashboardFreshnessRbacFixtures(VIBE_DASHBOARD_FRESHNESS_RBAC_FIXTURES);

  return [
    {
      issue: "HOBO-544",
      title: "Vibe deployment dashboard mockups",
      status: "accepted",
      evidence: dashboard.packagePath,
    },
    {
      issue: "HOBO-545",
      title: "Vibe dashboard freshness/RBAC fixtures",
      status: "accepted",
      evidence: fixtures.targetPackage,
    },
  ];
}

export function parseVibeTopologyStatusPrototype(value: unknown): VibeTopologyStatusPrototype {
  const prototype = expectRecord(value, "topology/status prototype");
  expectLiteral(prototype.issue, "HOBO-561", "issue");
  expectLiteral(prototype.phase, "M2", "phase");
  expectLiteral(
    prototype.targetPackage,
    "src/draft/exp-proofs/vibe-topology-status-prototype",
    "targetPackage",
  );
  expectLiteral(
    prototype.proofNote,
    "docs/design/proofs/vibe-topology-status-prototype/README.md",
    "proofNote",
  );

  assertSourceDependencies(expectArray(prototype.sourceDependencies, "sourceDependencies"));
  assertSurfaces(expectArray(prototype.surfaces, "surfaces"));
  const snapshots = expectArray(prototype.snapshots, "snapshots").map(expectSnapshot);
  assertExactOrder(
    snapshots.map((snapshot) => snapshot.state),
    REQUIRED_TOPOLOGY_STATUS_STATES,
    "required snapshot state",
  );

  const scenarios = expectArray(prototype.scenarios, "scenarios").map(expectScenario);
  assertExactOrder(
    scenarios.map((scenario) => scenario.id),
    REQUIRED_TOPOLOGY_STATUS_SCENARIOS,
    "scenario",
  );
  assertScenarioCoverage(scenarios);
  assertAccessibility(expectStringArray(prototype.accessibilityNotes, "accessibilityNotes"));

  return value as VibeTopologyStatusPrototype;
}

export function renderTopologyStatusSnapshot(snapshot: TopologyStatusSnapshot): string {
  return [
    `state: ${snapshot.state}`,
    `surface: ${snapshot.surface}`,
    `source: ${snapshot.sourceIssue}/${snapshot.sourceFixtureId}`,
    `projection: ${snapshot.projectionSource}`,
    `freshness: ${snapshot.freshnessLabel}`,
    `tenant/RBAC: ${snapshot.tenantRbacDisposition}`,
    `next action: ${snapshot.safeNextAction}`,
    `proof mode: ${snapshot.proofMode}`,
  ].join("\n");
}

export function renderTopologyStatusSupportPacket(
  snapshot: TopologyStatusSnapshot,
): TopologyStatusSupportHandoff {
  if (!snapshot.supportHandoff) {
    throw new TypeError(`${snapshot.state} has no support handoff packet`);
  }
  return snapshot.supportHandoff;
}

export function classifyTopologyStatusRequest(input: string): TopologyStatusRequestClassification {
  const normalized = input.toLowerCase();
  if (/\bproduction\b.*\b(dashboard|frontend|ui)\b/.test(normalized)) {
    return { allowed: false, reason: "production-dashboard" };
  }
  if (/\b(graph renderer|render graph|topology renderer)\b/.test(normalized)) {
    return { allowed: false, reason: "graph-renderer" };
  }
  if (/\b(projection runtime|read[- ]?store|graphql facade|subscription)\b/.test(normalized)) {
    return { allowed: false, reason: "projection-runtime" };
  }
  if (/\b(rbac|authorization|policy)\b.*\b(enforce|implementation|engine)\b|\benforce tenant rbac\b/.test(normalized)) {
    return { allowed: false, reason: "rbac-implementation" };
  }
  if (/\blive provider\b|\bprovider traversal\b|\bcloud scan\b/.test(normalized)) {
    return { allowed: false, reason: "live-provider-traversal" };
  }
  if (/\blaunch\b|\bmarketing\b|\bclaim\b/.test(normalized)) {
    return { allowed: false, reason: "launch-claim" };
  }
  return { allowed: true, reason: "reference-prototype" };
}

function assertSourceDependencies(values: readonly unknown[]): void {
  const dependencies = values.map((value) => {
    const dependency = expectRecord(value, "source dependency");
    return {
      issue: expectOneOf(dependency.issue, ["HOBO-544", "HOBO-545"] as const, "source dependency issue"),
      status: expectLiteral(dependency.status, "accepted", "source dependency status"),
      evidence: expectString(dependency.evidence, "source dependency evidence"),
    };
  });
  assertExactOrder(
    dependencies.map((dependency) => dependency.issue),
    ["HOBO-544", "HOBO-545"] as const,
    "source dependency",
  );
}

function assertSurfaces(values: readonly unknown[]): void {
  const surfaces = values.map((value) => {
    const surface = expectRecord(value, "surface");
    expectString(surface.title, "surface title");
    expectString(surface.operatingQuestion, "surface operatingQuestion");
    const consumesFrom = expectStringArray(surface.consumesFrom, "surface consumesFrom");
    if (!consumesFrom.includes("HOBO-544") && !consumesFrom.includes("HOBO-545")) {
      throw new TypeError("surface must consume an upstream proof");
    }
    return expectOneOf(surface.id, REQUIRED_TOPOLOGY_STATUS_SURFACES, "surface id");
  });
  assertExactOrder(surfaces, REQUIRED_TOPOLOGY_STATUS_SURFACES, "surface");
}

function expectSnapshot(value: unknown): TopologyStatusSnapshot {
  const snapshot = expectRecord(value, "snapshot");
  const state = expectOneOf(snapshot.state, REQUIRED_TOPOLOGY_STATUS_STATES, "snapshot state");
  expectOneOf(snapshot.surface, REQUIRED_TOPOLOGY_STATUS_SURFACES, `${state}.surface`);
  expectOneOf(snapshot.sourceIssue, ["HOBO-544", "HOBO-545"] as const, `${state}.sourceIssue`);
  expectString(snapshot.sourceFixtureId, `${state}.sourceFixtureId`);
  const projectionSource = expectString(snapshot.projectionSource, `${state}.projectionSource`);
  if (!projectionSource.endsWith("View")) {
    throw new TypeError(`${state} projectionSource must target a view`);
  }
  expectString(snapshot.freshnessLabel, `${state}.freshnessLabel`);
  expectString(snapshot.tenantRbacDisposition, `${state}.tenantRbacDisposition`);
  expectString(snapshot.safeNextAction, `${state}.safeNextAction`);
  expectOneOf(snapshot.proofMode, REQUIRED_TOPOLOGY_STATUS_PROOF_MODES, `${state}.proofMode`);

  if ("supportHandoff" in snapshot && snapshot.supportHandoff !== undefined) {
    expectSupportHandoff(snapshot.supportHandoff, `${state}.supportHandoff`);
  }

  return snapshot as TopologyStatusSnapshot;
}

function expectSupportHandoff(value: unknown, label: string): TopologyStatusSupportHandoff {
  const packet = expectRecord(value, label);
  expectLiteral(packet.issue, "HOBO-561", `${label}.issue`);
  expectOneOf(packet.sourceIssue, ["HOBO-544", "HOBO-545"] as const, `${label}.sourceIssue`);
  expectString(packet.correlationId, `${label}.correlationId`);
  expectString(packet.customerSafeWording, `${label}.customerSafeWording`);
  const visibleFields = expectStringArray(packet.visibleFields, `${label}.visibleFields`);
  const withheldFields = expectStringArray(packet.withheldFields, `${label}.withheldFields`);
  if (!visibleFields.includes("correlationId")) {
    throw new TypeError(`${label} visibleFields must include correlationId`);
  }
  if (!withheldFields.includes("rawProjectionPayload") || !withheldFields.includes("providerCredential")) {
    throw new TypeError(`${label} withheldFields must include raw projection payload and provider credential`);
  }
  expectString(packet.ownerRoute, `${label}.ownerRoute`);
  expectString(packet.nextAction, `${label}.nextAction`);
  if (packet.liveTicketCreated !== false) {
    throw new TypeError(`${label} must not create live support tickets`);
  }
  return packet as TopologyStatusSupportHandoff;
}

function expectScenario(value: unknown): TopologyStatusScenario {
  const scenario = expectRecord(value, "scenario");
  const id = expectOneOf(scenario.id, REQUIRED_TOPOLOGY_STATUS_SCENARIOS, "scenario id");
  expectString(scenario.title, `${id}.title`);
  const snapshotStates = expectStringArray(scenario.snapshotStates, `${id}.snapshotStates`);
  if (snapshotStates.length === 0) {
    throw new TypeError(`${id} must reference at least one snapshot state`);
  }
  for (const state of snapshotStates) {
    expectOneOf(state, REQUIRED_TOPOLOGY_STATUS_STATES, `${id}.snapshotStates`);
  }
  const proofModeLabels = expectStringArray(scenario.proofModeLabels, `${id}.proofModeLabels`);
  if (proofModeLabels.length === 0) {
    throw new TypeError(`${id} must carry proof-mode labels`);
  }
  for (const proofMode of proofModeLabels) {
    expectOneOf(proofMode, REQUIRED_TOPOLOGY_STATUS_PROOF_MODES, `${id}.proofModeLabels`);
  }
  expectString(scenario.safeOutcome, `${id}.safeOutcome`);
  return scenario as TopologyStatusScenario;
}

function assertScenarioCoverage(scenarios: readonly TopologyStatusScenario[]): void {
  const states = new Set(scenarios.flatMap((scenario) => scenario.snapshotStates));
  for (const requiredState of REQUIRED_TOPOLOGY_STATUS_STATES) {
    if (!states.has(requiredState)) {
      throw new TypeError(`required snapshot state ${requiredState} has no scenario coverage`);
    }
  }

  const modes = new Set(scenarios.flatMap((scenario) => scenario.proofModeLabels));
  for (const requiredMode of REQUIRED_TOPOLOGY_STATUS_PROOF_MODES) {
    if (!modes.has(requiredMode)) {
      throw new TypeError(`required proof mode ${requiredMode} has no scenario coverage`);
    }
  }
}

function assertAccessibility(notes: readonly string[]): void {
  const joined = notes.join(" ").toLowerCase();
  for (const required of ["keyboard", "screen reader", "color", "motion"]) {
    if (!joined.includes(required)) {
      throw new TypeError(`accessibility notes must include ${required}`);
    }
  }
}

function assertExactOrder<T extends string>(
  actual: readonly string[],
  expected: readonly T[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new TypeError(`${label} set has wrong length`);
  }
  for (const [index, expectedValue] of expected.entries()) {
    if (actual[index] !== expectedValue) {
      throw new TypeError(`${label} order mismatch at ${expectedValue}`);
    }
  }
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function expectStringArray(value: unknown, label: string): readonly string[] {
  const values = expectArray(value, label);
  for (const [index, item] of values.entries()) {
    expectString(item, `${label}[${index}]`);
  }
  return values as readonly string[];
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new TypeError(`${label} must be ${expected}`);
  }
  return expected;
}

function expectOneOf<T extends readonly string[]>(
  value: unknown,
  expected: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !expected.includes(value)) {
    throw new TypeError(`${label} must be one of ${expected.join(", ")}`);
  }
  return value;
}
