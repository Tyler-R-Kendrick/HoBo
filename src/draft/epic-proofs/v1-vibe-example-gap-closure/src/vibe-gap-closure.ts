const REQUIRED_CHILD_SCENARIOS = [
  "happy path",
  "blocked path",
  "stale/unknown evidence path",
  "support handoff",
  "accessibility notes",
] as const;

const REQUIRED_PROOF_MODES = ["live", "simulated", "reference fixture", "scope-out"] as const;

const FORBIDDEN_SCOPE_PATTERNS = [
  /live provider calls?/i,
  /production ui/i,
  /customer data/i,
  /real credentials?/i,
  /launch claims?/i,
  /publish final/i,
  /implement the product/i,
];

const REQUIRED_SCOPE_OUT_GUARDS = [
  /live provider calls?/i,
  /production ui/i,
  /customer data/i,
  /real credentials?/i,
  /launch claims?/i,
];

const ALLOWED_ARTIFACTS = new Set([
  "mockups",
  "wireframes",
  "state model",
  "storyboard",
  "script",
  "pseudocode",
  "fixtures",
  "copy states",
  "decision trees",
  "tutorial outline",
  "transcript",
  "recording manifest",
  "asset map",
  "clickable prototype",
  "reference prototype",
  "acceptance checklist",
  "representative checks",
]);

export type VibeChildPhase = "M1" | "M2" | "M5";

export interface VibeChildIssue {
  id: string;
  title: string;
  project: string;
  phase: VibeChildPhase;
  estimate: 3 | 5;
  targetPackagePath: `src/draft/exp-proofs/${string}`;
  proofNotePath: `docs/design/proofs/${string}/README.md`;
  artifactSlices: string[];
  requiredScenarios: string[];
  proofModes: string[];
  sourceDesignDocs: string[];
  scopeOut: string[];
}

export interface VibeGapClosureBacklog {
  parentIssue: "HOBO-539";
  parentTitle: string;
  childIssues: VibeChildIssue[];
  unblockRule: string;
}

