# ADR-0046 — Boundary standards: CloudEvents, OCSF & OTLP

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 11 — Event model](../11-event-model.md) (`EventEnvelope`) · [Plan 12 — Security](../12-security-multitenancy.md) (audit log) · [Plan 14 — Observability](../14-observability.md) (OTel/OpenInference) · [CloudEvents](../../../standards/cloudevents.md) · [OCSF](../../../standards/ocsf.md) · [OTel/OTLP/GenAI/OpenInference](../../../standards/otel-otlp-genai-openinference.md) · open question [#27](../09-verification-open-questions.md)
- **Origin:** the ecosystem review found HoBo OTel/OpenInference-native but its event envelope wasn't **CloudEvents**-compatible at the boundary, and the audit log wasn't normalized to **OCSF** for SIEM.

## Context
HoBo's internal source of truth is its rich `EventEnvelope` ([Plan 11](../11-event-model.md)) — and that should stay HoBo-native (it carries `seq`/`streamId`/`causationId`/fencing/idempotency that CloudEvents doesn't). But at its **boundaries** — exporting events to external consumers, shipping audit data to a SIEM, emitting telemetry — speaking the relevant open standards avoids lock-in and integration friction. HoBo already speaks **OTel/OpenInference** ([Plan 14](../14-observability.md)); the gaps are **CloudEvents** (event export) and **OCSF** (security/audit normalization), plus confirming **OTLP-native** export.

## Decision
1. **Internal envelope stays native; export is CloudEvents-compatible.** The internal `EventEnvelope` is unchanged (it's a superset). At the **export boundary** (webhooks, external subscribers, the GitOps/Pipelines triggers [Plan 28](../28-relay-gitops-pipelines.md)), HoBo emits **[CloudEvents](../../../standards/cloudevents.md)** — a deterministic mapping (`type`→`type`, `id`→`id`, `streamId`→`source`+`subject`, `ts`→`time`, `data`→`data`, with HoBo-specific fields as CloudEvents **extensions**). Internal HoBo→HoBo stays native; only the external surface is CloudEvents.
2. **Audit log exports to OCSF.** Security-relevant events (`token.*`, `identity.*`, `policy.Decided`, `domain.Cert*`, `registry.BundleImported`, `flag.Changed`, …) map to **[OCSF](../../../standards/ocsf.md)** classes (Authentication, Authorization/Entitlement, Configuration/Change, etc.) for export to a SIEM — a projection/exporter over the existing audit streams ([Plan 12](../12-security-multitenancy.md)), not a change to how HoBo stores them.
3. **OTLP-native telemetry, confirmed.** Telemetry (metrics/traces/logs incl. OpenInference AI spans) exports over **OTLP** to the tenant's backend ([Plan 14](../14-observability.md)) — already the design; this ADR pins it as the committed wire format so there's no proprietary telemetry path.
4. **All three are boundary mappings behind exporters**, not model changes — HoBo's event-sourced core is untouched; the standards are how it *speaks to the outside*.

## Alternatives considered
- **Make the internal `EventEnvelope` literally CloudEvents.** Rejected: CloudEvents lacks `seq`/optimistic-concurrency/fencing/causation semantics HoBo's replay + audit depend on; map at the boundary instead, keeping the superset internally.
- **Proprietary audit/event/telemetry formats.** Rejected: lock-in + integration friction; speaking CloudEvents/OCSF/OTLP is the boundary-standards stance and a security/compliance selling point.
- **Skip OCSF (just ship raw audit).** Rejected: enterprises run SIEMs that ingest OCSF; a normalized export is high-value and cheap (a projection).

## Consequences
- **(+)** Closes #27: HoBo interoperates at its boundaries (CloudEvents subscribers, OCSF SIEMs, OTLP backends) without a proprietary format, while keeping its richer internal model.
- **(+)** All three are **exporters/projections** over the existing log — minimal new machinery, no core change, and they compose with the existing event catalog ([Plan 11](../11-event-model.md)).
- **(+)** OCSF audit export strengthens the enterprise/regulated story alongside air-gap ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)) and the credential audit ([Plan 6](../06-ai-native-agent-auth.md)).
- **(−)** Boundary mappings must be maintained as the standards evolve (CloudEvents/OCSF versioning) and as HoBo's event catalog grows — an ongoing mapping-fidelity cost.
