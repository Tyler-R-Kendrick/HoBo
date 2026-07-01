export const REQUIRED_OPERATIONS = [
  "plan",
  "apply-up",
  "inspect-run",
  "tail-logs",
  "import-adopt",
  "migrate",
  "rollback",
  "support-evidence-pack",
] as const;

export const REQUIRED_BOUNDARY_CASES = [
  "policy-denied",
  "contract-incompatible",
  "provider-capability-partial",
  "provider-capability-none",
  "stale-projection",
  "unknown-evidence",
  "non-reactive-sink",
  "destructive-migration-blocked",
] as const;

type OperationId = (typeof REQUIRED_OPERATIONS)[number];
type BoundaryCase = (typeof REQUIRED_BOUNDARY_CASES)[number];

export type ProofMode = "reference-fixture" | "contract-fixture" | "projection-snapshot" | "support-safe-evidence";
export type RedactionClass = "public" | "tenant-safe" | "support-redacted";

export type ControlPlaneOperationShape = {
  readonly id: OperationId;
  readonly humanName: string;
  readonly cliCommand: string;
  readonly apiEndpoint: `/${string}`;
  readonly mcpTool: `hobo_${string}`;
  readonly requestShape: readonly string[];
  readonly responseShape: readonly string[];
  readonly domainTerms: readonly string[];
  readonly sharedResultEnvelope: true;
  readonly fixtureId: string;
};

export type ControlPlaneRefusalEnvelope = {
  readonly code: BoundaryCase;
  readonly trigger: string;
  readonly remediation: string;
  readonly proofMode: ProofMode;
  readonly fixtureId: string;
  readonly redactionClass: RedactionClass;
};

export type ControlPlaneContractFixtures = {
  readonly protobuf: "architecture/control_plane_api_resource_lifecycle_shapes.proto";
  readonly cue: "architecture/control_plane_api_resource_lifecycle_shapes.cue";
  readonly pact: "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json";
};

export type ControlPlaneApiResourceLifecycleShapes = {
  readonly issue: "HOBO-569";
  readonly phase: "M1";
  readonly targetPackage: "src/draft/exp-proofs/control-plane-api-resource-lifecycle-shapes";
  readonly proofNote: "docs/design/proofs/control-plane-api-resource-lifecycle-shapes/README.md";
  readonly designRefs: readonly string[];
  readonly operations: readonly ControlPlaneOperationShape[];
  readonly refusalEnvelopes: readonly ControlPlaneRefusalEnvelope[];
  readonly contractFixtures: ControlPlaneContractFixtures;
  readonly scopeOut: readonly string[];
  readonly __brand: "ParsedControlPlaneApiResourceLifecycleShapes";
};

type UnparsedControlPlaneApiResourceLifecycleShapes = Omit<
  ControlPlaneApiResourceLifecycleShapes,
  "__brand"
>;

const commonResultFields = [
  "status",
  "proofMode",
  "fixtureId",
  "correlationId",
  "redactionClass",
  "warnings",
  "refusal",
] as const;