export const VIBE_GAP_CLOSURE_BACKLOG: VibeGapClosureBacklog = {
  parentIssue: "HOBO-539",
  parentTitle: "Epic: Close v1 vibe example gaps across UX, DX, CX, docs, support, and launch",
  unblockRule:
    "HOBO-539 can move to Done after this proof shows every branch-sized child issue owns an artifact slice, target exp proof path, proof note path, common scenario coverage, milestone phase, and scope-out guard.",
  childIssues: [
    child("HOBO-540", "first-run activation rail mockups and state model", "Workspace & Onboarding UX", "M1", 3, [
      "mockups",
      "state model",
    ], ["docs/design/workspace-onboarding-ux.md", "docs/design/outcome-activation-rail.md"]),
    child("HOBO-541", "workspace/project empty, blocked, recovery, and value-proof states", "Workspace & Onboarding UX", "M1", 3, [
      "mockups",
      "state model",
    ], ["docs/design/workspace-onboarding-ux.md"]),
    child("HOBO-542", "plan review mockups for safe, blocked, destructive, stale, and unknown evidence", "Plan/Diff Viewer", "M1", 3, [
      "mockups",
      "wireframes",
    ], ["docs/design/plan-diff-viewer.md"]),
    child("HOBO-543", "policy, cost, capacity, and approval annotation pseudocode", "Plan/Diff Viewer", "M1", 3, [
      "pseudocode",
      "fixtures",
    ], ["docs/design/plan-diff-viewer.md", "docs/design/contracts-policy-flags.md#plan-29"]),
    child("HOBO-544", "deployment timeline, topology graph, run inspector, and health rollup mockups", "Deployment Dashboard & Topology Explorer", "M1", 3, [
      "mockups",
      "wireframes",
    ], ["docs/design/deployment-dashboard-topology-explorer.md", "docs/design/developer-experience.md#plan-07"]),
    child("HOBO-545", "projection freshness, tenant/RBAC, and support handoff fixtures", "Deployment Dashboard & Topology Explorer", "M1", 3, [
      "fixtures",
      "state model",
    ], ["docs/design/deployment-dashboard-topology-explorer.md", "docs/design/data-plane.md#plan-32"]),
    child("HOBO-546", "browse/search/detail/installability mockups", "Marketplace UX", "M1", 3, [
      "mockups",
      "wireframes",
    ], ["docs/design/marketplace-ux.md"]),
    child("HOBO-547", "trust warning, org-catalog filter, deprecation, and yank copy states", "Marketplace UX", "M1", 3, [
      "copy states",
      "fixtures",
    ], ["docs/design/marketplace-ux.md", "docs/design/org-catalogs.md"]),
    child("HOBO-548", "publisher submission, evidence upload, review, rejection, and yank remediation mockups", "Publisher Portal", "M1", 3, [
      "mockups",
      "wireframes",
    ], ["docs/design/publisher-portal.md", "docs/design/marketplace-publisher-trust-evidence.md"]),
    child("HOBO-549", "first-customer pilot storyboard and script artifacts", "Customer Onboarding", "M1", 3, [
      "storyboard",
      "script",
    ], ["docs/design/customer-onboarding.md"]),
    child("HOBO-550", "support intake, triage, owner-route, and customer update mockups", "Support Workflow", "M1", 3, [
      "mockups",
      "wireframes",
    ], ["docs/design/support-workflow.md", "docs/design/launch-support-escalation.md"]),
    child("HOBO-551", "docs IA, audience paths, search metadata, and stale-content states", "Docs Portal", "M1", 3, [
      "fixtures",
      "state model",
    ], ["docs/design/docs-portal.md"]),
    child("HOBO-552", "app developer, platform engineer, GitOps, SecOps, DevOps, and SRE tutorial outlines", "Tutorials & Walkthroughs", "M1", 3, [
      "tutorial outline",
      "fixtures",
    ], ["docs/design/tutorials-walkthroughs.md", "docs/design/walkthrough.md"]),
    child("HOBO-553", "diagnostic decision trees for install, auth, plan, deploy, policy, and support failures", "Troubleshooting Guides", "M1", 3, [
      "decision trees",
      "fixtures",
    ], ["docs/design/troubleshooting-guides.md", "docs/design/support-debug-tools.md"]),
    child("HOBO-554", "accessibility/usability acceptance checklist for every vibe artifact", "Accessibility & Usability Quality", "M1", 3, [
      "acceptance checklist",
      "representative checks",
    ], ["docs/design/accessibility-usability-launch-baseline.md"]),
    child("HOBO-555", "snapshot launch demo storyboard and proof-mode asset map", "V1 Launch Site, Messaging & Demo Assets", "M5", 3, [
      "storyboard",
      "asset map",
    ], ["docs/design/launch-demo-golden-path.md", "docs/design/launch-messaging-claims.md"]),
    child("HOBO-556", "screenshot, recording manifest, command transcript, and fixture refresh plan", "V1 Launch Site, Messaging & Demo Assets", "M5", 3, [
      "recording manifest",
      "transcript",
      "fixtures",
    ], ["docs/design/launch-demo-golden-path.md", "docs/design/launch-messaging-claims.md"]),
    child("HOBO-557", "CLI transcript and MCP tool pseudocode examples for six role journeys", "CLI, MCP & Developer Experience", "M1", 3, [
      "transcript",
      "pseudocode",
    ], ["docs/design/cli-spec.md", "docs/design/developer-experience.md#plan-07", "docs/design/walkthrough.md"]),
    child("HOBO-558", "error/refusal UX examples for doctor, plan, up, inspect, logs, and MCP actions", "CLI, MCP & Developer Experience", "M1", 3, [
      "copy states",
      "fixtures",
    ], ["docs/design/cli-spec.md", "docs/design/troubleshooting-guides.md"]),
    child("HOBO-559", "clickable first-run walkthrough with snapshot fixtures", "Workspace & Onboarding UX", "M2", 5, [
      "clickable prototype",
      "fixtures",
    ], ["docs/design/workspace-onboarding-ux.md", "docs/design/worked-example.md#plan-19"]),
    child("HOBO-560", "deterministic plan/diff review prototype over golden fixtures", "Plan/Diff Viewer", "M2", 5, [
      "reference prototype",
      "fixtures",
    ], ["docs/design/plan-diff-viewer.md"]),
    child("HOBO-561", "topology/status prototype over projection snapshots", "Deployment Dashboard & Topology Explorer", "M2", 5, [
      "reference prototype",
      "fixtures",
    ], ["docs/design/deployment-dashboard-topology-explorer.md", "docs/design/data-plane.md#plan-32"]),
    child("HOBO-562", "deterministic marketplace discovery and install-intent prototype", "Marketplace UX", "M2", 5, [
      "reference prototype",
      "fixtures",
    ], ["docs/design/marketplace-ux.md", "docs/design/org-catalogs.md"]),
    child("HOBO-563", "pilot workspace-to-first-proof walkthrough with blocker routing", "Customer Onboarding", "M2", 5, [
      "clickable prototype",
      "fixtures",
    ], ["docs/design/customer-onboarding.md", "docs/design/workspace-onboarding-ux.md"]),
    child("HOBO-564", "support case prototype with redacted evidence pack", "Support Workflow", "M2", 5, [
      "reference prototype",
      "fixtures",
    ], ["docs/design/support-workflow.md", "docs/design/support-debug-tools.md"]),
    child("HOBO-565", "representative keyboard, screen-reader, responsive, contrast, and copy checks", "Accessibility & Usability Quality", "M2", 5, [
      "representative checks",
      "fixtures",
    ], ["docs/design/accessibility-usability-launch-baseline.md"]),
  ],
};

