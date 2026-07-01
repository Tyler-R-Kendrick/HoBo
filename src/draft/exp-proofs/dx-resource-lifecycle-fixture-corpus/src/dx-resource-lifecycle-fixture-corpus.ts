export const REQUIRED_SCENARIOS = [
  "deploy",
  "manage",
  "migrate",
  "rollback",
  "import-adopt",
  "drift",
  "stale-projection",
  "policy-denial",
  "contract-incompatibility",
  "support-evidence",
] as const;

export const REQUIRED_ARTIFACTS = [
  "resources",
  "links",
  "manifest-ir",
  "deployment-plan",
  "deployment-set",
  "delta",
  "gatekeeper-decision",
  "resourceactor-events",
  "projection-snapshot",
  "logs",
] as const;

export const REQUIRED_BOUNDARY_CONTRACTS = [
  "protobuf",
  "CUE",
  "Pact",
  "fixture-json",
  "type-consumer",
] as const;

export const REQUIRED_CONSUMERS = [
  "sdk-compile-consumer",
  "cli-transcript-generator",
  "control-plane-api-example",
  "docs-snippet",
  "visual-mockup-fixture",
] as const;

const VALID_PROOF_MODES = new Set(["reference fixture", "simulated", "live", "scope-out"]);
const REQUIRED_SOURCE_REFS = [
  "docs/design/developer-experience.md#plan-07",
  "docs/design/cli-spec.md",
  "docs/design/authoring-resources-wiring.md#plan-21",
  "docs/design/control-plane.md#plan-04",
  "docs/design/data-plane.md#plan-32",
  "docs/design/walkthrough.md",
  "docs/design/worked-example.md#plan-19",
] as const;

const SCOPE_CREEP_PATTERNS = [
  /\blive provider\b/i,
  /\breal provider\b/i,
  /\bcustomer data\b/i,
  /\breal secrets?\b/i,
  /\bproduction catalog\b/i,
  /\bone-off fixture\b/i,
  /\bembedded inside mockups?\b/i,
  /\bcloud credential\b/i,
];

type RequiredScenario = (typeof REQUIRED_SCENARIOS)[number];
type Artifact = (typeof REQUIRED_ARTIFACTS)[number];
type BoundaryContract = (typeof REQUIRED_BOUNDARY_CONTRACTS)[number];
type Consumer = (typeof REQUIRED_CONSUMERS)[number];
type ProofMode = "reference fixture" | "simulated" | "live" | "scope-out";

interface LifecycleScenario {
  id: RequiredScenario | string;
  persona: string;
  lifecycleStep: string;
  commands: string[];
  artifacts: Artifact[];
  fixtureIds: string[];
  migrationPhase?: "expand" | "backfill" | "contract";
  deterministic: boolean;
  redacted: boolean;
  tenantSafe: boolean;
  proofMode: ProofMode;
  liveEvidenceRef?: string;
  simulationRef?: string;
  scopeOutGuard: string;
}

interface ResourceLifecycleFixtureCorpus {
  issue: string;
  packagePath: string;
  proofNote: string;
  audience: string[];
  sourceRefs: string[];
  boundaryContracts: BoundaryContract[];
  consumers: Consumer[];
  scenarios: LifecycleScenario[];
}

export type ParsedDxResourceLifecycleFixtureCorpus = ResourceLifecycleFixtureCorpus & {
  readonly __parsed: "DxResourceLifecycleFixtureCorpus";
};

