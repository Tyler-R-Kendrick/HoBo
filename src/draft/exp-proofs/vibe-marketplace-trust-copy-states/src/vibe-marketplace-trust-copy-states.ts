export const REQUIRED_MARKETPLACE_COPY_SCENARIOS = [
  "preview-warning",
  "installable-with-evidence",
  "policy-block",
  "deprecated-guidance",
  "yanked-support-route",
  "hidden-listing",
] as const;

export const MARKETPLACE_PROOF_MODES = [
  "reference-fixture",
  "simulated",
  "live",
  "scope-out",
] as const;

export const MARKETPLACE_ACCESSIBILITY_CHECKS = [
  "keyboard-only",
  "focus-order",
  "semantic-labels",
  "contrast",
  "responsive-layout",
  "reduced-motion",
  "screen-reader-smoke",
  "state-copy-clarity",
] as const;

const HANDOFF_OWNERS = [
  "Marketplace UX",
  "Capability Review & Approval",
  "Marketplace Publisher Trust Evidence",
  "Org Catalogs",
  "Registry Distribution",
  "Support Workflow",
  "Accessibility & Usability Quality",
] as const;

const REQUIRED_SCOPE_OUT = [
  "production UI",
  "publisher portal UI",
  "approval service",
  "security scanner",
  "policy engine",
  "notification delivery",
  "support queue",
  "launch claims without evidence",
] as const;

type MarketplaceScenarioKind = (typeof REQUIRED_MARKETPLACE_COPY_SCENARIOS)[number];
type MarketplaceProofMode = (typeof MARKETPLACE_PROOF_MODES)[number];
type MarketplaceAccessibilityCheck = (typeof MARKETPLACE_ACCESSIBILITY_CHECKS)[number];
type MarketplaceHandoffOwner = (typeof HANDOFF_OWNERS)[number];

type MarketplaceListingState =
  | "not-visible"
  | "preview-only"
  | "limited-beta"
  | "installable"
  | "blocked-by-policy"
  | "deprecated"
  | "yanked";

type MarketplaceCopyPath = "happy" | "blocked" | "stale-or-unknown" | "support-handoff";

export type MarketplaceTrustCopy = {
  readonly headline: string;
  readonly body: string;
  readonly nextAction: string;
};

export type MarketplaceAccessibilityNote = {
  readonly check: MarketplaceAccessibilityCheck;
  readonly note: string;
};

export type MarketplaceTrustCopyScenario = {
  readonly kind: MarketplaceScenarioKind;
  readonly fixtureId: string;
  readonly listingState: MarketplaceListingState;
  readonly path: MarketplaceCopyPath;
  readonly proofMode: MarketplaceProofMode;
  readonly audience: string;
  readonly ownerRoute: string;
  readonly evidenceSource: string;
  readonly safeClaim: string;
  readonly copy: MarketplaceTrustCopy;
  readonly accessibilityNotes: readonly MarketplaceAccessibilityNote[];
};

export type MarketplaceTrustHandoff = {
  readonly owner: MarketplaceHandoffOwner;
  readonly consumes: string;
  readonly mustNotOwn: readonly string[];
};

export type MarketplaceTrustCopyStates = {
  readonly issue: "HOBO-547";
  readonly phase: "M1";
  readonly targetPackage: "src/draft/exp-proofs/vibe-marketplace-trust-copy-states";
  readonly proofNote: "docs/design/proofs/vibe-marketplace-trust-copy-states/README.md";
  readonly designRefs: readonly string[];
  readonly scopeOut: readonly string[];
  readonly scenarios: readonly MarketplaceTrustCopyScenario[];
  readonly handoffs: readonly MarketplaceTrustHandoff[];
  readonly __brand: "ParsedMarketplaceTrustCopyStates";
};

type UnparsedMarketplaceTrustCopyStates = Omit<MarketplaceTrustCopyStates, "__brand">;

const accessibilityNotes: readonly MarketplaceAccessibilityNote[] = MARKETPLACE_ACCESSIBILITY_CHECKS.map(
  (check) => ({
    check,
    note: `${check} evidence is named for this copy state before it can be reused in marketplace surfaces.`,
  }),
);

