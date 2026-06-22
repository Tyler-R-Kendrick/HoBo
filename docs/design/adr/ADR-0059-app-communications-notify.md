# ADR-0059 — App communications: the `notify` family over the shared receiver port

- **Status:** Accepted (the `notify` family is a port in the resource catalog, not a standalone plane — [ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md))
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 45 — App communications](../45-app-communications.md) · [ADR-0045 — SLO-as-code & alerting](./ADR-0045-slo-as-code-and-alerting.md) (the receiver port + provider adapters) · [Plan 21 — Resource catalog](../21-resources-catalog.md) · [Plan 24 — WIT interfaces](../24-wit-interfaces-reference.md) (`hobo:notify`) · [Plan 11 — Event model](../11-event-model.md) (`notification.*`) · [Plan 30 — Policy plane](../30-policy-plane.md) (consent/rate obligations) · [Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md) (secretless broker) · [Plan 36](../36-end-user-auth.md)/[ADR-0038](./ADR-0038-end-user-application-auth.md) (`PrincipalRef` recipients) · [ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md) (WIT-record templates) · [Plan 32](../32-reactive-live-queries.md) (reactive delivery status)
- **Origin:** a coverage sweep for a "more complete design" found the catalog had intra-app messaging (`topic`/`queue`) and ops-only alert receivers, but **no app-facing way to message a human** — the most common SaaS need.

## Context
HoBo could message *operators* (ops alerting, ADR-0045) and move messages *between services* (`topic`/`queue`, Plan 21), but a developer's app had no first-class, portable, secretless, auditable way to send a verify-email, an OTP SMS, a push, or an outbound webhook to *its* users/customers. Bolting this on per-provider would reintroduce static API keys, untyped payloads, no consent enforcement, and no delivery audit — exactly the anti-patterns HoBo's planes exist to remove.

## Decision
1. **A `notify` capability family** (`email`/`sms`/`push`/`webhookOut`) behind a single **`hobo:notify`** port, with `.allow("send")` and providers (SES/SendGrid/Twilio/FCM/APNs/signed-webhook) as **secretless-brokered adapters** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md)).
2. **One port, two consumers.** App communications **reuses the ADR-0045 receiver port + adapters**; ops alerting and app comms are the same transport with different policy/audit/addressing. A provider adapter is written once and serves both.
3. **Recipients are `PrincipalRef`s** ([Plan 36](../36-end-user-auth.md)) and **templates are WIT records** ([ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md)) — identity/consent and typed payloads ride the existing models; `send` is a memoized `step` (idempotent, no double-send on retry).
4. **Sends are event-sourced** (`notification.Requested/Sent/Delivered/Bounced/Failed`) → auditable, reactive (`useQuery()` delivery status, [Plan 32](../32-reactive-live-queries.md)), and retry/compensatable ([Plan 5](../05-reliability-ha.md)).
5. **Policy-gated** ([Plan 30](../30-policy-plane.md)): rate limits and quiet-hours are `policy.Decided`/obligations (deferral is a durable effect, not advice); **consent/opt-out** is a generic policy-obligation example — not a product feature.

## Alternatives considered
- **A separate notification microservice / port unrelated to ops alerting.** Rejected: duplicates the receiver-port + adapter work; two SendGrid integrations to maintain. Sharing the port is the cheap, coherent choice.
- **Untyped `send(to, body)` with raw provider keys.** Rejected: reintroduces static secrets, untyped payloads, and no consent/audit — the precise anti-patterns the secretless/WIT-record/policy planes remove.
- **Make notifications a kind of `topic`.** Rejected: `topic` is intra-app pub/sub between components; human-facing delivery needs consent, channel addressing, delivery receipts, and quiet-hours — a different contract. They compose (a `topic` subscriber may `notify`) but aren't the same resource.
- **Build a full marketing-automation / campaign engine.** Rejected — out of scope: campaign/marketing orchestration is app-build-out, not meta-cloud infrastructure ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)). `notify` is a thin transactional send port.

## Consequences
- **(+)** Closes the most common SaaS gap with almost no new machinery — one port + one event family + catalog rows, riding the existing receiver port, broker, log, and policy plane.
- **(+)** Secretless + typed + consent-gated + auditable by default; delivery status is reactive for free; compliance ([Plan 46](../46-compliance-governance.md)) gets "who did we contact, when" as replayable evidence.
- **(+)** Air-gap-friendly: degrades to in-boundary SMTP/relay; unsupported channels surface in the capability-degradation matrix ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)).
- **(−)** Provider deliverability nuances (warmup, DKIM/SPF, carrier rules) live in adapters — HoBo standardizes the *contract*, not every provider's quirks.
- **(−)** Consent/preference modeling has product surface still to settle (built-in projection vs app-owned aggregate) — an iteration hook.
