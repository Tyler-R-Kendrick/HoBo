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

Inferred-Camp approval is both a Yard builder affordance and a policy-pack rule. The builder form is only a typed authoring shortcut: `yard(...).autoApprove(...)` lowers to a scoped policy rule over the Yard's approved defaults. The policy engine remains the authority for approval; the builder does not create an approval side channel.

`approveDefaults(...)` and `autoApprove(...)` are separate controls:

- `approveDefaults(...)` marks which registered provider/listing set an inferred Camp may draw from.
- `autoApprove(...)` decides when the inferred Camp can be approved without a human.
- Nothing is approved by default. Production is never included by default; production requires an explicit selector or an explicit policy rule that passes.

## Surface Index

Naming: `hobo:sdk` is the WIT contract/package for app primitives and capability/data interfaces; `@hobo/sdk` is the operator SDK for configuring and self-hosting a HoBo cloud.

| Surface | Package boundary | Contract tier | Implementation issue | Conformance issue / suite |
|---|---|---|---|---|
| `.allow(...verbs)` | app idiom layer: `@hobo/bindles`; WIT-owned verb set in `hobo:sdk` | language idiom lowering + manifest IR | HOBO-70 | HOBO-32 / `@hobo/conformance/sdk` |
| `crossApp(name)` | `@hobo/bindles` | language idiom lowering + manifest IR | HOBO-43 | HOBO-32 / `@hobo/conformance/sdk` |
| `config(...)`, `secretRef(...)`, `env(...)`, `fromBinding(...)` | `@hobo/bindles` | app config reference lowering + manifest IR | HOBO-40 | HOBO-32 / `@hobo/conformance/sdk` |
| `CrossAppBinding.token()` | `@hobo/bindles`, backed by identity broker | XAA wire contract + manifest scope | HOBO-235 | HOBO-54 / ID-JAG token-exchange vectors |
| `approveDefaults(...)` | `@hobo/yards` | topology idiom lowering + Yard manifest | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `autoApprove(...)` | `@hobo/yards`, lowering to policy | policy rule + decision parity | HOBO-133 | HOBO-223 / policy-engine conformance parity |
| `camp(name, options)` | `@hobo/camps` | topology idiom lowering | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `yard(name, options)` | `@hobo/yards` | topology idiom lowering | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `junction(name, options)` | `@hobo/junctions` | topology idiom lowering | HOBO-62 | HOBO-32 / `@hobo/conformance/sdk` |
| `agent()` name collision | app runtime: `@hobo/runtime`; operator SDK: `@hobo/sdk` | package boundary + alias rule | HOBO-88 | HOBO-32 / `@hobo/conformance/sdk` |

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

### `crossApp(name)`

**Signature.**

```ts
crossApp<const Name extends string>(
  name: Name,
  options?: { target?: ExternalAppRef }
): CrossAppBinding<Name>;
```

**Semantics.** `crossApp(name)` declares an external app dependency and returns the typed client surface for that target. The target's `auth.json` advertises available scopes; collection plus static analysis infer the least-privilege requested subset from actual client operations. `.allow(...)` on a `CrossAppBinding` narrows/asserts that inferred subset. A policy deny-ceiling can further cap or deny scopes before an XAA grant is minted.

**Default.** No scopes are hand-listed by default. Requested scopes are inferred from typed-client usage, and a scope not exercised by code is not requested.

**Implementation issue.** HOBO-43 defines the `crossApp()` declaration and typed-client authoring surface.

**Conformance issue.** HOBO-32 covers SDK lowering to the same manifest IR: declared target, inferred scope set, narrowed scope set, and reject-on-usage-exceeds-allow.

### `CrossAppBinding.token()`

**Signature.**

```ts
token(options?: {
  scopes?: readonly ExternalScope[];
  audience?: string;
  purpose?: string;
}): Promise<XaaTokenHandle>;
```

**Semantics.** `.token()` is the raw XAA escape hatch for libraries or dynamic calls that cannot use the typed client. It requests an audience-bound, short-lived token through the broker. If `options.scopes` is supplied, it must be a subset of the binding's effective inferred/narrowed scopes; it cannot widen access. The grant remains policy-gated and audited as `token.*` events.

**Default.** Omitted `scopes` means "use the effective inferred scope set for this binding." Omitted `audience` means the target app audience advertised by `auth.json`.

**Implementation issue.** HOBO-235 backs the `crossApp()` runtime and brokers XAA tokens for the usage-inferred least-privilege scope.

