# Plan 45 — App communications — FOLDED INTO THE RESOURCE CATALOG

> **Removed as a standalone plane — out of scope of an AI-native meta-cloud refocus ([ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md)).** App communications is **not** a separate plane; the **`notify` family** (`email` / `sms` / `push` / `webhookOut`) is now a thin **cloud-messaging port** in the resource catalog ([Plan 21](./21-resources-catalog.md)) exposed via the **`hobo:notify`** WIT port ([Plan 24](./24-wit-interfaces-reference.md)) — "ports over platforms," brokering SES/Twilio/FCM/APNs secretlessly like any other capability.

## What was kept (folded in, not deleted)
- The **`hobo:notify`** port and the `email`/`sms`/`push`/`webhookOut` catalog rows remain in [Plan 21](./21-resources-catalog.md) and [Plan 24](./24-wit-interfaces-reference.md) — `notify` is a normal `.allow("send")`-gated resource behind a WIT port, secretless-brokered, with WIT-record-typed templates ([ADR-0051](./adr/ADR-0051-wit-record-canonical-domain-schema.md)) and `PrincipalRef` recipients ([Plan 36](./36-end-user-auth.md)).
- The **`notification.*`** event family ([Plan 11](./11-event-model.md)) is retained — compliance audit ([Plan 46](./46-compliance-governance.md)) uses "who did we contact, when" as replayable evidence.
- **Policy gating** of sends (rate limits, quiet hours) stays a generic obligation example in the policy plane ([Plan 30](./30-policy-plane.md)); **consent** stays a generic policy-obligation example, not a product feature.

## What was dropped
- The framing of communications as a standalone **plane** (it is a port, not a plane).
- Any **campaign / marketing-automation** framing and **consent-as-a-product** surface — consent is just a policy obligation, like any other.

See [ADR-0059](./adr/ADR-0059-app-communications-notify.md) (amended: the `notify` family is a port in the resource catalog, not a standalone plane) and [ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md).
