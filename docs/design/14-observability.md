# Plan 14 — Observability

> Part of the [HoBo Design Plan Suite](./README.md). HoBo's event-sourced core gives it an observability superpower most platforms lack: **replay-based, time-travel debugging** on top of the usual three pillars.

## Four pillars (three standard + one HoBo-native)
1. **Traces** — OpenTelemetry spans across deploys, workflows, steps, actor messages, and provider calls.
2. **Metrics** — control-plane and data-plane time series.
3. **Logs** — structured, correlated logs (`ctx.log`) streamed live.
4. **Provenance / replay** — the event log itself: every fact, ordered and replayable, so you can reconstruct *exactly* what happened and re-run it. This is the differentiator.

## Tracing
- Every command/event carries `meta.traceparent` (W3C trace context) in its [envelope](./11-event-model.md), so a deploy or a run is one distributed trace from the Gateway through ResourceActors, Executors, and provider APIs.
- `step()` and actor message handlers auto-create spans; provider SDK calls are instrumented in the adapters.
- Export via OTLP to any backend (Tempo/Jaeger/Honeycomb/Datadog) — HoBo emits, it doesn't lock you into a backend.

## The Run Inspector (the marquee view)
Derived purely from `run.*` / `actor.*` / `saga.*` events ([Plan 11](./11-event-model.md)), the inspector shows a workflow/step/actor/saga timeline with, per step: inputs, output, attempts/retries, duration, and the memoized result used on replay. Because it's event-sourced you can:
- **Time-travel:** view state as-of any event; scrub the timeline.
- **Replay/diff:** re-run a workflow against current code and diff the step outcomes (regression hunting).
- **Causality:** follow `causationId`/`correlationId` to see why a step ran.
This mirrors and extends Vercel's run observability, and is the data-plane analog of the deploy timeline.

## Metrics catalog (initial)
**Control plane:** deploy success rate, plan→deployed latency, reconcile loop latency, executor queue depth/saturation, provider error rate (per provider/region/op), circuit-breaker state, drift count, token grants/min.
**Data plane (via the World):** workflow start/complete/fail rates, step retry rates, actor activations/passivations, queue lag, app RED metrics (rate/errors/duration) for `service`/`web`.

## Logs
- `ctx.log` is structured and auto-tagged with `tenant`, `runId`, `resource`, `traceId`.
- Live tail via the World's `streams` (`hobo logs` / dashboard) without waiting for completion; historical logs exported to the tenant's chosen sink.

## SLOs & alerting
- Built-in SLOs (e.g. deploy success rate, control-plane availability from [Plan 5](./05-reliability-ha.md)) with burn-rate alerts.
- Alert routing is a provider capability (`email`/webhook/PagerDuty); high-risk policy gates ([Plan 6](./06-ai-native-agent-auth.md)) can post to the same channels for human approval.

## Observability for agents (closing the loop)
- Agents read the same projections over MCP (`inspect_run`, `tail_logs`, `get_drift`) so an autonomous operator agent can diagnose its own deploy, see why a step failed, and self-correct — the operational analog of Lakebed's "agent discovers the contract."
- The `CredentialAudit` projection answers "what did this agent access, with which token, when?" for security review.

## Cost observability
Ties to [Plan 16](./16-cost-finops.md): the topology graph and run inspector annotate resources/edges with live cost and egress estimates, and budget breaches raise alerts/policy gates.

## Iteration hooks
- Whether HoBo ships a bundled backend (e.g. embedded Grafana/Tempo) for self-host or only emits OTLP.
- Retention/sampling defaults for traces vs the (authoritative, longer-lived) event log.
- How much replay/diff tooling is CLI vs dashboard.