export const DX_RESOURCE_LIFECYCLE_FIXTURE_CORPUS: ResourceLifecycleFixtureCorpus = {
  issue: "HOBO-572",
  packagePath: "src/draft/exp-proofs/dx-resource-lifecycle-fixture-corpus",
  proofNote: "docs/design/proofs/dx-resource-lifecycle-fixture-corpus/README.md",
  audience: [
    "app developer",
    "platform engineer",
    "GitOps operator",
    "SecOps reviewer",
    "DevOps operator",
    "SRE",
    "agent/MCP caller",
  ],
  sourceRefs: [...REQUIRED_SOURCE_REFS],
  boundaryContracts: [...REQUIRED_BOUNDARY_CONTRACTS],
  consumers: [...REQUIRED_CONSUMERS],
  scenarios: [
    {
      id: "deploy",
      persona: "app developer",
      lifecycleStep: "collect -> plan -> up -> inspect",
      commands: ["hobo collect --out manifest.json", "hobo plan --camp preview", "hobo up --camp preview", "hobo inspect run --last"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["snapshop-api", "snapshop-db", "snapshop-images", "gatekeeper-allow", "resource.Provisioned"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "No live providers, customer data, or production catalog generation are needed to prove the deploy corpus.",
    },
    {
      id: "manage",
      persona: "SRE",
      lifecycleStep: "inspect -> logs -> support bundle",
      commands: ["hobo inspect topology", "hobo logs --follow api", "hobo doctor --support-bundle"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["projection-fresh", "run-log-redacted", "support-bundle-safe", "topology-readmodel"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Management fixtures expose redacted projection and log records, not live customer telemetry.",
    },
    {
      id: "migrate",
      persona: "platform engineer",
      lifecycleStep: "expand -> backfill -> contract",
      commands: ["hobo plan --camp prod --migration expand", "hobo up --camp prod --to migration-expand"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["migration-expand", "migration-backfill", "migration-contract", "schema-change-additive"],
      migrationPhase: "expand",
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Migration fixtures model phases and blocked destructive contract steps without executing live migrations.",
    },
    {
      id: "rollback",
      persona: "GitOps operator",
      lifecycleStep: "failed rollout -> rollback available -> prior revision",
      commands: ["hobo up --camp prod --rollback", "hobo inspect deploy --last"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["rollback-last-good", "delta-reverts-to-set", "rollout-health-failed"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Rollback fixtures prove revision selection and event evidence, not a production rollback executor.",
    },
    {
      id: "import-adopt",
      persona: "DevOps operator",
      lifecycleStep: "import terraform -> adopted resources -> no-op plan",
      commands: ["hobo import terraform ./infra", "hobo plan --camp prod"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["terraform-state-redacted", "resource-adopted", "authoritative-external", "no-op-plan"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Import/adopt fixtures are redacted state examples and do not read real Terraform state or cloud credentials.",
    },
    {
      id: "drift",
      persona: "SRE",
      lifecycleStep: "refresh -> DriftReport -> reconcile proposal",
      commands: ["hobo inspect deploy --drift", "hobo plan --camp prod"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["resource.DriftDetected", "drift-report-safe", "reconcile-delta-proposed"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Drift fixtures do not poll providers or mutate ResourceActor runtime state.",
    },
    {
      id: "stale-projection",
      persona: "agent/MCP caller",
      lifecycleStep: "read projection -> freshness warning -> retry route",
      commands: ["hobo inspect topology --json", "mcp.hobo.inspectTopology"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["projection-stale", "freshness-lag-warning", "safe-next-action"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Projection fixtures label stale evidence without building a projection runtime.",
    },
    {
      id: "policy-denial",
      persona: "SecOps reviewer",
      lifecycleStep: "plan -> Gatekeeper denial -> support-safe explanation",
      commands: ["hobo plan --camp prod", "hobo up --camp prod"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["policy.Decided-deny", "gatekeeper-denial", "approval-required"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Policy fixtures show refusal envelopes and do not implement the policy engine or approval workflow.",
    },
    {
      id: "contract-incompatibility",
      persona: "app developer",
      lifecycleStep: "contract change -> Gatekeeper denial -> remediation route",
      commands: ["hobo verify --target prod", "hobo up --camp prod"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["compat.GateFailed", "consumer-still-reads-field", "dual-publish-remediation"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Contract fixtures capture incompatibility and remediation labels without implementing contract promotion.",
    },
    {
      id: "support-evidence",
      persona: "support operator",
      lifecycleStep: "customer issue -> redacted evidence pack -> owner route",
      commands: ["hobo doctor --support-bundle", "hobo inspect run --last --redacted"],
      artifacts: [...REQUIRED_ARTIFACTS],
      fixtureIds: ["redacted-evidence-pack", "owner-route-support", "customer-safe-update"],
      deterministic: true,
      redacted: true,
      tenantSafe: true,
      proofMode: "reference fixture",
      scopeOutGuard: "Support fixtures contain redacted evidence only and do not open tickets, access customer data, or promise SLAs.",
    },
  ],
};

export function validateDxResourceLifecycleFixtureCorpus(corpus: ResourceLifecycleFixtureCorpus) {
  const errors: string[] = [];
  const sourceRefs = stringList(corpus.sourceRefs);
  const boundaryContracts = stringList(corpus.boundaryContracts);
  const consumers = stringList(corpus.consumers);
  const scenarioRecords = recordList(corpus.scenarios);

  if (corpus.issue !== "HOBO-572") {
    errors.push("issue must be HOBO-572");
  }
  if (corpus.packagePath !== "src/draft/exp-proofs/dx-resource-lifecycle-fixture-corpus") {
    errors.push("target package path must match the Linear issue");
  }
  if (corpus.proofNote !== "docs/design/proofs/dx-resource-lifecycle-fixture-corpus/README.md") {
    errors.push("target proof note must match the Linear issue");
  }
  if (!Array.isArray(corpus.sourceRefs)) {
    errors.push("source refs must be an array");
  }
  if (!Array.isArray(corpus.boundaryContracts)) {
    errors.push("boundary contracts must be an array");
  }
  if (!Array.isArray(corpus.consumers)) {
    errors.push("consumers must be an array");
  }
  if (!Array.isArray(corpus.scenarios)) {
    errors.push("scenarios must be an array");
  }

  for (const sourceRef of REQUIRED_SOURCE_REFS) {
    if (!sourceRefs.includes(sourceRef)) {
      errors.push(`missing source ref: ${sourceRef}`);
    }
  }
  for (const contract of REQUIRED_BOUNDARY_CONTRACTS) {
    if (!boundaryContracts.includes(contract)) {
      errors.push(`missing boundary contract: ${contract}`);
    }
  }
  for (const consumer of REQUIRED_CONSUMERS) {
    if (!consumers.includes(consumer)) {
      errors.push(`missing consumer: ${consumer}`);
    }
  }

  const scenarios = new Map(scenarioRecords.map((scenario) => [scenario.id, scenario]));
  for (const requiredScenario of REQUIRED_SCENARIOS) {
    if (!scenarios.has(requiredScenario)) {
      errors.push(`missing required scenario: ${requiredScenario}`);
    }
  }

  for (const scenario of scenarioRecords) {
    const scenarioId = typeof scenario.id === "string" ? scenario.id : "unknown";
    const artifacts = stringList(scenario.artifacts);
    const fixtureIds = stringList(scenario.fixtureIds);
    const scopeOutGuard = typeof scenario.scopeOutGuard === "string" ? scenario.scopeOutGuard : "";

    if (!scenario.deterministic) {
      errors.push(`scenario ${scenarioId} must be deterministic`);
    }
    if (!scenario.redacted) {
      errors.push(`scenario ${scenarioId} must be redacted`);
    }
    if (!scenario.tenantSafe) {
      errors.push(`scenario ${scenarioId} must be tenant-safe`);
    }
    if (!VALID_PROOF_MODES.has(scenario.proofMode)) {
      errors.push(`scenario ${scenarioId} has unsupported proof mode`);
    }
    if (scenario.proofMode === "live" && !scenario.liveEvidenceRef) {
      errors.push(`scenario ${scenarioId} needs live proof evidence before using live proof mode`);
    }
    if (scenario.proofMode === "simulated" && !scenario.simulationRef) {
      errors.push(`scenario ${scenarioId} needs simulation evidence before using simulated proof mode`);
    }
    for (const artifact of REQUIRED_ARTIFACTS) {
      if (!artifacts.includes(artifact)) {
        errors.push(`scenario ${scenarioId} missing artifact: ${artifact}`);
      }
    }
    if (fixtureIds.length < 3) {
      errors.push(`scenario ${scenarioId} must name deterministic fixture ids`);
    }
    if (!scopeOutGuard) {
      errors.push(`scenario ${scenarioId} must name its scope-out guard`);
    }
    if (
      /^(use|read|execute|generate|build|call)\b/i.test(scopeOutGuard) &&
      SCOPE_CREEP_PATTERNS.some((pattern) => pattern.test(scopeOutGuard))
    ) {
      errors.push(`scenario ${scenarioId} has scope creep in guard: ${scopeOutGuard}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parseDxResourceLifecycleFixtureCorpus(input: unknown) {
  if (!input || typeof input !== "object") {
    return { ok: false as const, errors: ["fixture corpus object is required"] };
  }

  const result = validateDxResourceLifecycleFixtureCorpus(input as ResourceLifecycleFixtureCorpus);
  if (!result.ok) {
    return result as { ok: false; errors: string[] };
  }

  return {
    ok: true as const,
    errors: [],
    value: {
      ...(input as ResourceLifecycleFixtureCorpus),
      __parsed: "DxResourceLifecycleFixtureCorpus",
    } satisfies ParsedDxResourceLifecycleFixtureCorpus,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}
