export const resilienceSemanticsSpec = Object.freeze({
  version: "hobo.sdk.resilience-semantics-annex/v1",
  suite: "@hobo/conformance/sdk/resilience-semantics-annex",
  cases: Object.freeze([
    "transient-retry-schedule",
    "denial-never-retries",
    "terminal-never-retries",
    "cancellation-stops-retry",
    "deadline-escalates-from-state",
    "cleanup-after-interruption",
    "replay-no-effect-rerun",
  ]),
});

export const canonicalResilienceFixtures = Object.freeze([
  freezeFixture({
    name: "transient-retry-schedule",
    assertions: ["transient-retry-schedule"],
    retryPlan: { delayMs: [100, 250], maxAttempts: 3 },
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 10 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 100, atMs: 110 },
      { type: "effect.Attempted", attempt: 2, atMs: 110 },
      { type: "provider.Failed", failure: "transient", attempt: 2, atMs: 120 },
      { type: "retry.Scheduled", attempt: 3, delayMs: 250, atMs: 370 },
      { type: "effect.Attempted", attempt: 3, atMs: 370 },
      { type: "effect.Succeeded", attempt: 3, atMs: 380 },
    ],
  }),
  freezeFixture({
    name: "denial-never-retries",
    assertions: ["denial-never-retries"],
    facts: [
      { type: "policy.Decided", allow: false, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 1 },
      { type: "workflow.Terminal", reason: "policy-denied", atMs: 2 },
    ],
  }),
  freezeFixture({
    name: "terminal-never-retries",
    assertions: ["terminal-never-retries"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "sdk.Failed", failure: "terminal", reason: "invalid-request", atMs: 1 },
      { type: "workflow.Terminal", reason: "terminal-failure", atMs: 2 },
    ],
  }),
  freezeFixture({
    name: "cancellation-stops-retry",
    assertions: ["cancellation-stops-retry"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 10 },
      { type: "caller.Cancelled", reason: "caller-owned", atMs: 20 },
      { type: "cleanup.Emitted", reason: "caller-cancelled", atMs: 21 },
      { type: "workflow.Terminal", reason: "cancelled", atMs: 22 },
    ],
  }),
  freezeFixture({
    name: "deadline-escalates-from-state",
    assertions: ["deadline-escalates-from-state"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 10 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 500, atMs: 510 },
      { type: "deadline.Expired", deadlineMs: 400, atMs: 400 },
      { type: "workflow.Escalated", reason: "deadline-expired", atMs: 401 },
    ],
  }),
  freezeFixture({
    name: "cleanup-after-interruption",
    assertions: ["cleanup-after-interruption"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "caller.Cancelled", reason: "caller-owned", atMs: 12 },
      { type: "cleanup.Emitted", reason: "caller-cancelled", atMs: 13 },
      { type: "cleanup.Audited", status: "released", atMs: 14 },
    ],
  }),
  freezeFixture({
    name: "replay-no-effect-rerun",
    assertions: ["replay-no-effect-rerun"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "effect.Succeeded", attempt: 1, atMs: 1 },
      { type: "inspection.Replayed", effectCounterBefore: 1, effectCounterAfter: 1, atMs: 200 },
      { type: "inspection.TerminalState", state: "succeeded", source: "persisted-facts", atMs: 201 },
    ],
  }),
]);

export const badResilienceFixtures = Object.freeze([
  freezeFixture({
    name: "bad-retrying-denial",
    assertions: ["denial-never-retries"],
    facts: [
      { type: "policy.Decided", allow: false, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 1 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 100, atMs: 101 },
    ],
  }),
  freezeFixture({
    name: "bad-retrying-terminal",
    assertions: ["terminal-never-retries"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "sdk.Failed", failure: "terminal", reason: "invalid-request", atMs: 1 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 100, atMs: 101 },
    ],
  }),
  freezeFixture({
    name: "bad-hidden-cancellation-retry",
    assertions: ["cancellation-stops-retry"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "caller.Cancelled", reason: "caller-owned", atMs: 10 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 100, atMs: 110 },
      { type: "cleanup.Emitted", reason: "caller-cancelled", atMs: 111 },
    ],
  }),
  freezeFixture({
    name: "bad-missed-deadline-escalation",
    assertions: ["deadline-escalates-from-state"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "provider.Failed", failure: "transient", attempt: 1, atMs: 10 },
      { type: "retry.Scheduled", attempt: 2, delayMs: 500, atMs: 510 },
      { type: "deadline.Expired", deadlineMs: 400, atMs: 400 },
    ],
  }),
  freezeFixture({
    name: "bad-skipped-cleanup",
    assertions: ["cleanup-after-interruption"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "caller.Cancelled", reason: "caller-owned", atMs: 12 },
      { type: "cleanup.Audited", status: "missing", atMs: 13 },
    ],
  }),
  freezeFixture({
    name: "bad-replay-reruns-effects",
    assertions: ["replay-no-effect-rerun"],
    facts: [
      { type: "effect.Attempted", attempt: 1, atMs: 0 },
      { type: "effect.Succeeded", attempt: 1, atMs: 1 },
      { type: "inspection.Replayed", effectCounterBefore: 1, effectCounterAfter: 2, atMs: 200 },
      { type: "inspection.TerminalState", state: "succeeded", source: "persisted-facts", atMs: 201 },
    ],
  }),
]);

