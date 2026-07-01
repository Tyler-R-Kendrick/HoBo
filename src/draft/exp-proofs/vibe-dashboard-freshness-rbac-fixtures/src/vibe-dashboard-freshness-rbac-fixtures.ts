export const REQUIRED_DASHBOARD_READ_STATES = [
  "fresh",
  "stale",
  "unavailable",
  "redacted",
  "unauthorized",
  "partial",
  "support-routed",
] as const;

export const REQUIRED_DASHBOARD_FIXTURE_FIELDS = [
  "projectionSource",
  "scope",
  "owner",
  "evidenceLink",
  "customerSafeWording",
  "nextAction",
] as const;

export type DashboardReadState = (typeof REQUIRED_DASHBOARD_READ_STATES)[number];
export type DashboardProofMode = "reference fixture";
export type ProjectionSource =
  | "DeploymentView"
  | "TopologyView"
  | "RunView"
  | "ProjectView"
  | "EnvironmentView"
  | "AvailabilityView"
  | "SupportHandoffView";

export interface DashboardFixtureScope {
  readonly tenantFirst: true;
  readonly tenant: string;
  readonly project: string;
  readonly environment: string;
  readonly rbacRole: string;
  readonly redactionState: "none" | "masked" | "denied";
}

export interface DashboardFixtureOwner {
  readonly actor: string;
  readonly initiative: "Deployment Dashboard & Topology Explorer";
}

export interface DashboardFixtureFreshness {
  readonly projectionSequence: number;
  readonly maxAgeSeconds: number;
  readonly observedAt: string;
}

export interface DashboardFixtureRedaction {
  readonly visibleFields: readonly string[];
  readonly withheldFields: readonly string[];
}

export interface DashboardReadStateFixture {
  readonly state: DashboardReadState;
  readonly fixtureId: string;
  readonly projectionSource: ProjectionSource;
  readonly scope: DashboardFixtureScope;
  readonly owner: DashboardFixtureOwner;
  readonly evidenceLink: `proof://hobo-545/${string}`;
  readonly customerSafeWording: string;
  readonly nextAction: string;
  readonly proofMode: DashboardProofMode;
  readonly correlationId: string;
  readonly status:
    | "current"
    | "stale"
    | "not available"
    | "redacted"
    | "access denied"
    | "partial"
    | "support routed";
  readonly freshness: DashboardFixtureFreshness;
  readonly redaction: DashboardFixtureRedaction;
}

export interface DashboardFreshnessRbacFixtureProof {
  readonly issue: "HOBO-545";
  readonly phase: "M1";
  readonly targetPackage: "src/draft/exp-proofs/vibe-dashboard-freshness-rbac-fixtures";
  readonly proofNote: "docs/design/proofs/vibe-dashboard-freshness-rbac-fixtures/README.md";
  readonly designRefs: readonly string[];
  readonly fixtures: readonly DashboardReadStateFixture[];
  readonly scopeOut: readonly string[];
}

export interface SupportHandoffPacket {
  readonly issue: "HOBO-545";
  readonly state: DashboardReadState;
  readonly correlationId: string;
  readonly ownerRoute: DashboardFixtureOwner;
  readonly customerSafeWording: string;
  readonly visibleFields: readonly string[];
  readonly withheldFields: readonly string[];
  readonly nextAction: string;
}

export type ScopeClassification =
  | { readonly allowed: true; readonly reason: "reference-fixture" }
  | {
      readonly allowed: false;
      readonly reason:
        | "authorization-engine"
        | "redaction-runtime"
        | "read-store-runtime"
        | "live-support-tooling"
        | "production-ui"
        | "launch-claim";
    };

const sharedScope = {
  tenantFirst: true,
  tenant: "tenant-acme",
  project: "project-checkout",
  environment: "preview",
  rbacRole: "platform-operator",
  redactionState: "none",
} as const;

const ownerInitiative = "Deployment Dashboard & Topology Explorer" as const;