export const MARKETPLACE_TRUST_COPY_SCENARIOS = [
  {
    kind: "preview-warning",
    fixtureId: "mtc-preview-warning-v1",
    listingState: "preview-only",
    path: "stale-or-unknown",
    proofMode: "reference-fixture",
    audience: "app developer",
    ownerRoute: "Marketplace Publisher Trust Evidence",
    evidenceSource: "docs/design/marketplace-publisher-trust-evidence.md",
    safeClaim: "Preview listings are visible only with explicit missing-evidence limits.",
    copy: {
      headline: "Preview listing",
      body: "This capability is available as a reference preview. Required review, conformance, and catalog evidence are not complete.",
      nextAction: "Review the evidence checklist before planning use.",
    },
    accessibilityNotes,
  },
  {
    kind: "installable-with-evidence",
    fixtureId: "mtc-installable-evidence-v1",
    listingState: "installable",
    path: "happy",
    proofMode: "live",
    audience: "workspace administrator",
    ownerRoute: "Capability Review & Approval",
    evidenceSource: "docs/design/capability-review-approval.md",
    safeClaim: "Installable wording is allowed only when provenance, conformance, security review, catalog, and policy evidence are linked.",
    copy: {
      headline: "Installable with linked evidence",
      body: "This fixture has provenance, conformance, security review, org catalog, and policy evidence for the recorded workspace scope.",
      nextAction: "Open the linked evidence before approving install intent.",
    },
    accessibilityNotes,
  },
  {
    kind: "policy-block",
    fixtureId: "mtc-policy-block-v1",
    listingState: "blocked-by-policy",
    path: "blocked",
    proofMode: "simulated",
    audience: "workspace administrator",
    ownerRoute: "Org Catalogs",
    evidenceSource: "docs/design/org-catalogs.md",
    safeClaim: "Policy-blocked listings name the catalog or policy evidence that prevents new use.",
    copy: {
      headline: "Blocked for this workspace",
      body: "The org catalog or mandatory policy does not allow this listing for the selected workspace, project, or environment.",
      nextAction: "Ask the catalog owner to review the policy evidence and support handoff.",
    },
    accessibilityNotes,
  },
  {
    kind: "deprecated-guidance",
    fixtureId: "mtc-deprecated-guidance-v1",
    listingState: "deprecated",
    path: "stale-or-unknown",
    proofMode: "reference-fixture",
    audience: "app developer",
    ownerRoute: "Registry Distribution",
    evidenceSource: "docs/design/adr/07-portability-extensibility.md#adr-0062",
    safeClaim: "Deprecated listings remain visible only for existing-use and migration guidance.",
    copy: {
      headline: "Deprecated listing",
      body: "This listing remains visible for existing use while replacement, migration, or retirement evidence is prepared.",
      nextAction: "Use the migration guidance or choose a replacement with current evidence.",
    },
    accessibilityNotes,
  },
  {
    kind: "yanked-support-route",
    fixtureId: "mtc-yanked-support-route-v1",
    listingState: "yanked",
    path: "support-handoff",
    proofMode: "simulated",
    audience: "support operator",
    ownerRoute: "Support Workflow",
    evidenceSource: "docs/design/support-workflow.md",
    safeClaim: "Yanked listings are removed from new selection and route customers to support or migration guidance.",
    copy: {
      headline: "Yanked from new selection",
      body: "This listing is no longer available for new use. Existing users should follow the customer-safe support or migration route.",
      nextAction: "Open the redacted support handoff and owner route.",
    },
    accessibilityNotes,
  },
  {
    kind: "hidden-listing",
    fixtureId: "mtc-hidden-listing-v1",
    listingState: "not-visible",
    path: "blocked",
    proofMode: "scope-out",
    audience: "marketplace operator",
    ownerRoute: "Marketplace UX",
    evidenceSource: "docs/design/marketplace-ux.md",
    safeClaim: "Hidden listings are not visible until required review, trust, catalog, or policy evidence exists.",
    copy: {
      headline: "Listing hidden",
      body: "This listing should not appear in marketplace search or install intent because required evidence is missing.",
      nextAction: "Keep it hidden until the owning review lane records accepted evidence.",
    },
    accessibilityNotes,
  },
] as const satisfies readonly MarketplaceTrustCopyScenario[];