export function evaluateVibeGapClosure(backlog: VibeGapClosureBacklog = VIBE_GAP_CLOSURE_BACKLOG) {
  const violations: string[] = [];

  if (backlog.parentIssue !== "HOBO-539") {
    violations.push("parent issue must be HOBO-539");
  }
  if (backlog.childIssues.length !== 26) {
    violations.push(`expected 26 child artifact issues, got ${backlog.childIssues.length}`);
  }

  const seen = new Set<string>();
  for (const issue of backlog.childIssues) {
    if (seen.has(issue.id)) {
      violations.push(`${issue.id} is duplicated`);
    }
    seen.add(issue.id);

    if (!issue.targetPackagePath.startsWith("src/draft/exp-proofs/")) {
      violations.push(`${issue.id} must target src/draft/exp-proofs/<slug>`);
    }
    if (!issue.proofNotePath.startsWith(`docs/design/proofs/${issue.id.toLowerCase()}-`)) {
      violations.push(`${issue.id} proof note must live under docs/design/proofs/<issue-slug>/`);
    }
    if (issue.artifactSlices.length === 0 || issue.artifactSlices.some((slice) => !ALLOWED_ARTIFACTS.has(slice))) {
      violations.push(`${issue.id} must target branch-sized artifact slices`);
    }
    for (const scenario of REQUIRED_CHILD_SCENARIOS) {
      if (!issue.requiredScenarios.includes(scenario)) {
        violations.push(`${issue.id} missing scenario coverage: ${scenario}`);
      }
    }
    for (const mode of REQUIRED_PROOF_MODES) {
      if (!issue.proofModes.includes(mode)) {
        violations.push(`${issue.id} missing proof mode label: ${mode}`);
      }
    }
    if (issue.project === "V1 Launch Site, Messaging & Demo Assets" && issue.phase !== "M5") {
      violations.push(`${issue.id} launch-demo issue must use M5 vibe refresh phase`);
    }
    if (issue.project !== "V1 Launch Site, Messaging & Demo Assets" && issue.phase === "M5") {
      violations.push(`${issue.id} non-launch issue must not use M5 vibe refresh phase`);
    }
    if (issue.sourceDesignDocs.length === 0) {
      violations.push(`${issue.id} must cite at least one design source`);
    }
    const forbiddenScope = findForbiddenScope(issue.scopeOut);
    if (forbiddenScope.length < REQUIRED_SCOPE_OUT_GUARDS.length) {
      violations.push(`${issue.id} scope-out guard must cover provider, UI, data, credential, and launch-claim creep`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    summary: {
      parentIssue: backlog.parentIssue,
      childCount: backlog.childIssues.length,
      phases: countBy(backlog.childIssues.map((issue) => issue.phase)),
      projects: countBy(backlog.childIssues.map((issue) => issue.project)),
      contracts: {
        covered: ["VibeChildBacklogBoundary", "VibeScopeGuardBoundary", "VibeUnblockLedgerBoundary"],
        missing: [] as string[],
      },
      unblockOutcome:
        "After this PR merges and HOBO-539 moves Done, all child issues blocked only by HOBO-539 can be claimed in normal Backlog reduction runs.",
    },
  };
}

export function rejectVibeScopeCreep(requests: string[]) {
  return requests
    .filter((request) => FORBIDDEN_SCOPE_PATTERNS.some((pattern) => pattern.test(request)))
    .map((request) => ({
      request,
      decision: "reject",
      reason: "HOBO-539 coordinates artifact-proof child backlog only; production behavior and launch claims stay out of scope.",
    }));
}

export function createIssueSlug(issue: string, title: string) {
  return `${issue.toLowerCase()}-${title}`
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function child(
  id: string,
  title: string,
  project: string,
  phase: VibeChildPhase,
  estimate: 3 | 5,
  artifactSlices: string[],
  sourceDesignDocs: string[],
): VibeChildIssue {
  const issueSlug = createIssueSlug(id, title);
  const packageSlug = issueSlug.replace(/^hobo-\d+-/, "");

  return {
    id,
    title: `Vibe slice: ${title}`,
    project,
    phase,
    estimate,
    targetPackagePath: `src/draft/exp-proofs/${packageSlug}`,
    proofNotePath: `docs/design/proofs/${issueSlug}/README.md`,
    artifactSlices,
    requiredScenarios: [...REQUIRED_CHILD_SCENARIOS],
    proofModes: [...REQUIRED_PROOF_MODES],
    sourceDesignDocs,
    scopeOut: [
      "No live provider calls.",
      "No production UI implementation.",
      "No live customer data.",
      "No real credentials or secrets.",
      "No launch claims without evidence.",
    ],
  };
}

function findForbiddenScope(scopeOut: string[]) {
  return REQUIRED_SCOPE_OUT_GUARDS.filter((pattern) => scopeOut.some((entry) => pattern.test(entry)));
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
