# Performance & Load Tests Scope And Acceptance

Source issue: HOBO-440.

Executable proof lives in
[`src/draft/performance-load-tests-scope-contract`](../../src/draft/performance-load-tests-scope-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-440-performance-load-tests`](./proofs/hobo-440-performance-load-tests/README.md).

## M0 Acceptance Record

Performance & Load Tests exists to define which launch-readiness workload scenarios, capacity
envelopes, thresholds, abort rules, evidence records, and owner handoffs are required before HoBo
can claim beta, release-candidate, or GA performance confidence. It is not the load runner, a live
provider stress lane, a benchmark lab, an autoscaling implementation, or a release decision.

## User And Business Goal

HoBo needs accepted M0 scope for Performance & Load Tests before downstream load automation,
capacity evidence, SLO tuning, provider exercises, support artifacts, or release-cutline work can
depend on it. The accepted record must say who the tests serve, which evidence dimensions every
scenario carries, how gaps route, which adjacent projects own implementation, and which M1 proof
assets must exist before M2+ automation work fans out.

## Primary Personas

| Persona | Need |
|---|---|
| Release owner | Know which performance evidence gates beta, release-candidate, and GA readiness and which gaps block launch claims. |
| Platform engineer | Understand workload models, fixture boundaries, and capacity envelopes before building load-test automation. |
| SRE operator | Map latency, saturation, SLO burn, abort, and rollback evidence into operational launch decisions. |
| FinOps reviewer | See expected-load and capacity assumptions without turning this M0 issue into cost-routing or billing work. |
| Support operator | Receive retained evidence, limitation notes, and owner handoffs for performance incidents and customer questions. |

## Scope In

- Define the M0 Performance & Load Tests product scope, accepted personas, and launch-readiness
  goal.
- Define mandatory scenario dimensions: journey, workload model, expected load, environment,
  fixture data, mocked/live boundary, measured signal, capacity envelope, pass threshold, fail
  threshold, abort rule, owner, and release phase.
- Define service, UX, security, and support boundaries for performance evidence without building
  the load-test execution system.
- Define M1-ready evidence for scenario inventory, workload model fixture, capacity envelope
  schema, threshold and abort policy, and evidence retention/support handoff.
- Define follow-up gate rules so M1/M2/M3/M4 performance automation, CI lanes, provider exercises,
  SLO tuning, and support artifacts wait for accepted M0 scope.

## Scope Out And Non-Goals

- Do not build a load runner, benchmark lab, browser performance lab, or CI execution lane.
- Do not run live provider stress tests, production load, real cloud mutations, or autoscaling
  implementation work.
- Do not build chaos experiment orchestration, resilience drill execution, or the full Golden Suite.
- Do not make beta, release-candidate, or GA go/no-go decisions.
- Do not implement provider pricing, billing, Dispatcher/CreditLedger routing, or entitlement
  enforcement.
- Do not create downstream M1-M4 execution issues before M0 scope is accepted.

## Service, UX, Security, And Support Boundaries

| Boundary | Rule |
|---|---|
| Service | Performance & Load Tests defines accepted scenarios, workload models, thresholds, evidence fields, and owners; service teams own the later runner, CI lane, provider fixtures, and persistence. |
| UX | UX scope is limited to evidence fields needed by launch status, plan review, and diagnostics; product screens, dashboards, and visual performance reports are outside M0. |
| Security | Performance evidence must preserve tenant isolation, redaction, safe synthetic data, and no-secret load logs; scanners, policy gates, and vulnerability handling stay in Security Verification. |
| Support | Support receives retained run evidence, limitation notes, abort reasons, and owner handoffs; ticket routing, SLA promises, and incident communication execution remain separate. |

## Required Scenario Dimensions

| Dimension | Meaning |
|---|---|
| Journey | The named beta, release-candidate, or GA path whose performance confidence depends on the scenario. |
| Workload model | The deterministic shape of concurrency, rate, duration, data size, and operation mix. |
| Expected load | The accepted load level for this phase; not a customer-visible capacity promise by itself. |
| Environment | The local, staged, release-candidate, SaaS, self-host, or fixture-backed context for evidence. |
| Fixture data | Synthetic inputs used by the scenario, with tenant and secret-safety boundaries. |
| Mocked/live boundary | The explicit split between simulated, fixture-backed, and live dependencies. |
| Measured signal | Latency, saturation, throughput, error rate, SLO burn, resource pressure, or cost signal. |
| Capacity envelope | The accepted upper and lower assumptions for load, duration, resources, and abort conditions. |
| Pass threshold | The evidence required for the scenario to count as accepted performance evidence. |
| Fail threshold | The condition that blocks launch confidence or routes to follow-up. |
| Abort rule | The condition that stops the test to protect shared systems, cost, or evidence quality. |
| Owner | The project or role responsible for evidence quality and gap routing. |
| Release phase | Whether the row matters for beta, release-candidate, GA, or post-GA. |

## Authoritative Dependencies

- [reliability-observability-cost.md#plan-05](./reliability-observability-cost.md#plan-05)
  defines SLOs, error-budget gates, observability signals, capacity targets, and cost visibility
  consumed by performance evidence.
- [e2e-test-matrix.md](./e2e-test-matrix.md) defines launch journey rows and fixture boundaries
  that performance scenarios extend with expected-load evidence.
- [launch-e2e-persona-matrix.md](./launch-e2e-persona-matrix.md) defines persona journey
  thresholds that later performance rows must not silently weaken or override.
- [pre-launch-outcome-contract.md](./pre-launch-outcome-contract.md) defines outcome and safe-test
  evidence that performance/load claims compare against before launch.
- [ADR-0045](./adr/02-identity-security.md#adr-0045) pins SLO-as-code and error-budget gating as
  the reliability contract behind performance thresholds.
- [ADR-0082](./adr/02-identity-security.md#adr-0082) pins Golden Suites and A2H handoff so load
  evidence can fail closed without becoming a launch bypass.

## Owning Initiative Dependencies

| Owner | Consumes from Performance & Load Tests | Boundary |
|---|---|---|
| Performance & Load Tests | Accepted scenario dimensions, capacity evidence checklist, threshold policy, and follow-up gate. | This issue defines scope and acceptance; it does not build the performance runner. |
| E2E Test Matrix | Journey, persona, fixture, mocked/live boundary, owner, and release-phase rows. | E2E journey inventory remains the owner of end-to-end row coverage. |
| V1 Release Program & Cutline | Performance evidence state, known gaps, and accepted limitations in beta/RC/GA decisions. | Release go/no-go and accepted-risk workflows remain release-program scope. |
| Reliability, Observability & Cost | SLO, latency, saturation, burn-rate, and capacity signal semantics. | Telemetry pipelines, SLO computation engines, budgets, and alerting stay in reliability/FinOps scope. |
| Support Workflow | Retained evidence, abort reasons, and owner handoffs for performance incidents and customer questions. | Support queues, SLA commitments, escalation, and customer communication execution stay in Support Workflow. |
| Security Verification | Safe synthetic data, tenant isolation, redaction, and secret-free evidence requirements. | Security scanners, policy engines, and vulnerability handling stay in Security Verification. |

## Evidence Required For M1

| Evidence | Owner | Proof mode | Proves |
|---|---|---|---|
| Scenario inventory | Performance & Load Tests | Design record | Every launch-relevant journey names expected load, measured signal, thresholds, owner, and release phase. |
| Workload model fixture | Platform engineering | Reference fixture | Synthetic workload inputs are deterministic, tenant-safe, and explicit about mocked/live boundaries. |
| Capacity envelope schema | SRE operator | Contract test | Capacity evidence has stable fields for load, duration, saturation, latency, error budget, and abort state. |
| Threshold and abort policy | Reliability, Observability & Cost | Contract test | Threshold breaches fail closed, preserve raw evidence, and route to owner review instead of silent pass. |
| Evidence retention and support handoff | Support Workflow | Support handoff | Support can explain load-test state, limitations, and next owner without owning the runner implementation. |

## Gap Routing

| Gap | Owner |
|---|---|
| Journey, persona, expected-load row, fixture row, or matrix metadata missing | E2E Test Matrix |
| SLO, burn-rate, latency, saturation, capacity, threshold, or observability signal missing | Reliability, Observability & Cost |
| Evidence retention, support handoff, customer-safe limitation, or abort explanation missing | Support Workflow |
| Tenant isolation, redaction, synthetic data, no-secret log, or security review missing | Security Verification |
| Release-phase disposition, accepted-risk note, or cutline decision missing | V1 Release Program & Cutline |
| Unknown workload owner or uncategorized performance gap | Performance & Load Tests |

## Follow-Up Gate

M1/M2/M3/M4 performance automation, CI lanes, provider exercises, SLO tuning, capacity dashboard,
and support follow-ups must wait until this M0 scope record is accepted. This branch records the
gate and its executable guard; it does not create follow-up implementation issues.
