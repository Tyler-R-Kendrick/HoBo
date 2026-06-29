export const REQUIRED_READINESS_DOMAINS = [
  "reference-architecture",
  "productization",
  "support",
  "legal-privacy",
  "documentation",
  "operations-readiness"
];

export const v1Cutline = {
  schema: "hobo.v1.cutline/2026-06-29",
  issue: "HOBO-401",
  decisionStatus: "m0-scope-and-acceptance",
  inScope: [
    {
      id: "v1-cutline.scope-spine",
      decision: "Write one launch cutline that separates launch-blocking v1 readiness from post-v1 capability growth.",
      ownerProject: "V1 Release Program & Cutline",
      readinessDomain: "reference-architecture",
      blockerCategory: "v1-blocker.reference-architecture",
      evidenceRequired: ["v1 in-scope list", "v1 out-of-scope list", "owner map"],
      citations: [
        "docs/design/README.md#scope",
        "docs/design/adr/07-portability-extensibility.md#adr-0063",
        "docs/design/adr/07-portability-extensibility.md#adr-0064"
      ]
    },
    {
      id: "v1-cutline.productization",
      decision: "Launch-facing productization work is in scope when it proves install, onboarding, project lifecycle, dashboard, plan review, quota, billing, or release-readiness contracts.",
      ownerProject: "Workspace & Onboarding UX",
      readinessDomain: "productization",
      blockerCategory: "v1-blocker.productization",
      evidenceRequired: ["accepted M0 scope", "contract proof path", "explicit unsupported states"],
      citations: [
        "docs/design/architecture.md#plan-10",
        "docs/design/developer-experience.md#plan-07",
        "docs/design/worked-example.md#plan-19"
      ]
    },
    {
      id: "v1-cutline.support",
      decision: "Support readiness is in scope when it defines SLA posture, escalation, break-glass boundaries, status communication, and customer-facing handoff evidence.",
      ownerProject: "V1 Launch Support Desk & Escalation",
      readinessDomain: "support",
      blockerCategory: "v1-blocker.support",
      evidenceRequired: ["severity routing", "first responder path", "support/debug prerequisites"],
      citations: [
        "docs/design/developer-experience.md#plan-07",
        "docs/design/operators-sre.md#plan-40",
        "docs/design/adr/03-data-plane.md#adr-0058"
      ]
    },
    {
      id: "v1-cutline.legal-privacy",
      decision: "Legal, privacy, data inventory, and customer assurance evidence are in scope when they block beta or GA claims.",
      ownerProject: "V1 Legal, Privacy & Terms Readiness",
      readinessDomain: "legal-privacy",
      blockerCategory: "v1-blocker.legal-privacy",
      evidenceRequired: ["owner or owning project", "release blocker vs limitation label", "evidence source"],
      citations: [
        "docs/design/governance-planes.md#plan-46",
        "docs/design/adr/02-identity-security.md#adr-0060",
        "docs/design/adr/02-identity-security.md#adr-0080"
      ]
    },
    {
      id: "v1-cutline.documentation",
      decision: "Launch docs are in scope when they state supported install paths, release notes, upgrade/rollback guidance, known limitations, and claim evidence.",
      ownerProject: "V1 Release Notes & Upgrade Guide",
      readinessDomain: "documentation",
      blockerCategory: "v1-blocker.documentation",
      evidenceRequired: ["source-of-truth owner", "known limitation text", "upgrade and rollback outline"],
      citations: [
        "docs/design/developer-experience.md#plan-07",
        "docs/design/platform-engineering.md#plan-25",
        "docs/design/adr/07-portability-extensibility.md#adr-0062"
      ]
    },
    {
      id: "v1-cutline.operations-readiness",
      decision: "Dogfood, hosted/self-hosted operations, backup/restore, upgrade dry-run, status, and launch smoke evidence are in scope when they prove readiness without live customer dependency.",
      ownerProject: "V1 Dogfood Yard & Hosted Operations",
      readinessDomain: "operations-readiness",
      blockerCategory: "v1-blocker.operations-readiness",
      evidenceRequired: ["scenario fixture", "telemetry evidence", "rollback or recovery path"],
      citations: [
        "docs/design/reliability-observability-cost.md#plan-05",
        "docs/design/platform-engineering.md#plan-25",
        "docs/design/adr/02-identity-security.md#adr-0082"
      ]
    }
  ],
  outOfScope: [
    {
      id: "scope-out.capability-implementation",
      decision: "Do not implement provider, runtime, dashboard, identity, billing, support, or operations capability work in the cutline issue.",
      postV1Disposition: "Create or claim execution issues only after the owning M0 acceptance is approved.",
      citations: [
        "docs/design/README.md#scope",
        "docs/design/adr/07-portability-extensibility.md#adr-0063"
      ]
    },
    {
      id: "scope-out.premature-m1-m4-task-creation",
      decision: "Do not create M1-M4 execution tasks before M0 cutline criteria and owner boundaries are accepted.",
      postV1Disposition: "Fan-out is deferred until M0 scope acceptance is recorded.",
      citations: [
        "docs/design/architecture.md#plan-10",
        "docs/design/adr/07-portability-extensibility.md#adr-0018"
      ]
    },
    {
      id: "scope-out.legal-text",
      decision: "Do not draft final terms, privacy notices, DPA language, or compliance claims without the legal owner supplying or approving text.",
      postV1Disposition: "Track as legal/privacy readiness blocker or explicit launch limitation.",
      citations: [
        "docs/design/governance-planes.md#plan-46",
        "docs/design/adr/02-identity-security.md#adr-0060"
      ]
    },
    {
      id: "scope-out.live-customer-proof",
      decision: "Do not use live customer data or promise production operational proof from dogfood-only fixtures.",
      postV1Disposition: "Require beta/GA evidence before customer-facing claim promotion.",
      citations: [
        "docs/design/adr/02-identity-security.md#adr-0080",
        "docs/design/adr/02-identity-security.md#adr-0082"
      ]
    },
    {
      id: "scope-out.public-claim-without-evidence",
      decision: "Do not publish capability, security, support, legal, or compliance claims that lack a source evidence owner.",
      postV1Disposition: "Move to launch limitation, beta-only caveat, or release-blocker queue.",
      citations: [
        "docs/design/vision.md#plan-17",
        "docs/design/governance-planes.md#plan-46",
        "docs/design/adr/02-identity-security.md#adr-0061"
      ]
    },
    {
      id: "scope-out.production-recovery-claim",
      decision: "Do not claim restore, rollback, or upgrade safety without a deterministic drill or dry-run evidence path.",
      postV1Disposition: "Block GA claim or mark beta limitation until evidence is attached.",
      citations: [
        "docs/design/reliability-observability-cost.md#plan-05",
        "docs/design/adr/02-identity-security.md#adr-0047",
        "docs/design/adr/07-portability-extensibility.md#adr-0042"
      ]
    }
  ],
  blockerCategories: [
    {
      id: "v1-blocker.reference-architecture",
      ownerProject: "V1 Release Program & Cutline",
      ownerInitiative: "Launch cutline",
      readinessDomain: "reference-architecture",
      evidenceRequired: ["in-scope decision", "out-of-scope decision", "ADR/design citation"]
    },
    {
      id: "v1-blocker.productization",
      ownerProject: "Workspace & Onboarding UX",
      ownerInitiative: "Productization M0 acceptance",
      readinessDomain: "productization",
      evidenceRequired: ["persona goal", "UX/service boundary", "contract proof path"]
    },
    {
      id: "v1-blocker.support",
      ownerProject: "V1 Launch Support Desk & Escalation",
      ownerInitiative: "Support readiness",
      readinessDomain: "support",
      evidenceRequired: ["severity route", "handoff owner", "customer communication posture"]
    },
    {
      id: "v1-blocker.legal-privacy",
      ownerProject: "V1 Legal, Privacy & Terms Readiness",
      ownerInitiative: "Customer assurance",
      readinessDomain: "legal-privacy",
      evidenceRequired: ["legal owner", "data class owner", "release blocker or limitation label"]
    },
    {
      id: "v1-blocker.documentation",
      ownerProject: "V1 Release Notes & Upgrade Guide",
      ownerInitiative: "Launch documentation",
      readinessDomain: "documentation",
      evidenceRequired: ["source-of-truth owner", "known limitations", "upgrade/support handoff"]
    },
    {
      id: "v1-blocker.operations-readiness",
      ownerProject: "V1 Dogfood Yard & Hosted Operations",
      ownerInitiative: "Launch operations proof",
      readinessDomain: "operations-readiness",
      evidenceRequired: ["smoke matrix", "telemetry evidence", "recovery path"]
    }
  ],
  followUpTaskPolicy: {
    createdExecutionTasksBeforeM0Acceptance: false,
    allowedBeforeM0Acceptance: ["scope note", "evidence gap", "owner map", "risk classification"],
    blockedBeforeM0Acceptance: ["M1 implementation task", "M2 implementation task", "M3 hardening task", "M4 GA task"]
  }
};