**Conformance issue.** HOBO-54 pins the ID-JAG token-exchange wire contract vectors. The vectors must include default inferred scopes, explicit subset scopes, and rejection of a requested superset.

### `approveDefaults(...)`

**Signature.**

```ts
approveDefaults(...providers: readonly ProviderRef[]): YardBuilder;
approveDefaults(options: {
  providers: readonly ProviderRef[];
  where?: { envType?: EnvType | EnvTypeSelector };
}): YardBuilder;
```

**Semantics.** `approveDefaults(...)` records the approved default providers/listings that the Dispatcher may use when inferring Camps for Bindles. It does not register a provider, approve a deploy, or approve inferred Camps by itself. Provider registration and signature verification are separate; inferred-Camp approval is governed by `autoApprove(...)` or an explicit policy rule.

**Default.** No approved default providers. Without approved defaults, zero-config inferred placement has no candidate set.

**Implementation issue.** HOBO-62 implements the first-class topology objects that carry approved defaults into the Yard manifest.

**Conformance issue.** HOBO-32 covers SDK lowering so the Yard manifest records exactly the approved default provider set and selector.

### `autoApprove(...)`

**Signature.**

```ts
autoApprove(options: {
  inferredCamps: true;
  where?: ApprovalSelector;
  reason?: string;
}): YardBuilder;
```

**Semantics.** `autoApprove(...)` is typed sugar for a Yard-scoped policy-pack rule. It can only approve inferred Camps whose provider is in the approved defaults and whose selector matches `where`. The policy engine decides; this builder only emits the rule. Inferred-Camp approval is both a Yard builder affordance and a policy-pack rule, with policy as the authority.

**Default.** It is off by default. Production is excluded unless `where` explicitly includes production or a separate explicit policy rule passes for production. The recommended non-production bootstrap is:

```ts
yard("acme")
  .approveDefaults("azure", "cloudflare")
  .autoApprove({ inferredCamps: true, where: { envType: { not: "production" } } });
```

**Implementation issue.** HOBO-133 implements the built-in deny-by-default policy evaluation engine that evaluates the lowered rule.

**Conformance issue.** HOBO-223 covers policy-engine conformance parity; the auto-approval vectors must include non-production pass, production deny unless explicitly selected, and deny when provider is outside approved defaults. HOBO-213 proves the SecOps user-story flow across the same deny-ceiling surface.

### `camp(name, options)`

**Signature.**

```ts
camp<const Name extends string>(
  name: Name,
  options?: CampOptions
): CampBuilder<Name>;
```

**Semantics.** `camp(...)` constructs a provider-specific deployment target object. It can import Bindles, pin provider/runtime/IaC choices, and carry environment type or residency constraints. It lowers to manifest IR; the object is topology data, not an executable control-plane action by itself.

**Default.** Options may be omitted while constructing a draft graph, but a deployable Camp must resolve provider, runtime, and IaC from explicit options or inherited Yard/default-provider policy before `hobo up` may apply it.

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

**Semantics.** `yard(...)` constructs the provider-specific cross-Camp control-plane scope. It composes Camps, registered providers, approved defaults, cross-Camp policy, gateways, and policy lowering for inferred-Camp approval. A Yard is provider-specific; a Junction composes across Yards.

**Default.** Empty Yard graph: no Camps, no approved default providers, no auto-approval, and no registered providers.

**Implementation issue.** HOBO-62 implements first-class topology objects.

**Conformance issue.** HOBO-32 covers golden-IR lowering. This builder is idiom-layer-only; the conformance target is the Yard manifest/policy IR plus a semantics annex for composition order and duplicate names.

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

### `agent()` name collision

**Signature.**

```ts
import { agent as runtimeAgent } from "@hobo/runtime";
import { agent as operatorAgent } from "@hobo/sdk";
```

**Semantics.** App code imports the durable app/runtime primitive from `@hobo/runtime`. Operator-control-plane code imports the Crew/operator primitive from `@hobo/sdk`. Both lower to the same WIT-first `hobo:sdk` primitive family, but the package boundary communicates role and authority. Neither package re-exports the other package's `agent()` name.

**Default.** A file may import one `agent` unaliased. A file that imports both runtime and operator forms must alias both imports, as shown above.

**Implementation issue.** HOBO-88 implements the SDK codegen surface and checked-in generated API boundaries that keep these imports distinct.

**Conformance issue.** HOBO-32 covers SDK idiom-layer parity. The conformance corpus must include runtime-agent and operator-agent lowering plus the alias rule for mixed imports.
