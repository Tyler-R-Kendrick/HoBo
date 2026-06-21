# Plan 14 — Observability

> Part of the [HoBo Design Plan Suite](./README.md). HoBo's event-sourced core gives it an observability superpower most platforms lack: **replay-based, time-travel debugging** on top of the usual three pillars.

> **v2 update.** Cross-WIT-boundary calls (`link.Called` / stub recordings, [Plan 11](./11-event-model.md)) are a first-class trace stream — they drive both the **link/trace dashboard views** ([Plan 7](./07-ui-dashboard.md)) and the AI **implement → auto-evolve → live-fix** loop ([Plan 23](./23-stubbable-ai-implementations.md)).

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
**Data plane (via the Camp's runtime):** workflow start/complete/fail rates, step retry rates, actor activations/passivations, queue lag, app RED metrics (rate/errors/duration) for `service`/`web`.

## Logs
- `ctx.log` is structured and auto-tagged with `tenant`, `runId`, `resource`, `traceId`.
- Live tail via the Camp's runtime `streams` (`hobo logs` / dashboard) without waiting for completion; historical logs exported to the tenant's chosen sink.

## SLOs & alerting
- Built-in SLOs (e.g. deploy success rate, control-plane availability from [Plan 5](./05-reliability-ha.md)) with burn-rate alerts.
- Alert routing is a provider capability (`email`/webhook/PagerDuty); high-risk policy gates ([Plan 6](./06-ai-native-agent-auth.md)) can post to the same channels for human approval.

## Observability for agents (closing the loop)
- Agents read the same projections over MCP (`inspect_run`, `tail_logs`, `get_drift`) so an autonomous operator agent can diagnose its own deploy, see why a step failed, and self-correct — the operational analog of Lakebed's "agent discovers the contract."
- The `CredentialAudit` projection answers "what did this agent access, with which token, when?" for security review.

## Cost observability
Ties to [Plan 16](./16-cost-finops.md): the topology graph and run inspector annotate resources/edges with live cost and egress estimates, and budget breaches raise alerts/policy gates.

## v2 signals (integrated)
- **WIT-boundary call trace** (`link.Called` + stub recordings, [Plan 11](./11-event-model.md)) is a first-class stream: it drives the dashboard **link map + trace views** ([Plan 7](./07-ui-dashboard.md)) and is the **test oracle** for AI implement → auto-evolve → live-fix ([Plan 23](./23-stubbable-ai-implementations.md)).
- **Catalog additions.** Control plane: IfC-collection metrics (resources/links per manifest), Forge generation/certification rates. Data plane: **wasm runtime** metrics — component cold-start, instances per host (density), link call latency/error rate per `(import, provider)`.

## v5 signals — AI-method telemetry & training capture (integrated)
`"use training"` semantic functions ([Plan 23](./23-stubbable-ai-implementations.md)) need richer, AI-shaped telemetry than RED metrics, so HoBo layers **[OpenInference](https://github.com/Arize-ai/openinference) semantic conventions on top of OTel**:
- **OpenInference spans** — every trainable-method (and agent/LLM/tool/retriever) call emits an OpenInference span (inputs, outputs, messages, token counts, model, latency) as a child of the same W3C trace as the enclosing run/deploy. OpenInference is OTel-native and transport-agnostic, so these export to the tenant's own backend (Phoenix/Tempo/Datadog) **and** feed HoBo's trajectory store — one emit, no lock-in.
- **Trajectory = training data.** The span tree for one invocation + I/O + the **reward** attached by live-evals + run/agent correlation is a *trajectory* — the unit the `training-engine` consumes ([Plan 23](./23-stubbable-ai-implementations.md)). Trajectories ride the event log, so training is replayable and auditable. Sensitive payloads are per-run encrypted ([Plan 12](./12-security-multitenancy.md)).
- **Live-evals as a telemetry stream.** Rubric scores computed online on live/shadow traffic (quality/faithfulness/calibration/cost/latency) are first-class metrics: they drive champion-vs-challenger dashboards, raise drift alerts/SLO burn on a champion regression, and *are* the optimizer's objective. `eval.Ran`/`eval.GateFailed` are events ([Plan 11](./11-event-model.md)).
- **Metrics-catalog additions.** Per trainable method: invocation rate, eval scores (per rubric dimension), champion/challenger deltas, token/cost per call, shadow-traffic share, candidate-proposed/promoted/rejected counts, time-since-last-promotion.

## Iteration hooks
- Whether HoBo ships a bundled backend (e.g. embedded Grafana/Tempo) for self-host or only emits OTLP.
- OpenInference span-attribute retention vs sampling, and the online-eval (LLM-judge) sampling rate / cost ceiling.
- Retention/sampling defaults for traces vs the (authoritative, longer-lived) event log.
- How much replay/diff tooling is CLI vs dashboard.
