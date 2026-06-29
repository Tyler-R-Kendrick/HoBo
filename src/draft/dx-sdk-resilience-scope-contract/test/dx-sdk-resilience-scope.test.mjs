import assert from "node:assert/strict";
import test from "node:test";

import {
  DX_SDK_RESILIENCE_SCOPE_CONTRACT,
  classifyScopeProposal,
  findVectorOwner,
  resolveResilienceOutcome,
  validateDxSdkResilienceScope,
  validateInspectionSource,
} from "../src/dx-sdk-resilience-scope.mjs";

test("HOBO-514 parent scope has concrete M0 acceptance, design refs, and initiatives", () => {
  const result = validateDxSdkResilienceScope(DX_SDK_RESILIENCE_SCOPE_CONTRACT);

  assert.deepEqual(result.errors, []);
  assert.equal(DX_SDK_RESILIENCE_SCOPE_CONTRACT.issue, "HOBO-514");
  assert.equal(DX_SDK_RESILIENCE_SCOPE_CONTRACT.phase, "M0");
  assert.equal(DX_SDK_RESILIENCE_SCOPE_CONTRACT.treatedAsConcreteBlocker, true);
  assert.ok(DX_SDK_RESILIENCE_SCOPE_CONTRACT.labels.includes("epic"));
  assert.deepEqual(DX_SDK_RESILIENCE_SCOPE_CONTRACT.initiatives, [
    "Testing, Verification & Launch Quality",
    "Developer Authoring & Agent Entry Points",
    "HoBo v1 Release Readiness",
  ]);
  assert.ok(DX_SDK_RESILIENCE_SCOPE_CONTRACT.designRefs.includes("docs/design/README.md"));
  assert.ok(
    DX_SDK_RESILIENCE_SCOPE_CONTRACT.designRefs.includes(
      "docs/design/dx-sdk-resilience-semantics.md",
    ),
  );
  assert.ok(DX_SDK_RESILIENCE_SCOPE_CONTRACT.designRefs.includes("docs/design/sdk-contracts.md"));
});

test("child issue matrix spans M0 through M4 and carries branch-sized context", () => {
  assert.deepEqual(
    [...new Set(DX_SDK_RESILIENCE_SCOPE_CONTRACT.childIssues.map((issue) => issue.phase))].sort(),
    ["M0", "M1", "M2", "M3", "M4"],
  );
  assert.deepEqual(
    DX_SDK_RESILIENCE_SCOPE_CONTRACT.childIssues.map((issue) => issue.id),
    ["HOBO-515", "HOBO-516", "HOBO-517", "HOBO-518", "HOBO-519", "HOBO-520"],
  );

  for (const child of DX_SDK_RESILIENCE_SCOPE_CONTRACT.childIssues) {
    assert.equal(child.branchSized, true, `${child.id} must be branch-sized`);
    assert.ok(child.targetPath, `${child.id} target path`);
    assert.ok(child.scopeIn.length > 0, `${child.id} scope in`);
    assert.ok(child.scopeOut.length > 0, `${child.id} scope out`);
    assert.ok(child.acceptance.length > 0, `${child.id} acceptance`);
    assert.ok(child.adversarialChecks.length > 0, `${child.id} adversarial`);
    assert.ok(child.verificationCommands.length > 0, `${child.id} commands`);
  }
});

test("SDK-facing vocabulary names every resilience semantic before helpers are exposed", () => {
  assert.deepEqual(DX_SDK_RESILIENCE_SCOPE_CONTRACT.vocabulary, [
    "transient",
    "terminal",
    "denied",
    "cancelled",
    "deadline-exceeded",
    "retry-scheduled",
    "cleanup-applied",
    "lifecycle-transition",
    "illegal-transition",
    "inspection-event",
  ]);
  assert.deepEqual(findVectorOwner("resilience categories"), {
    supported: true,
    issue: "HOBO-517",
    phase: "M2",
  });
  assert.deepEqual(findVectorOwner("polished hosted inspector"), { supported: false });
});

test("scope classifier rejects public dependencies, engine creep, and false semantic claims", () => {
  assert.deepEqual(classifyScopeProposal("Add public Effect dependency to SDK helpers."), {
    allowed: false,
    label: "public framework dependency",
  });
  assert.deepEqual(classifyScopeProposal("Build generic statechart runtime for all actors."), {
    allowed: false,
    label: "generic runtime engine",
  });
  assert.deepEqual(
    classifyScopeProposal("Retry policy.Decided allow:false after transient provider failure."),
    {
      allowed: false,
      label: "retry after denial",
    },
  );
  assert.deepEqual(
    classifyScopeProposal("Treat cancellation as hidden retry in the background."),
    {
      allowed: false,
      label: "hidden cancellation retry",
    },
  );
  assert.deepEqual(
    classifyScopeProposal("Expose in-memory actor snapshot as authoritative inspection diagnostic."),
    {
      allowed: false,
      label: "in-memory inspection",
    },
  );
  assert.deepEqual(
    classifyScopeProposal("Golden IR success is sufficient to prove retry semantics."),
    {
      allowed: false,
      label: "golden IR only",
    },
  );
  assert.equal(classifyScopeProposal("Record child issue verification commands.").allowed, true);
});

test("denial, cancellation, deadline, terminal, and transient outcomes resolve with stable precedence", () => {
  assert.deepEqual(
    resolveResilienceOutcome([
      { type: "sdk.TransientFailure", deterministicSchedule: true },
      { type: "policy.Decided", allow: false, reason: "deny-ceiling" },
    ]),
    {
      terminal: true,
      retryAllowed: false,
      outcome: "denied",
      reason: "deny-ceiling",
    },
  );

  assert.deepEqual(resolveResilienceOutcome([{ type: "sdk.Cancelled" }]), {
    terminal: true,
    retryAllowed: false,
    outcome: "cancelled",
    cleanupRequired: true,
  });

  assert.deepEqual(resolveResilienceOutcome([{ type: "sdk.DeadlineExceeded", persisted: true }]), {
    terminal: true,
    retryAllowed: false,
    outcome: "deadline-exceeded",
    escalationRequired: true,
  });

  assert.deepEqual(resolveResilienceOutcome([{ type: "sdk.TerminalFailure" }]), {
    terminal: true,
    retryAllowed: false,
    outcome: "terminal",
  });

  assert.deepEqual(
    resolveResilienceOutcome([{ type: "sdk.TransientFailure", deterministicSchedule: true }]),
    {
      terminal: false,
      retryAllowed: true,
      outcome: "retry-scheduled",
    },
  );
});

test("inspection must derive from replayable event facts instead of process memory", () => {
  assert.deepEqual(validateInspectionSource(), {
    ok: false,
    reason: "inspection requires replayable event facts",
  });
  assert.deepEqual(
    validateInspectionSource({
      eventFacts: [{ type: "inspection-event", sequence: 1 }],
      memorySnapshots: [{ state: "running" }],
    }),
    {
      ok: false,
      reason: "process memory cannot be authoritative inspection state",
    },
  );
  assert.deepEqual(
    validateInspectionSource({
      eventFacts: [{ type: "inspection-event", sequence: 1 }],
    }),
    {
      ok: true,
      reason: "inspection derives from replayable event facts",
    },
  );
});