export const CONTROL_PLANE_API_RESOURCE_LIFECYCLE_SHAPES = {
  issue: "HOBO-569",
  phase: "M1",
  targetPackage: "src/draft/exp-proofs/control-plane-api-resource-lifecycle-shapes",
  proofNote: "docs/design/proofs/control-plane-api-resource-lifecycle-shapes/README.md",
  designRefs: [
    "docs/design/control-plane.md#plan-04",
    "docs/design/developer-experience.md#plan-07",
    "docs/design/cli-spec.md",
    "docs/design/platform-engineering.md#plan-25",
    "docs/design/authoring-resources-wiring.md#plan-21",
    "docs/design/contracts-policy-flags.md#plan-29",
    "docs/design/data-plane.md#plan-11",
    "docs/design/upgrade-migration-engine.md",
    "docs/design/adr/03-data-plane.md#adr-0014",
    "docs/design/adr/02-identity-security.md#adr-0015",
  ],
  operations: [
    {
      id: "plan",
      humanName: "Build a DeploymentPlan without mutation",
      cliCommand: "hobo plan --camp preview --json",
      apiEndpoint: "/control-plane/plan",
      mcpTool: "hobo_plan",
      requestShape: ["manifestRef", "campRef", "objective", "requestedBy", "proofMode"],
      responseShape: ["DeploymentPlan", "PlanWarning[]", ...commonResultFields],
      domainTerms: ["DeploymentPlan", "ResourcePlan", "Gatekeeper", "match.Decided"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.plan.preview.success",
    },
    {
      id: "apply-up",
      humanName: "Apply an accepted plan into a Deployment Set Delta",
      cliCommand: "hobo up --camp preview --json",
      apiEndpoint: "/control-plane/apply",
      mcpTool: "hobo_up",
      requestShape: ["deploymentPlanId", "approvalRef", "campRef", "expectedSetId", "dryRun"],
      responseShape: ["DeploymentSet", "Delta", "ResourceActorEvent[]", ...commonResultFields],
      domainTerms: ["Deployment Set", "Delta", "ResourceActor", "deployment.Planned"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.apply.preview.accepted",
    },
    {
      id: "inspect-run",
      humanName: "Read run, deploy, and topology projections",
      cliCommand: "hobo inspect run --last --json",
      apiEndpoint: "/control-plane/inspect/run",
      mcpTool: "hobo_inspect_run",
      requestShape: ["runId", "campRef", "projectionSeq", "freshnessBound", "redactionClass"],
      responseShape: ["RunProjection", "ResourceActorTimeline", "freshness", ...commonResultFields],
      domainTerms: ["ResourceActor", "projection.Lagged", "materialized view", "snapshot"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.inspect.run.fresh",
    },
    {
      id: "tail-logs",
      humanName: "Read support-safe log slices by cursor",
      cliCommand: "hobo logs --follow api --json",
      apiEndpoint: "/control-plane/logs/tail",
      mcpTool: "hobo_tail_logs",
      requestShape: ["resourceId", "cursor", "since", "redactionClass", "limit"],
      responseShape: ["LogSlice", "nextCursor", "redactionSummary", ...commonResultFields],
      domainTerms: ["support-safe evidence", "read store", "projection", "ResourceActor"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.logs.api.support-safe",
    },
    {
      id: "import-adopt",
      humanName: "Preview brownfield import and adopted-resource posture",
      cliCommand: "hobo import terraform ./infra --dry-run --json",
      apiEndpoint: "/control-plane/import/adopt",
      mcpTool: "hobo_import_terraform",
      requestShape: ["sourceKind", "stateDigest", "adoptionPolicy", "campRef", "dryRun"],
      responseShape: ["AdoptionPlan", "ExternalResource[]", "migrationPreview", ...commonResultFields],
      domainTerms: ["resource.Adopted", "authoritative-external", "echo driver", "migration.*"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.import.terraform.adopted",
    },
    {
      id: "migrate",
      humanName: "Plan expand, backfill, contract, and cutover phases",
      cliCommand: "hobo migrate --dry-run --json",
      apiEndpoint: "/control-plane/migrate/dry-run",
      mcpTool: "hobo_migrate_dry_run",
      requestShape: ["currentVersion", "targetVersion", "schemaDigest", "snapshotRef", "campRef"],
      responseShape: ["MigrationPlan", "Phase[]", "blockedReason", "rollbackEvidence", ...commonResultFields],
      domainTerms: ["migration.Planned", "migration.PhaseApplied", "expand", "backfill", "contract"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.migrate.expand-backfill-contract",
    },
    {
      id: "rollback",
      humanName: "Return to a prior immutable Deployment Set",
      cliCommand: "hobo up --camp prod --rollback deployment-set:previous --json",
      apiEndpoint: "/control-plane/rollback",
      mcpTool: "hobo_rollback",
      requestShape: ["currentSetId", "targetSetId", "rollbackReason", "snapshotRef", "approvalRef"],
      responseShape: ["RollbackPlan", "Delta", "restoreRequirement", ...commonResultFields],
      domainTerms: ["Deployment Set", "Delta", "migration.RolledBack", "snapshot"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.rollback.previous-set",
    },
    {
      id: "support-evidence-pack",
      humanName: "Assemble redacted support evidence for a run or resource",
      cliCommand: "hobo doctor --support-bundle run:latest --json",
      apiEndpoint: "/control-plane/support/evidence-pack",
      mcpTool: "hobo_support_evidence_pack",
      requestShape: ["subjectRef", "evidenceKinds", "redactionClass", "supportRoute", "correlationId"],
      responseShape: ["EvidencePack", "ownerRoute", "redactionSummary", ...commonResultFields],
      domainTerms: ["support handoff", "CredentialAudit", "event-store", "read store"],
      sharedResultEnvelope: true,
      fixtureId: "fixture.support.evidence.redacted",
    },
  ],
  refusalEnvelopes: [
    {
      code: "policy-denied",
      trigger: "Gatekeeper policy plane returns deny for a requested apply.",
      remediation: "Change the plan, request approval, or select a permitted Camp.",
      proofMode: "contract-fixture",
      fixtureId: "fixture.refusal.policy-denied",
      redactionClass: "tenant-safe",
    },
    {
      code: "contract-incompatible",
      trigger: "Contract plane finds a running consumer incompatible with the proposed Delta.",
      remediation: "Dual-publish or upgrade the consumer before applying the contract phase.",
      proofMode: "contract-fixture",
      fixtureId: "fixture.refusal.contract-incompatible",
      redactionClass: "public",
    },
    {
      code: "provider-capability-partial",
      trigger: "Provider capability satisfies prefer but loses a requested soft objective.",
      remediation: "Accept the degraded plan warning or choose a provider with full support.",
      proofMode: "reference-fixture",
      fixtureId: "fixture.refusal.provider-partial",
      redactionClass: "public",
    },
    {
      code: "provider-capability-none",
      trigger: "No registered provider satisfies a required capability.",
      remediation: "Register a provider or remove the hard require.",
      proofMode: "reference-fixture",
      fixtureId: "fixture.refusal.provider-none",
      redactionClass: "public",
    },
    {
      code: "stale-projection",
      trigger: "Inspect reads a projection beyond the freshness bound.",
      remediation: "Refresh/replay the projection or re-run plan before apply.",
      proofMode: "projection-snapshot",
      fixtureId: "fixture.refusal.stale-projection",
      redactionClass: "tenant-safe",
    },
    {
      code: "unknown-evidence",
      trigger: "A plan references an evidence digest not present in the read store.",
      remediation: "Attach accepted evidence or downgrade the claim to unknown.",
      proofMode: "support-safe-evidence",
      fixtureId: "fixture.refusal.unknown-evidence",
      redactionClass: "support-redacted",
    },
    {
      code: "non-reactive-sink",
      trigger: "A projection sink cannot satisfy live inspect/log subscription semantics.",
      remediation: "Expose a snapshot-only result or bind a reactive sink provider.",
      proofMode: "projection-snapshot",
      fixtureId: "fixture.refusal.non-reactive-sink",
      redactionClass: "public",
    },
    {
      code: "destructive-migration-blocked",
      trigger: "A contract/drop phase would break a still-running app version.",
      remediation: "Complete expand/backfill, deploy compatible app version, then retry contract.",
      proofMode: "contract-fixture",
      fixtureId: "fixture.refusal.destructive-migration-blocked",
      redactionClass: "tenant-safe",
    },
  ],
  contractFixtures: {
    protobuf: "architecture/control_plane_api_resource_lifecycle_shapes.proto",
    cue: "architecture/control_plane_api_resource_lifecycle_shapes.cue",
    pact: "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json",
  },
  scopeOut: [
    "No production REST server, CLI parser, SDK package, MCP server, persistence layer, or dashboard is implemented.",
    "No live provider calls, cloud accounts, customer data, real credentials, or live support systems are used.",
    "No endpoint may bypass Planner, Gatekeeper, ResourceActor, event-store, materialized-view, snapshot, or read-store boundaries.",
  ],
} as const satisfies UnparsedControlPlaneApiResourceLifecycleShapes;

export type ControlPlaneApiScopeDecision =
  | { readonly allowed: true; readonly reason: "fixture-contract" }
  | {
      readonly allowed: false;
      readonly reason:
        | "production-api-implementation"
        | "real-persistence"
        | "live-provider-or-credential"
        | "planner-gatekeeper-bypass";
    };

export function classifyControlPlaneApiScope(proposal: string): ControlPlaneApiScopeDecision {
  const normalized = proposal.toLowerCase();

  if (/production.*(rest|api|server|cli|sdk|mcp|implementation)|build.*production/.test(normalized)) {
    return { allowed: false, reason: "production-api-implementation" };
  }

  if (/persist.*real|live database|real database|write.*database|stored procedure/.test(normalized)) {
    return { allowed: false, reason: "real-persistence" };
  }

  if (/live provider|real credential|aws|azure|gcp|secret|cloud account/.test(normalized)) {
    return { allowed: false, reason: "live-provider-or-credential" };
  }

  if (/bypass.*(planner|gatekeeper)|without.*(planner|gatekeeper)|skip.*(planner|gatekeeper)/.test(normalized)) {
    return { allowed: false, reason: "planner-gatekeeper-bypass" };
  }

  return { allowed: true, reason: "fixture-contract" };
}

export function parseControlPlaneApiResourceLifecycleShapes(
  contract: unknown,
): ControlPlaneApiResourceLifecycleShapes {
  assertObject(contract, "contract");
  assertLiteral(contract.issue, "HOBO-569", "issue");
  assertLiteral(contract.phase, "M1", "phase");
  assertLiteral(
    contract.targetPackage,
    "src/draft/exp-proofs/control-plane-api-resource-lifecycle-shapes",
    "targetPackage",
  );
  assertLiteral(
    contract.proofNote,
    "docs/design/proofs/control-plane-api-resource-lifecycle-shapes/README.md",
    "proofNote",
  );
  assertNonEmptyStringArray(contract.designRefs, "designRefs");
  assertNonEmptyStringArray(contract.scopeOut, "scopeOut");

  const operations = assertOperationArray(contract.operations);
  const refusals = assertRefusalArray(contract.refusalEnvelopes);
  assertRequiredOperations(operations);
  assertRequiredBoundaryCases(refusals);
  assertContractFixtures(contract.contractFixtures);

  return {
    ...(contract as UnparsedControlPlaneApiResourceLifecycleShapes),
    __brand: "ParsedControlPlaneApiResourceLifecycleShapes",
  };
}

export function summarizeOperationParity(contract: ControlPlaneApiResourceLifecycleShapes): ReadonlyArray<{
  readonly operation: OperationId;
  readonly apiEndpoint: `/${string}`;
  readonly mcpTool: `hobo_${string}`;
  readonly sharedResultEnvelope: true;
}> {
  return contract.operations.map((operation) => ({
    operation: operation.id,
    apiEndpoint: operation.apiEndpoint,
    mcpTool: operation.mcpTool,
    sharedResultEnvelope: operation.sharedResultEnvelope,
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

function assertOperationArray(value: unknown): ControlPlaneOperationShape[] {
  if (!Array.isArray(value)) {
    throw new TypeError("operations must be an array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `operation ${index}`);
    assertRequiredOperation(entry.id);
    assertNonEmptyStringArray(entry.requestShape, `${entry.id}.requestShape`);
    assertNonEmptyStringArray(entry.responseShape, `${entry.id}.responseShape`);
    assertNonEmptyStringArray(entry.domainTerms, `${entry.id}.domainTerms`);

    for (const field of ["humanName", "cliCommand", "fixtureId"] as const) {
      if (typeof entry[field] !== "string" || entry[field].length === 0) {
        throw new TypeError(`${entry.id}.${field} must not be empty`);
      }
    }
    if (typeof entry.apiEndpoint !== "string" || !entry.apiEndpoint.startsWith("/")) {
      throw new TypeError(`${entry.id}.apiEndpoint must start with /`);
    }
    if (typeof entry.mcpTool !== "string" || !entry.mcpTool.startsWith("hobo_")) {
      throw new TypeError(`${entry.id}.mcpTool must start with hobo_`);
    }
    if (entry.sharedResultEnvelope !== true) {
      throw new TypeError(`${entry.id}.sharedResultEnvelope must be true`);
    }

    return entry as ControlPlaneOperationShape;
  });
}

function assertRefusalArray(value: unknown): ControlPlaneRefusalEnvelope[] {
  if (!Array.isArray(value)) {
    throw new TypeError("refusalEnvelopes must be an array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `refusal ${index}`);
    assertRequiredBoundaryCase(entry.code);
    for (const field of ["trigger", "remediation", "fixtureId", "redactionClass"] as const) {
      if (typeof entry[field] !== "string" || entry[field].length === 0) {
        throw new TypeError(`${entry.code}.${field} must not be empty`);
      }
    }
    if (!isProofMode(entry.proofMode)) {
      throw new TypeError(`${entry.code}.proofMode is not supported`);
    }

    return entry as ControlPlaneRefusalEnvelope;
  });
}

function assertRequiredOperation(value: unknown): asserts value is OperationId {
  if (!REQUIRED_OPERATIONS.includes(value as OperationId)) {
    throw new TypeError(`unknown operation ${String(value)}`);
  }
}

function assertRequiredBoundaryCase(value: unknown): asserts value is BoundaryCase {
  if (!REQUIRED_BOUNDARY_CASES.includes(value as BoundaryCase)) {
    throw new TypeError(`unknown boundary case ${String(value)}`);
  }
}

function assertRequiredOperations(operations: readonly ControlPlaneOperationShape[]): void {
  const ids = operations.map((operation) => operation.id);

  for (const operation of REQUIRED_OPERATIONS) {
    if (!ids.includes(operation)) {
      throw new TypeError(`missing operation ${operation}`);
    }
  }
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("operations must be unique");
  }
}

function assertRequiredBoundaryCases(refusals: readonly ControlPlaneRefusalEnvelope[]): void {
  const codes = refusals.map((refusal) => refusal.code);

  for (const code of REQUIRED_BOUNDARY_CASES) {
    if (!codes.includes(code)) {
      throw new TypeError(`missing boundary case ${code}`);
    }
  }
}

function assertContractFixtures(value: unknown): asserts value is ControlPlaneContractFixtures {
  assertObject(value, "contractFixtures");
  assertLiteral(value.protobuf, "architecture/control_plane_api_resource_lifecycle_shapes.proto", "protobuf");
  assertLiteral(value.cue, "architecture/control_plane_api_resource_lifecycle_shapes.cue", "cue");
  assertLiteral(value.pact, "architecture/pacts/control_plane_api_resource_lifecycle_shapes.pact.json", "pact");
}

function isProofMode(value: unknown): value is ProofMode {
  return (
    value === "reference-fixture" ||
    value === "contract-fixture" ||
    value === "projection-snapshot" ||
    value === "support-safe-evidence"
  );
}