const unsupportedBehavior = Object.freeze([
  "No Effect dependency or public scheduler API.",
  "No XState dependency or generic statechart runtime.",
  "No production @hobo/conformance package mutation in this proof.",
]);

export function runResilienceSemanticsAnnex(fixtures = canonicalResilienceFixtures) {
  const cases = fixtures.map(runResilienceCase);
  const status = cases.every((entry) => entry.status === "passed") ? "passed" : "failed";

  return {
    suite: resilienceSemanticsSpec.suite,
    specVersion: resilienceSemanticsSpec.version,
    status,
    goldenIrLane: {
      status: "not-owned",
      source: "HOBO-32 sdk-idiom-conformance-gate",
    },
    existingSemanticsLane: {
      status: "referenced",
      source: "HOBO-31 idiom-semantics-annex",
    },
    resilienceSemanticsLane: {
      status,
      cases,
    },
    unsupportedBehavior: [...unsupportedBehavior],
  };
}

export function runResilienceCase(fixture) {
  const failure = validateFixture(fixture);
  return {
    name: fixture.name,
    category: "resilienceSemanticsLane",
    status: failure ? "failed" : "passed",
    code: failure?.code,
    reason: failure?.reason,
  };
}

function validateFixture(fixture) {
  const facts = sortFacts(fixture.facts);

  for (const assertion of fixture.assertions) {
    const failure = validateAssertion(assertion, fixture, facts);
    if (failure) {
      return failure;
    }
  }

  return null;
}

function validateAssertion(assertion, fixture, facts) {
  if (assertion === "transient-retry-schedule") {
    return validateTransientRetrySchedule(fixture, facts);
  }
  if (assertion === "denial-never-retries") {
    return validateDenialNeverRetries(facts);
  }
  if (assertion === "terminal-never-retries") {
    return validateTerminalNeverRetries(facts);
  }
  if (assertion === "cancellation-stops-retry") {
    return validateCancellationStopsRetry(facts);
  }
  if (assertion === "deadline-escalates-from-state") {
    return validateDeadlineEscalates(facts);
  }
  if (assertion === "cleanup-after-interruption") {
    return validateCleanupAfterInterruption(facts);
  }
  if (assertion === "replay-no-effect-rerun") {
    return validateReplayNoEffectRerun(facts);
  }

  return fail("resilience.unknown_assertion", `unknown assertion: ${assertion}`);
}

function validateTransientRetrySchedule(fixture, facts) {
  const transientFailures = facts.filter((fact) => fact.type === "provider.Failed" && fact.failure === "transient");
  const scheduledRetries = facts.filter((fact) => fact.type === "retry.Scheduled");

  if (transientFailures.length === 0) {
    return fail("resilience.transient_missing", "transient retry fixture has no transient failure");
  }

  const expectedDelays = fixture.retryPlan?.delayMs?.slice(0, transientFailures.length) ?? [];
  const actualDelays = scheduledRetries.map((fact) => fact.delayMs);
  if (canonicalJson(actualDelays) !== canonicalJson(expectedDelays)) {
    return fail("resilience.retry_schedule_unstable", "retry schedule does not match deterministic delay plan");
  }

  if (scheduledRetries.some((fact) => fact.atMs !== priorFailureAt(facts, fact.attempt - 1) + fact.delayMs)) {
    return fail("resilience.retry_schedule_unstable", "retry schedule is not derived from persisted failure time");
  }

  if (scheduledRetries.length + 1 > fixture.retryPlan.maxAttempts) {
    return fail("resilience.retry_budget_exceeded", "retry schedule exceeds stable retry budget");
  }

  return null;
}

function validateDenialNeverRetries(facts) {
  const denial = facts.find((fact) => fact.type === "policy.Decided" && fact.allow === false);
  if (!denial) {
    return fail("resilience.denial_missing", "denial fixture has no policy.Decided deny fact");
  }
  if (hasRetryAfter(facts, denial.atMs)) {
    return fail("resilience.denial_retried", "policy denial was retried");
  }
  if (!facts.some((fact) => fact.type === "workflow.Terminal" && fact.reason === "policy-denied")) {
    return fail("resilience.denial_not_terminal", "policy denial did not record terminal state");
  }
  return null;
}