export const MARKETPLACE_TRUST_COPY_STATES = {
  issue: "HOBO-547",
  phase: "M1",
  targetPackage: "src/draft/exp-proofs/vibe-marketplace-trust-copy-states",
  proofNote: "docs/design/proofs/vibe-marketplace-trust-copy-states/README.md",
  designRefs: [
    "docs/design/marketplace-ux.md",
    "docs/design/marketplace-publisher-trust-evidence.md",
    "docs/design/capability-review-approval.md",
    "docs/design/org-catalogs.md",
    "docs/design/support-workflow.md",
    "docs/design/accessibility-usability-launch-baseline.md",
    "docs/design/launch-messaging-claims.md",
    "docs/design/adr/07-portability-extensibility.md#adr-0062",
    "docs/design/adr/02-identity-security.md#adr-0074",
    "docs/design/proofs/resource-lifecycle-quickstart-examples/README.md",
  ],
  scopeOut: [
    "production UI",
    "publisher portal UI",
    "approval service",
    "security scanner",
    "policy engine",
    "notification delivery",
    "support queue",
    "launch claims without evidence",
    "live provider calls",
    "real credentials",
    "customer data",
  ],
  scenarios: MARKETPLACE_TRUST_COPY_SCENARIOS,
  handoffs: [
    {
      owner: "Marketplace UX",
      consumes: "copy states, visible listing states, proof modes, and accessibility notes",
      mustNotOwn: ["production UI", "install runtime"],
    },
    {
      owner: "Capability Review & Approval",
      consumes: "review and installability evidence lineage",
      mustNotOwn: ["review service", "approval runtime"],
    },
    {
      owner: "Marketplace Publisher Trust Evidence",
      consumes: "trust warning and missing-evidence wording",
      mustNotOwn: ["publisher portal UI", "ratings ranking"],
    },
    {
      owner: "Org Catalogs",
      consumes: "policy block and hidden-listing catalog evidence",
      mustNotOwn: ["RBAC runtime", "policy enforcement"],
    },
    {
      owner: "Registry Distribution",
      consumes: "deprecation and yank lifecycle evidence",
      mustNotOwn: ["registry storage", "artifact resolver"],
    },
    {
      owner: "Support Workflow",
      consumes: "yanked, blocked, deprecated, and hidden listing support routes",
      mustNotOwn: ["support queue", "notification delivery"],
    },
    {
      owner: "Accessibility & Usability Quality",
      consumes: "keyboard, focus, semantic, contrast, responsive, motion, screen-reader, and copy checks",
      mustNotOwn: ["full accessibility audit", "product UI remediation"],
    },
  ],
} as const satisfies UnparsedMarketplaceTrustCopyStates;

export type MarketplaceCopyClaimDecision =
  | { readonly allowed: true; readonly reason: "customer-safe-copy" }
  | {
      readonly allowed: false;
      readonly reason:
        | "security-overclaim"
        | "popularity-overclaim"
        | "installability-overclaim"
        | "registry-guarantee"
        | "support-readiness-overclaim";
    };

export function classifyMarketplaceCopyClaim(copy: string): MarketplaceCopyClaimDecision {
  const normalized = copy.toLowerCase();

  if (/verified secure|secure for production|security guaranteed|no vulnerabilities|safe by default/.test(normalized)) {
    return { allowed: false, reason: "security-overclaim" };
  }
  if (/most popular|best rated|top rated|trusted by thousands|popular provider/.test(normalized)) {
    return { allowed: false, reason: "popularity-overclaim" };
  }
  if (/safe to install|install now|one-click install|ready to install|works in production/.test(normalized)) {
    return { allowed: false, reason: "installability-overclaim" };
  }
  if (/registry guarantees|guaranteed by registry|registry-certified|registry certified/.test(normalized)) {
    return { allowed: false, reason: "registry-guarantee" };
  }
  if (/fully supported|24\/7 helpdesk|24\/7 support|support-ready|support ready/.test(normalized)) {
    return { allowed: false, reason: "support-readiness-overclaim" };
  }

  return { allowed: true, reason: "customer-safe-copy" };
}

