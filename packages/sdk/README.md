# @hobo/sdk

The **operator SDK** (docs/plans/0017 F23). Per ADR-0072 naming, `@hobo/sdk`
is the operator/self-host authoring surface — the package a platform
engineer, SecOps, DevOps, or SRE imports in `platform/`, `security/`, and
`ops/` code — while the WIT contract stays `hobo:sdk` and app-facing bindles
stay in `@hobo/bindles`.

## Thin wrappers over existing engines (import and wrap, never reinvent)

- **`dispatcher(options, runners)`** wraps `@hobo/dispatcher`: runner
  declarations lower onto `DispatchProviderInput` records and the returned
  declaration carries the engine's own parsed registry
  (`createDispatcherRegistry`), so `decideDispatch` consumes an SDK-authored
  fleet directly and records `dispatch.Decided` as usual.
- **`policyPack(id, options, rules)` / `rule(id, spec)`** wrap
  `@hobo/contracts`' policy-pack shapes (`definePolicyRule`,
  `evaluatePolicyPack`), which in turn compose `@hobo/policy`'s Policy IR:
  a declarative when-clause compiles to a typed predicate, and the assembled
  pack evaluates through `evaluatePolicyPack` unchanged — every decision
  still lands as a `policy.Decided` fact.
- **`defineResource(spec)`** produces `@hobo/cloud`'s existing
  `ResourceDefinition` (the record the Registry catalogs and Matching
  ranks); an authored definition outscores a provider's `{}` default by
  carrying its match selectors and features as specificity.

## Greenfield declaration factories (walkthrough usage sites)

`waiver` (§4.6), `chaos` (§6.4), `runbook` (§6.2), `generateProvider`
(§2.1), and `runner` (§5.2) are typed factories that parse, validate, and
**freeze** a schema-versioned declaration object matching the walkthrough's
call shapes.

**Honest scope:** where no execution engine exists yet, the factory's
contract is the declaration itself — parse-validated, deep-frozen, and
schema-versioned (`hobo.sdk/v1.*`). Declarations are contracts; the engines
that execute them (waiver approval/expiry, fork-lane chaos runs, runbook
incident response, the provider-generation pipeline) are separate
initiatives. Invalid input never yields a declaration — every factory throws
a typed `SdkDeclarationError` instead.

Wire forms of the greenfield declarations are pinned in
[`data-models/sdk.proto`](./data-models/sdk.proto) (+ CUE bounds); the
declaration-submission boundary is fixtured in
[`contracts/pacts/sdk-declarations-boundary.pact.json`](./contracts/pacts/sdk-declarations-boundary.pact.json).
Wrapped factories reuse the wire forms owned by `@hobo/dispatcher`,
`@hobo/contracts`, and `@hobo/cloud`.

## Architecture evidence

Untrusted authoring input becomes parsed derived types at the factory
boundary — every factory follows parse, don't validate — raw specs lower
onto frozen parsed derived types (unknown effects, malformed principals,
non-RFC-3339 expiries, and unbounded fix steps all fail at parse with a
typed error, never at execution time). The SDK emits no events itself: the
command → event pipeline belongs to the engines it wraps — the dispatcher's
and policy engine's actors append the `dispatch.Decided` / `policy.Decided`
facts these declarations produce to the event store, and the owning
packages' materialized views / projections (with snapshots feeding read
stores) expose decision history; this package only authors the frozen
declarations those flows consume.