function validateTerminalNeverRetries(facts) {
  const terminalFailure = facts.find((fact) => fact.type === "sdk.Failed" && fact.failure === "terminal");
  if (!terminalFailure) {
    return fail("resilience.terminal_missing", "terminal fixture has no typed terminal failure");
  }
  if (hasRetryAfter(facts, terminalFailure.atMs)) {
    return fail("resilience.terminal_retried", "terminal failure was retried");
  }
  if (!facts.some((fact) => fact.type === "workflow.Terminal" && fact.reason === "terminal-failure")) {
    return fail("resilience.terminal_not_recorded", "terminal failure did not record terminal state");
  }
  return null;
}

function validateCancellationStopsRetry(facts) {
  const cancellation = facts.find((fact) => fact.type === "caller.Cancelled");
  if (!cancellation) {
    return fail("resilience.cancellation_missing", "cancellation fixture has no caller cancellation fact");
  }
  if (hasRetryAfter(facts, cancellation.atMs)) {
    return fail("resilience.cancellation_retried", "caller cancellation was hidden as retry work");
  }
  if (!hasCleanupAfter(facts, cancellation.atMs)) {
    return fail("resilience.cleanup_missing", "caller cancellation did not emit cleanup facts");
  }
  return null;
}

function validateDeadlineEscalates(facts) {
  const deadline = facts.find((fact) => fact.type === "deadline.Expired");
  if (!deadline) {
    return fail("resilience.deadline_missing", "deadline fixture has no persisted deadline expiration fact");
  }

  const escalation = facts.find(
    (fact) => fact.type === "workflow.Escalated" && fact.reason === "deadline-expired" && fact.atMs >= deadline.atMs,
  );
  if (!escalation) {
    return fail("resilience.deadline_not_escalated", "deadline expiry did not escalate from persisted state");
  }

  return null;
}

function validateCleanupAfterInterruption(facts) {
  const interruption = facts.find((fact) => fact.type === "caller.Cancelled" || fact.type === "deadline.Expired");
  if (!interruption) {
    return fail("resilience.interruption_missing", "cleanup fixture has no interruption fact");
  }
  if (!hasCleanupAfter(facts, interruption.atMs)) {
    return fail("resilience.cleanup_missing", "interruption did not emit cleanup/finalizer facts");
  }
  if (!facts.some((fact) => fact.type === "cleanup.Audited" && fact.atMs >= interruption.atMs)) {
    return fail("resilience.cleanup_not_audited", "cleanup did not emit an audit fact");
  }
  return null;
}

function validateReplayNoEffectRerun(facts) {
  const replay = facts.find((fact) => fact.type === "inspection.Replayed");
  if (!replay) {
    return fail("resilience.replay_missing", "replay fixture has no replay inspection fact");
  }
  if (replay.effectCounterBefore !== replay.effectCounterAfter) {
    return fail("resilience.replay_reran_effect", "replay incremented effect counters");
  }
  if (facts.some((fact) => fact.type === "effect.Attempted" && fact.mode === "replay")) {
    return fail("resilience.replay_reran_effect", "replay recorded a fresh effect attempt");
  }
  if (!facts.some((fact) => fact.type === "inspection.TerminalState" && fact.source === "persisted-facts")) {
    return fail("resilience.replay_not_persisted", "replay inspection was not derived from persisted facts");
  }
  return null;
}

function hasRetryAfter(facts, atMs) {
  return facts.some((fact) => fact.type === "retry.Scheduled" && fact.atMs > atMs);
}

function hasCleanupAfter(facts, atMs) {
  return facts.some((fact) => fact.type === "cleanup.Emitted" && fact.atMs >= atMs);
}

function priorFailureAt(facts, attempt) {
  const failure = facts.find(
    (fact) =>
      (fact.type === "provider.Failed" || fact.type === "sdk.Failed") &&
      fact.attempt === attempt,
  );
  return failure?.atMs;
}

function sortFacts(facts) {
  return [...facts].sort((left, right) => left.atMs - right.atMs || left.type.localeCompare(right.type));
}

function fail(code, reason) {
  return { code, reason };
}

function freezeFixture(fixture) {
  return Object.freeze({
    ...fixture,
    assertions: Object.freeze([...fixture.assertions]),
    retryPlan: fixture.retryPlan ? Object.freeze({ ...fixture.retryPlan, delayMs: Object.freeze([...fixture.retryPlan.delayMs]) }) : undefined,
    facts: Object.freeze(fixture.facts.map((fact) => Object.freeze({ ...fact }))),
  });
}

function canonicalJson(value) {
  return JSON.stringify(value);
}