export function validateV1Cutline(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    return { ok: false, errors: ["cutline record is required"] };
  }

  for (const collectionName of ["inScope", "outOfScope", "blockerCategories"]) {
    if (!Array.isArray(record[collectionName]) || record[collectionName].length === 0) {
      errors.push(`${collectionName} must be a non-empty list`);
    }
  }

  for (const item of record.inScope ?? []) {
    if (!item.id || !item.decision || !item.ownerProject) {
      errors.push(`in-scope item ${item.id ?? "<missing>"} must have id, decision, and ownerProject`);
    }
    if (item.workKind === "capability-implementation") {
      errors.push(`${item.id}: capability implementation is scope-out for HOBO-401`);
    }
  }

  for (const item of record.outOfScope ?? []) {
    if (!item.id || !item.decision || !item.postV1Disposition) {
      errors.push(`scope-out item ${item.id ?? "<missing>"} must have id, decision, and postV1Disposition`);
    }
    if (!Array.isArray(item.citations) || item.citations.length === 0) {
      errors.push(`${item.id ?? "<missing>"} must cite design docs or ADRs`);
    }
  }

  const represented = new Set([
    ...(record.inScope ?? []).map((item) => item.readinessDomain),
    ...(record.blockerCategories ?? []).map((item) => item.readinessDomain)
  ]);
  for (const domain of REQUIRED_READINESS_DOMAINS) {
    if (!represented.has(domain)) {
      errors.push(`${domain} readiness domain is not represented`);
    }
  }

  for (const category of record.blockerCategories ?? []) {
    if (!category.id?.startsWith("v1-blocker.")) {
      errors.push(`${category.id ?? "<missing>"} must be a v1-blocker category`);
    }
    if (!category.ownerProject || !category.ownerInitiative) {
      errors.push(`${category.id ?? "<missing>"} must map to ownerProject and ownerInitiative`);
    }
    if (!Array.isArray(category.evidenceRequired) || category.evidenceRequired.length === 0) {
      errors.push(`${category.id ?? "<missing>"} must name required evidence`);
    }
  }

  if (record.followUpTaskPolicy?.createdExecutionTasksBeforeM0Acceptance) {
    errors.push("M1-M4 execution tasks require accepted M0 criteria");
  }

  return { ok: errors.length === 0, errors };
}

export function assertV1Cutline(record = v1Cutline) {
  const result = validateV1Cutline(record);

  if (!result.ok) {
    throw new Error(`v1 cutline contract invalid:\n${result.errors.join("\n")}`);
  }

  return record;
}
