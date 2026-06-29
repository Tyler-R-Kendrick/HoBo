---
type: Reference
title: "SDK Public Contracts"
description: "This is the canonical public-contract record for the SDK surfaces hardened by HOBO-9. It pins signatures, semantics, defaults, conformance coverage, and implementation ownership fo"
tags: [hobo, design]
---

# SDK Public Contracts

This is the canonical public-contract record for the SDK surfaces hardened by HOBO-9. It pins signatures, semantics, defaults, conformance coverage, and implementation ownership for the surfaces that were previously spread across examples in [sdk-api.md](./sdk-api.md#plan-02), [authoring-resources-wiring.md](./authoring-resources-wiring.md#plan-21), [platform-engineering.md](./platform-engineering.md#plan-25), [walkthrough.md](./walkthrough.md), [ADR-0026](./adr/01-architecture-core.md#adr-0026), [ADR-0069](./adr/01-architecture-core.md#adr-0069), [ADR-0071](./adr/01-architecture-core.md#adr-0071), and [ADR-0084](./adr/02-identity-security.md#adr-0084). [Package Namespace Map](./package-namespaces.md) is the canonical import-ownership table.

Run `node scripts/validate-sdk-contracts.mjs` after editing SDK examples or package imports. That check treats this file as the source of truth and fails when examples drift across package boundaries or imply different defaults.

## Canonical Decision

External app access is modeled as a **connector**. A connector declares an outbound dependency on an external application, service, or protocol endpoint; it does not imply that HoBo owns the other app.

Raw token access is not a top-level connector method. Tokens branch from a concrete `connection(...)` because audience, subject, selected protocol, and scope ceiling belong to the established connection, not the connector declaration itself.

The Yard builder does not expose `approveDefaults(...)` or `autoApprove(...)`. Those controls duplicated policy concepts, added authoring friction, and created a second approval vocabulary. Inferred Camp placement is governed by explicit Yard placement policy: provider candidate sets, environment selectors, and any no-human approval rules live in policy packs and are evaluated by the policy engine. Nothing is approved by default, and production still requires an explicit policy rule that passes.

HoBo does not expose an agent collection or maintain an agent SDK. Agent interoperability is through protocol connectors such as A2A and ACP. HoBo owns connection, identity, policy, sandboxing, and audit around those protocol calls; protocol-specific clients/adapters live behind connectors.

## Surface Index

Naming: `hobo:sdk` is the WIT contract/package for app primitives and capability/data interfaces; `@hobo/sdk` is the operator SDK for configuring and self-hosting a HoBo cloud.

| Surface | Package boundary | Contract tier | Implementation issue | Conformance issue / suite |
|---|---|---|---|---|
| `.allow(...verbs)` | app idiom layer: `@hobo/bindles`; WIT-owned verb set in `hobo:sdk` | language idiom lowering + manifest IR | HOBO-70 | HOBO-32 / `@hobo/conformance/sdk` |
| `connector(name)` | `@hobo/bindles` | language idiom lowering + manifest IR | HOBO-43 | HOBO-32 / `@hobo/conformance/sdk` |
| `config(...)`, `secretRef(...)`, `env(...)`, `fromBinding(...)` | `@hobo/bindles` | app config reference lowering + manifest IR | HOBO-40 | HOBO-32 / `@hobo/conformance/sdk` |
| `ConnectorConnection.token()` | `@hobo/bindles`, backed by identity broker | XAA wire contract + connection-scoped manifest scope | HOBO-235 | HOBO-54 / ID-JAG token-exchange vectors |
| `camp(name, options)` | `@hobo/camps` | topology idiom lowering | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `yard(name, options)` | `@hobo/yards` | topology idiom lowering + policy attachment | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `junction(name, options)` | `@hobo/junctions` | topology idiom lowering | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| protocol connectors (`a2a`, `acp`) | `@hobo/bindles` + protocol adapters | connector protocol lowering, not an agent SDK | HOBO-88 | HOBO-32 / `@hobo/conformance/sdk` |
| DX SDK resilience semantics | `hobo:sdk` idiom layers plus local diagnostics | semantics-annex extension matrix | HOBO-515 | HOBO-516 / HOBO-517 resilience vectors |

## Contracts

### `.allow(...verbs)`

**Signature.**

```ts
allow<const V extends readonly ResourceVerb[]>(...verbs: V): ResourceHandle<V[number]>;
allow<const V extends readonly ResourceVerb[]>(
  options: { dynamic: true; reason: string },
  ...verbs: V
): ResourceHandle<V[number]>;
```

**Semantics.** `.allow(...)` is a narrowing/assertion surface over the usage-inferred grant set. HoBo first collects resource usage, computes the least-privilege used verbs, and records that set in the manifest. An explicit `.allow(...)` may only narrow below that inferred set, assert that future code must stay within the listed verbs, or add a dynamic verb that static analysis cannot see. If code uses a verb outside the explicit allow set, `can-deploy` fails. Policy deny-ceiling rules still cap the effective grant; `.allow(...)` cannot widen past policy.

**Default.** Omit `.allow(...)` to use the inferred used-verb set. Calling `.allow()` with no verbs is invalid; omit the call instead. Dynamic grants require `{ dynamic: true, reason }`.

**Implementation issue.** HOBO-70 implements usage-inferred permissions plus `.allow()` narrowing.

**Conformance issue.** HOBO-32 covers the `@hobo/conformance/sdk` golden-IR and negative vectors: inferred grant, narrowed grant, dynamic grant, and reject-on-usage-exceeds-allow.

### `connector(name)`

**Signature.**

```ts
connector<const Name extends string>(
  name: Name,
  options?: { target?: ExternalAppRef; protocol?: ConnectorProtocol }
): ConnectorBinding<Name>;
```

**Semantics.** `connector(name)` declares an external dependency and returns the typed client surface for that target. The target's `auth.json` advertises available scopes; collection plus static analysis infer the least-privilege requested subset from actual client operations. `.allow(...)` on a `ConnectorBinding` narrows/asserts that inferred subset. A policy deny-ceiling can further cap or deny scopes before any grant is minted.

**Default.** No scopes are hand-listed by default. Requested scopes are inferred from typed-client usage, and a scope not exercised by code is not requested. Omitted `protocol` uses the target's advertised default protocol.

**Implementation issue.** HOBO-43 defines the connector declaration and typed-client authoring surface. Existing HOBO-43 work must use `connector()` before stabilization.

**Conformance issue.** HOBO-32 covers SDK lowering to the same manifest IR: declared target, inferred scope set, narrowed scope set, and reject-on-usage-exceeds-allow.

### `ConnectorConnection.token()`

**Signature.**

```ts
const asana = connector("asana");
const connection = asana.connection({
  audience?: string;
  protocol?: ConnectorProtocol;
  subject?: PrincipalRef;
});

connection.token(options?: {
  scopes?: readonly ExternalScope[];
  purpose?: string;
}): Promise<XaaTokenHandle>;
```

**Semantics.** `.token()` is the raw XAA escape hatch for libraries or dynamic calls that cannot use the typed client. It is only available from `connection(...)`, so the token is minted against a concrete audience/protocol/subject context. If `options.scopes` is supplied, it must be a subset of the connection's effective inferred/narrowed scopes; it cannot widen access. The grant remains policy-gated and audited as `connector.token.*` events.

**Default.** Omitted `scopes` means "use the effective inferred scope set for this connection." Omitted `audience`, `protocol`, or `subject` inherits from the connector target metadata and current principal.

**Implementation issue.** HOBO-235 backs the connector runtime and brokers XAA tokens for the usage-inferred least-privilege scope.

**Conformance issue.** HOBO-54 pins the ID-JAG token-exchange wire contract vectors. The vectors must include default inferred connection scopes, explicit subset scopes, and rejection of a requested superset.

### `camp(name, options)`

**Signature.**

```ts
camp<const Name extends string>(
  name: Name,
  options?: CampOptions
): CampBuilder<Name>;
```

**Semantics.** `camp(...)` constructs a provider-specific deployment target object. It can import Bindles, pin provider/runtime/IaC choices, and carry environment type or residency constraints. It lowers to manifest IR; the object is topology data, not an executable control-plane action by itself.

**Default.** Options may be omitted while constructing a draft graph, but a deployable Camp must resolve provider, runtime, and IaC from explicit options or Yard placement policy before `hobo up` may apply it.

**Implementation issue.** HOBO-62 implements first-class topology objects.

**Conformance issue.** HOBO-32 covers golden-IR lowering. This builder is idiom-layer-only; the conformance target is the lowered manifest shape plus a semantics annex for builder ordering and invalid unresolved Camps.

### `yard(name, options)`

**Signature.**

```ts
yard<const Name extends string>(
  name: Name,
  options?: YardOptions
): YardBuilder<Name>;
```

**Semantics.** `yard(...)` constructs the provider-specific cross-Camp control-plane scope. It composes Camps, registered providers, cross-Camp policy, gateways, placement policy, and policy packs for inferred-Camp approval. A Yard is provider-specific; a Junction composes across Yards. Approval shortcuts such as `approveDefaults(...)` and `autoApprove(...)` are intentionally not part of this interface; they are policy-pack concerns.

**Default.** Empty Yard graph: no Camps, no provider candidate policy, no no-human approval rule, and no registered providers. Nothing is approved by default.

**Implementation issue.** HOBO-62 implements first-class topology objects.

**Conformance issue.** HOBO-32 covers golden-IR lowering. This builder is idiom-layer-only; the conformance target is the Yard manifest/policy IR plus a semantics annex for composition order, duplicate names, and absence of builder-level approval shortcuts.

### `junction(name, options)`

**Signature.**

```ts
junction<const Name extends string>(
  name: Name,
  options?: JunctionOptions
): JunctionBuilder<Name>;
```

**Semantics.** `junction(...)` constructs the cross-cloud/hybrid federation scope. It adds Yards, federates trust, signed policy packs, signed registry bundles, and infers cross-cloud connectivity from member Yard manifests. It is not a shared-state controller.

**Default.** Empty Junction graph: no member Yards, no connectivity, no shared policy packs.

**Implementation issue.** HOBO-62 implements first-class topology objects.

**Conformance issue.** HOBO-32 covers golden-IR lowering. This builder is idiom-layer-only; the conformance target is the federated manifest/policy IR plus a semantics annex for member identity, duplicate members, and no-shared-state guarantees.

### Protocol connectors (`a2a`, `acp`)

**Signature.**

```ts
const partnerAgent = connector("partner-agent", { protocol: "a2a" });
const internalAgent = connector("internal-agent", { protocol: "acp" });
```

**Semantics.** Protocol connectors let apps call agent-capable systems over common protocols without HoBo maintaining an agent framework or agent SDK. The connector owns declaration, connection, identity propagation, policy checks, sandboxing, and audit. Protocol adapters own protocol-specific request/response shapes behind the connector seam.

**Default.** No agent collection is exposed. No runtime or operator `agent()` factory is exported as a public SDK contract. Protocol use is explicit through `connector(..., { protocol })`.

**Implementation issue.** HOBO-88 owns the generated SDK boundary cleanup: remove public agent SDK naming, keep protocol interop behind connector adapters, and reserve `agent` for internal implementation details where needed.

**Conformance issue.** HOBO-32 covers SDK idiom-layer parity. The conformance corpus must include A2A and ACP connector lowering plus a negative vector proving `agent()` is not a supported public collection/factory.

### DX SDK resilience semantics

**Contract record.** [`dx-sdk-resilience-semantics.md`](./dx-sdk-resilience-semantics.md) is the M0 vocabulary and acceptance matrix for retry, cancellation, deadline, lifecycle, supervision, cleanup, and replay-derived inspection behavior.

**Semantics.** Resilience helpers remain idiom-layer-only over the canonical `hobo:sdk` WIT surface. Effect and XState are reference inputs, not public dependencies. A transient failure may retry only through a deterministic schedule with persisted facts; `policy.Decided` denial and terminal WIT failures never retry; cancellation is caller-owned and stops pending retries; inspection is reconstructed from replayable event facts rather than process memory.

**Default.** No SDK layer can claim retry, deadline, lifecycle, supervision, or inspection support until the corresponding resilience vector exists and passes. Off-corpus helper behavior is unsupported by default and must be listed in the conformance report.

**Implementation issue.** HOBO-514 records the parent scope, child issue matrix, initiative links, and adversarial guardrails. HOBO-515 records the vocabulary, target paths, and proof sequence. HOBO-516 implements the first `src/draft/resilience-semantics-annex` proof.

**Conformance issue.** HOBO-517 extends the SDK conformance gate so golden-IR success cannot hide bad resilience semantics.