export function parseMarketplaceTrustCopyStates(proof: unknown): MarketplaceTrustCopyStates {
  assertObject(proof, "proof");
  assertLiteral(proof.issue, "HOBO-547", "issue");
  assertLiteral(proof.phase, "M1", "phase");
  assertLiteral(
    proof.targetPackage,
    "src/draft/exp-proofs/vibe-marketplace-trust-copy-states",
    "targetPackage",
  );
  assertLiteral(
    proof.proofNote,
    "docs/design/proofs/vibe-marketplace-trust-copy-states/README.md",
    "proofNote",
  );
  assertNonEmptyStringArray(proof.designRefs, "designRefs");
  assertScopeOut(proof.scopeOut);
  const scenarios = assertScenarioArray(proof.scenarios);
  const handoffs = assertHandoffArray(proof.handoffs);
  assertScenarioCoverage(scenarios);
  assertProofModeCoverage(scenarios);
  assertPathCoverage(scenarios);
  assertHandoffCoverage(handoffs);

  return {
    ...(proof as UnparsedMarketplaceTrustCopyStates),
    __brand: "ParsedMarketplaceTrustCopyStates",
  };
}

export function listMarketplaceTrustCopyScenarios(
  proof: MarketplaceTrustCopyStates,
): readonly MarketplaceTrustCopyScenario[] {
  return proof.scenarios;
}

export function summarizeMarketplaceTrustHandoffs(
  proof: MarketplaceTrustCopyStates,
): ReadonlyArray<Pick<MarketplaceTrustHandoff, "owner" | "mustNotOwn">> {
  return proof.handoffs.map((handoff) => ({
    owner: handoff.owner,
    mustNotOwn: handoff.mustNotOwn,
  }));
}

function assertScenarioArray(value: unknown): MarketplaceTrustCopyScenario[] {
  if (!Array.isArray(value)) {
    throw new TypeError("scenarios must be an array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `scenario ${index}`);
    assertScenarioKind(entry.kind);
    assertFixtureId(entry.fixtureId, `${entry.kind}.fixtureId`);
    assertListingState(entry.listingState, `${entry.kind}.listingState`);
    assertPath(entry.path, `${entry.kind}.path`);
    assertProofMode(entry.proofMode);
    assertNonEmptyString(entry.audience, `${entry.kind}.audience`);
    assertNonEmptyString(entry.ownerRoute, `${entry.kind}.ownerRoute`);
    assertNonEmptyString(entry.evidenceSource, `${entry.kind}.evidenceSource`);
    assertNonEmptyString(entry.safeClaim, `${entry.kind}.safeClaim`);
    assertSafeCopy(entry.safeClaim, `${entry.kind}.safeClaim`);
    assertCopy(entry.copy, entry.kind);
    assertAccessibilityNotes(entry.accessibilityNotes, entry.kind);

    return entry as MarketplaceTrustCopyScenario;
  });
}

function assertCopy(value: unknown, name: string): void {
  assertObject(value, `${name}.copy`);
  assertNonEmptyString(value.headline, `${name}.copy.headline`);
  assertNonEmptyString(value.body, `${name}.copy.body`);
  assertNonEmptyString(value.nextAction, `${name}.copy.nextAction`);
  assertSafeCopy(value.headline, `${name}.copy.headline`);
  assertSafeCopy(value.body, `${name}.copy.body`);
  assertSafeCopy(value.nextAction, `${name}.copy.nextAction`);
}

function assertSafeCopy(value: string, name: string): void {
  const decision = classifyMarketplaceCopyClaim(value);
  if (!decision.allowed) {
    throw new TypeError(`${name} is unsafe marketplace copy: ${decision.reason}`);
  }
}