const commonVisibleFields = [
  "tenant",
  "project",
  "environment",
  "rbacRole",
  "correlationId",
] as const;

const commonWithheldFields = [
  "rawProjectionPayload",
  "providerCredential",
  "customerSecret",
] as const;

export const VIBE_DASHBOARD_FRESHNESS_RBAC_FIXTURES = {
  issue: "HOBO-545",
  phase: "M1",
  targetPackage: "src/draft/exp-proofs/vibe-dashboard-freshness-rbac-fixtures",
  proofNote: "docs/design/proofs/vibe-dashboard-freshness-rbac-fixtures/README.md",
  designRefs: [
    "docs/design/deployment-dashboard-topology-explorer.md",
    "docs/design/data-plane.md#plan-32",
    "docs/design/adr/03-data-plane.md#adr-0050",
    "docs/design/adr/02-identity-security.md#adr-0077",
  ],
  fixtures: [
    {
      state: "fresh",
      fixtureId: "hobo-545-dashboard-fresh",
      projectionSource: "DeploymentView",
      scope: sharedScope,
      owner: {
        actor: "DeploymentProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/fresh",
      customerSafeWording:
        "Deployment projection is fresh at sequence 184. No customer payloads or provider credentials are included.",
      nextAction:
        "Render the current deployment status and keep the support handoff packet attached.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_fresh",
      status: "current",
      freshness: {
        projectionSequence: 184,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:20:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: commonWithheldFields,
      },
    },
    {
      state: "stale",
      fixtureId: "hobo-545-dashboard-stale",
      projectionSource: "TopologyView",
      scope: sharedScope,
      owner: {
        actor: "TopologyProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/stale",
      customerSafeWording:
        "Topology projection is stale and waiting on replay. No customer payloads or provider credentials are included.",
      nextAction:
        "Show the stale badge, pin the last accepted sequence, and route replay evidence to support.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_stale",
      status: "stale",
      freshness: {
        projectionSequence: 181,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:12:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: commonWithheldFields,
      },
    },
    {
      state: "unavailable",
      fixtureId: "hobo-545-dashboard-unavailable",
      projectionSource: "RunView",
      scope: sharedScope,
      owner: {
        actor: "RunProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/unavailable",
      customerSafeWording:
        "Run projection is unavailable while the read model recovers. No customer payloads or provider credentials are included.",
      nextAction:
        "Render the unavailable state with last-known-safe metadata and support owner route.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_unavailable",
      status: "not available",
      freshness: {
        projectionSequence: 0,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:18:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: commonWithheldFields,
      },
    },
    {
      state: "redacted",
      fixtureId: "hobo-545-dashboard-redacted",
      projectionSource: "ProjectView",
      scope: {
        ...sharedScope,
        redactionState: "masked",
      },
      owner: {
        actor: "ProjectProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/redacted",
      customerSafeWording:
        "Project projection is redacted for this role. No customer payloads or provider credentials are included.",
      nextAction:
        "Show only tenant, project, environment, and correlation id while withholding payload fields.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_redacted",
      status: "redacted",
      freshness: {
        projectionSequence: 184,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:20:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: [
          ...commonWithheldFields,
          "topologyResourceAttributes",
          "deploymentLogExcerpt",
        ],
      },
    },
    {
      state: "unauthorized",
      fixtureId: "hobo-545-dashboard-unauthorized",
      projectionSource: "EnvironmentView",
      scope: {
        ...sharedScope,
        rbacRole: "support-viewer",
        redactionState: "denied",
      },
      owner: {
        actor: "EnvironmentProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/unauthorized",
      customerSafeWording:
        "Environment projection is denied for this role. No customer payloads or provider credentials are included.",
      nextAction:
        "Render access-denied wording and hand off the correlation id to the owning support actor.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_unauthorized",
      status: "access denied",
      freshness: {
        projectionSequence: 184,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:20:00.000Z",
      },
      redaction: {
        visibleFields: ["tenant", "environment", "correlationId"],
        withheldFields: [
          ...commonWithheldFields,
          "project",
          "deploymentStatus",
          "topologyResourceAttributes",
        ],
      },
    },
    {
      state: "partial",
      fixtureId: "hobo-545-dashboard-partial",
      projectionSource: "AvailabilityView",
      scope: sharedScope,
      owner: {
        actor: "AvailabilityProjectionActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/partial",
      customerSafeWording:
        "Dashboard projection is partial until replay completes. No customer payloads or provider credentials are included.",
      nextAction:
        "Render available cards, mark missing cards as partial, and keep the support packet visible.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_partial",
      status: "partial",
      freshness: {
        projectionSequence: 183,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:19:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: commonWithheldFields,
      },
    },
    {
      state: "support-routed",
      fixtureId: "hobo-545-dashboard-support-routed",
      projectionSource: "SupportHandoffView",
      scope: sharedScope,
      owner: {
        actor: "SupportHandoffActor",
        initiative: ownerInitiative,
      },
      evidenceLink: "proof://hobo-545/support-routed",
      customerSafeWording:
        "Support handoff is routed with redacted evidence only. No customer payloads or provider credentials are included.",
      nextAction:
        "Attach the redacted packet to support context without creating a live ticket or SLA workflow.",
      proofMode: "reference fixture",
      correlationId: "cor_hobo_545_support",
      status: "support routed",
      freshness: {
        projectionSequence: 184,
        maxAgeSeconds: 60,
        observedAt: "2026-07-01T15:20:00.000Z",
      },
      redaction: {
        visibleFields: commonVisibleFields,
        withheldFields: [
          ...commonWithheldFields,
          "supportTicketBody",
          "customerContact",
        ],
      },
    },
  ],
  scopeOut: [
    "production dashboard frontend",
    "authorization engine",
    "redaction runtime",
    "projection/read-store runtime",
    "live support tooling",
    "launch claims",
  ],
} as const satisfies DashboardFreshnessRbacFixtureProof;

export function classifyDashboardFixtureScope(input: string): ScopeClassification {
  const normalized = input.toLowerCase();

  if (/\bauthori[sz]ation\b|\bauth engine\b/.test(normalized)) {
    return { allowed: false, reason: "authorization-engine" };
  }
  if (/\bredaction\b.*\bruntime\b|\bredaction runtime\b/.test(normalized)) {
    return { allowed: false, reason: "redaction-runtime" };
  }
  if (/\bread[- ]?store\b|\bprojection runtime\b/.test(normalized)) {
    return { allowed: false, reason: "read-store-runtime" };
  }
  if (/\blive support\b|\bsupport tooling\b|\bsla\b/.test(normalized)) {
    return { allowed: false, reason: "live-support-tooling" };
  }
  if (/\bproduction\b.*\b(ui|frontend|dashboard)\b|\bdashboard ui\b/.test(normalized)) {
    return { allowed: false, reason: "production-ui" };
  }
  if (/\blaunch\b|\bmarketing\b|\bclaim\b/.test(normalized)) {
    return { allowed: false, reason: "launch-claim" };
  }

  return { allowed: true, reason: "reference-fixture" };
}

export function parseDashboardFreshnessRbacFixtures(
  value: unknown,
): DashboardFreshnessRbacFixtureProof {
  const proof = expectRecord(value, "dashboard fixture proof");
  expectLiteral(proof.issue, "HOBO-545", "issue");
  expectLiteral(proof.phase, "M1", "phase");
  expectLiteral(
    proof.targetPackage,
    "src/draft/exp-proofs/vibe-dashboard-freshness-rbac-fixtures",
    "targetPackage",
  );
  expectLiteral(
    proof.proofNote,
    "docs/design/proofs/vibe-dashboard-freshness-rbac-fixtures/README.md",
    "proofNote",
  );

  const fixtures = expectArray(proof.fixtures, "fixtures");
  const states = fixtures.map((fixture) => expectFixture(fixture).state);
  assertSameStates(states);

  return value as DashboardFreshnessRbacFixtureProof;
}

export function renderDashboardFixtureSummary(
  fixture: DashboardReadStateFixture,
): string {
  return [
    `state: ${fixture.state}`,
    `projection: ${fixture.projectionSource}`,
    `tenant/project/environment: ${fixture.scope.tenant}/${fixture.scope.project}/${fixture.scope.environment}`,
    `status: ${fixture.status}`,
    `next action: ${fixture.nextAction}`,
    `proof mode: ${fixture.proofMode}`,
  ].join("\n");
}

export function renderSupportHandoffPacket(
  fixture: DashboardReadStateFixture,
): SupportHandoffPacket {
  return {
    issue: "HOBO-545",
    state: fixture.state,
    correlationId: fixture.correlationId,
    ownerRoute: fixture.owner,
    customerSafeWording: fixture.customerSafeWording,
    visibleFields: fixture.redaction.visibleFields,
    withheldFields: fixture.redaction.withheldFields,
    nextAction: fixture.nextAction,
  };
}

function expectFixture(value: unknown): DashboardReadStateFixture {
  const fixture = expectRecord(value, "fixture");
  const state = expectOneOf(
    fixture.state,
    REQUIRED_DASHBOARD_READ_STATES,
    "fixture.state",
  );
  expectString(fixture.fixtureId, `${state}.fixtureId`);
  const projectionSource = expectString(fixture.projectionSource, `${state}.projectionSource`);
  if (!projectionSource.endsWith("View")) {
    throw new TypeError(`${state} projectionSource must target a view projection`);
  }

  const scope = expectRecord(fixture.scope, `${state}.scope`);
  if (scope.tenantFirst !== true) {
    throw new TypeError(`${state} must preserve tenant-first scoping`);
  }
  expectString(scope.tenant, `${state}.scope.tenant`);
  expectString(scope.project, `${state}.scope.project`);
  expectString(scope.environment, `${state}.scope.environment`);
  expectString(scope.rbacRole, `${state}.scope.rbacRole`);

  const owner = expectRecord(fixture.owner, `${state}.owner`);
  expectString(owner.actor, `${state}.owner.actor`);
  expectLiteral(owner.initiative, ownerInitiative, `${state}.owner.initiative`);

  const evidenceLink = expectString(fixture.evidenceLink, `${state}.evidenceLink`);
  if (!evidenceLink.startsWith("proof://hobo-545/")) {
    throw new TypeError(`${state} evidenceLink must stay inside proof://hobo-545`);
  }
  expectString(fixture.customerSafeWording, `${state}.customerSafeWording`);
  expectString(fixture.nextAction, `${state}.nextAction`);
  expectLiteral(fixture.proofMode, "reference fixture", `${state}.proofMode`);
  expectString(fixture.correlationId, `${state}.correlationId`);

  const redaction = expectRecord(fixture.redaction, `${state}.redaction`);
  const visibleFields = expectArray(redaction.visibleFields, `${state}.redaction.visibleFields`);
  const withheldFields = expectArray(redaction.withheldFields, `${state}.redaction.withheldFields`);
  if (!visibleFields.includes("tenant") || !visibleFields.includes("correlationId")) {
    throw new TypeError(`${state} visible redaction evidence must include tenant and correlationId`);
  }
  if (!withheldFields.includes("rawProjectionPayload") || !withheldFields.includes("providerCredential")) {
    throw new TypeError(`${state} must include withheld redaction evidence`);
  }

  return fixture as DashboardReadStateFixture;
}

function assertSameStates(states: readonly string[]): void {
  const expected = REQUIRED_DASHBOARD_READ_STATES;
  if (states.length !== expected.length) {
    throw new TypeError("fixtures must cover every required dashboard read state");
  }
  for (const [index, state] of expected.entries()) {
    if (states[index] !== state) {
      throw new TypeError(`fixtures must keep read state order at ${state}`);
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

function expectLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
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