function assertAccessibilityNotes(value: unknown, name: string): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name}.accessibilityNotes must be an array`);
  }

  const checks = value.map((entry, index) => {
    assertObject(entry, `${name}.accessibilityNotes ${index}`);
    assertAccessibilityCheck(entry.check);
    assertNonEmptyString(entry.note, `${name}.accessibilityNotes ${index}.note`);
    return entry.check;
  });

  for (const check of MARKETPLACE_ACCESSIBILITY_CHECKS) {
    if (!checks.includes(check)) {
      throw new TypeError(`${name}.accessibilityNotes missing ${check}`);
    }
  }
  if (new Set(checks).size !== checks.length) {
    throw new TypeError(`${name}.accessibilityNotes must be unique`);
  }
}

function assertHandoffArray(value: unknown): MarketplaceTrustHandoff[] {
  if (!Array.isArray(value)) {
    throw new TypeError("handoffs must be an array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `handoff ${index}`);
    assertHandoffOwner(entry.owner);
    assertNonEmptyString(entry.consumes, `${entry.owner}.consumes`);
    assertNonEmptyStringArray(entry.mustNotOwn, `${entry.owner}.mustNotOwn`);
    return entry as MarketplaceTrustHandoff;
  });
}

function assertScenarioCoverage(scenarios: readonly MarketplaceTrustCopyScenario[]): void {
  const kinds = scenarios.map((scenario) => scenario.kind);
  for (const kind of REQUIRED_MARKETPLACE_COPY_SCENARIOS) {
    if (!kinds.includes(kind)) {
      throw new TypeError(`missing marketplace copy scenario ${kind}`);
    }
  }
  if (new Set(kinds).size !== kinds.length) {
    throw new TypeError("marketplace copy scenarios must be unique");
  }
}

function assertProofModeCoverage(scenarios: readonly MarketplaceTrustCopyScenario[]): void {
  const modes = new Set(scenarios.map((scenario) => scenario.proofMode));
  for (const mode of MARKETPLACE_PROOF_MODES) {
    if (!modes.has(mode)) {
      throw new TypeError(`missing proof mode ${mode}`);
    }
  }
}

function assertPathCoverage(scenarios: readonly MarketplaceTrustCopyScenario[]): void {
  const paths = new Set(scenarios.map((scenario) => scenario.path));
  for (const path of ["happy", "blocked", "stale-or-unknown", "support-handoff"] as const) {
    if (!paths.has(path)) {
      throw new TypeError(`missing marketplace copy path ${path}`);
    }
  }
}

function assertHandoffCoverage(handoffs: readonly MarketplaceTrustHandoff[]): void {
  const owners = handoffs.map((handoff) => handoff.owner);
  for (const owner of HANDOFF_OWNERS) {
    if (!owners.includes(owner)) {
      throw new TypeError(`missing handoff owner ${owner}`);
    }
  }
  if (new Set(owners).size !== owners.length) {
    throw new TypeError("handoff owners must be unique");
  }
}

function assertScopeOut(value: unknown): void {
  const scopeOut = assertStringArray(value, "scopeOut");
  const normalized = scopeOut.join("\n").toLowerCase();
  for (const boundary of REQUIRED_SCOPE_OUT) {
    if (!normalized.includes(boundary.toLowerCase())) {
      throw new TypeError(`scopeOut missing ${boundary}`);
    }
  }
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
  if (entries.length === 0 || entries.some((entry) => entry.trim().length === 0)) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function assertFixtureId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !/^mtc-[a-z0-9-]+-v[0-9]+$/.test(value)) {
    throw new TypeError(`${name} must be a marketplace trust copy fixture id`);
  }
}

function assertScenarioKind(value: unknown): asserts value is MarketplaceScenarioKind {
  if (!REQUIRED_MARKETPLACE_COPY_SCENARIOS.includes(value as MarketplaceScenarioKind)) {
    throw new TypeError(`unknown marketplace copy scenario ${String(value)}`);
  }
}

function assertProofMode(value: unknown): asserts value is MarketplaceProofMode {
  if (!MARKETPLACE_PROOF_MODES.includes(value as MarketplaceProofMode)) {
    throw new TypeError(`unknown proof mode ${String(value)}`);
  }
}

function assertAccessibilityCheck(value: unknown): asserts value is MarketplaceAccessibilityCheck {
  if (!MARKETPLACE_ACCESSIBILITY_CHECKS.includes(value as MarketplaceAccessibilityCheck)) {
    throw new TypeError(`unknown accessibility check ${String(value)}`);
  }
}

function assertHandoffOwner(value: unknown): asserts value is MarketplaceHandoffOwner {
  if (!HANDOFF_OWNERS.includes(value as MarketplaceHandoffOwner)) {
    throw new TypeError(`unknown handoff owner ${String(value)}`);
  }
}

function assertListingState(value: unknown, name: string): asserts value is MarketplaceListingState {
  const states = [
    "not-visible",
    "preview-only",
    "limited-beta",
    "installable",
    "blocked-by-policy",
    "deprecated",
    "yanked",
  ] as const;
  if (!states.includes(value as MarketplaceListingState)) {
    throw new TypeError(`unknown ${name}: ${String(value)}`);
  }
}

function assertPath(value: unknown, name: string): asserts value is MarketplaceCopyPath {
  const paths = ["happy", "blocked", "stale-or-unknown", "support-handoff"] as const;
  if (!paths.includes(value as MarketplaceCopyPath)) {
    throw new TypeError(`unknown ${name}: ${String(value)}`);
  }
}
