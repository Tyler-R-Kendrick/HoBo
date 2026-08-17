---
type: Plan
title: "Swarm brief — implement ADR-0157–0161 (Yard bindings, phases, developer loop, OOB defaults)"
description: "Self-contained implementation brief for a parallel LLM coding-agent swarm: eight disjoint work units delivering Yard binding rows, deployment phases, the app test harness, provider scratch harness, and the drizzle/Better-Auth defaults, with verbatim cross-package type contracts and gate commands."
tags: [hobo, plans, yards, bindings, phases, testing]
---

# Swarm brief — implement ADR-0157–0161

Self-contained implementation brief for a parallel LLM coding-agent swarm: eight disjoint work units delivering Yard binding rows, deployment phases, the app test harness, provider scratch harness, and the drizzle/Better-Auth defaults, with verbatim cross-package type contracts and gate commands.

> **Read this document as the complete specification.** Do not consult chat history, external URLs, or ask a coordinator for clarification. Everything needed — the decisions, the exact type contracts shared across packages, the repo conventions, the gate commands, and the honest-scope boundaries — is below. Where this brief and an ADR disagree, **this brief wins** (it carries design-review corrections applied after the ADRs were drafted; the ADRs have been amended to match, but this brief is the operative spec).

## 0. What you are building and why

Five accepted ADRs need implementation. They came from a competitive analysis of [Alchemy](../competitors/alchemy.md) (alchemy.run), whose "Bindings" concept — *a binding declaration names a capability and says nothing about how it is satisfied; a host-specific implementation decides how* — named a seam HoBo had left implicit. The design response is in [`../design/yard-bindings.md`](../design/yard-bindings.md).

| ADR | What it decides | Where it lands |
|---|---|---|
| [ADR-0157](../design/adr/07-portability-extensibility.md#adr-0157) | The **Yard is the binding authority**: Yard binding rows map capability profiles → provider products/connectivity; hard-filter-only over ADR-0151 selection; `yard:local` seeded from host capabilities | `@hobo/yards`, `@hobo/bindings`, `@hobo/cloud` |
| [ADR-0158](../design/adr/01-architecture-core.md#adr-0158) | **Deployment phases** `plan`/`init`/`handle`, dev-mode separate from phase | `@hobo/core` |
| [ADR-0159](../design/adr/07-portability-extensibility.md#adr-0159) | **OOB app test harness** (in-process + ephemeral-Camp lanes) + **provider scratch harness** | `@hobo/testing` (new), `@hobo/conformance` |
| [ADR-0160](../design/adr/03-data-plane.md#adr-0160) | **Schema-diff port + canonical differ**; drizzle-kit as the default ingestion/emission adapter | `@hobo/core`, `@hobo/adapter-drizzle` (new) |
| [ADR-0161](../design/adr/02-identity-security.md#adr-0161) | **Better Auth** as the default self-hosted `hobo:auth` adapter descriptor | `@hobo/adapter-better-auth` (new) |

### Design-review corrections that are binding on implementation

These were found by adversarial review of the ADRs themselves. Implement the corrected behavior:

1. **Yard binding rows are a SET, not an ordered list.** An ordered list would let authoring order influence ranking, which ADR-0151 decision 11 forbids ("selection is hard gates then lexicographic ordering — never a weighted score"). Canonicalize by sorting; reject duplicate `(profile, productId, connectivityId)` triples.
2. **Provider coherence is checked at resolution, not at parse.** Do **not** infer a product's provider from its id prefix — that would make a naming convention load-bearing, which ADR-0144 forbids. `yard()` parse validates grammar/shape/credentials/pin-conflicts only; the check that a named definition's `providerId` equals the Yard's happens where the catalog exists.
3. **Unmatched rows fail closed with distinguishable reasons.** Never silently ignore a row — a silently-dropped row is a portability lie. Codes: `YARD_BINDING_PRODUCT_UNKNOWN`, `YARD_BINDING_PROVIDER_MISMATCH`, `YARD_BINDING_EXCLUDED_ALL`.
4. **`binding.Declared` does not exist.** Row state rides `yard.Registered`; do not add a declaration event. The family is exactly `binding.Resolved`, `binding.Projected`, `binding.Unavailable`.
5. **`binding.Projected` is deploy-time wiring only.** Per-activation client construction emits nothing — a per-activation write into the control-plane log is a hot-path cost with no audit value.
6. **Phases ship as vocabulary + enforcement primitives + conformance, not a handler pipeline.** `@hobo/runtime` has no handler surface today and `ctx.bindings` exists only in draft proofs. Do not invent one.
7. **The in-process harness lane must attest fidelity.** `runtime-local` does not execute real `.wasm` bytes; every handle carries `real | simulated | mocked | camp-only` (ADR-0042) and the harness reports a coverage split rather than a bare green tick.
8. **HoBo owns the canonical schema IR and the phase plan.** drizzle-kit is ingestion + SQL emission behind a port, toolchain-gated and fail-closed, with its version pinned into the artifact digest so an upgrade is a visible plan change rather than silent SQL drift.
9. **Better Auth is not vendored as a running server.** Descriptor + config parse + claims mapping + port requirements + conformance; runtime execution is declared and gated.

### Non-negotiable repo laws

- **Parse, don't validate.** Every external/authored input crosses a parse boundary returning a branded, frozen record; invalid input throws a typed error with a `code`. Never return a partially-valid object.
- **Fail closed.** Missing capability, missing credential, missing toolchain, unmatched row → refuse with remediation text. Never silently degrade, never fall back to a weaker lane.
- **No credentials in records.** Secrets are `secretRef` locators only. Reuse the existing `assertNoCredentials`-style guard: reject property keys matching `/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i`.
- **Determinism.** No `Date.now()`/`Math.random()` in pure records or planning paths; sort collections; content-hash canonical JSON. Registries list id-sorted, never registration-ordered.
- **No new public dependency on Effect-TS, Polly, or XState** (ADR-0136). Plain async/await + typed results on public surfaces.
- **Boundary rule:** adapter packages import `@hobo/core` (and their own deps) only — never another adapter. Keep imports flowing inward.
- **HONEST SCOPE.** If something is simulated, gated, or unimplemented, say so in the package README under a `## HONEST SCOPE` heading and in code comments. Overclaiming is the one unforgivable defect in this repo.

## 1. Shared type contracts (verbatim — do not redesign)

Multiple work units compile against these. They are the coordination mechanism: implement them **exactly** as written so parallel units integrate without negotiation. Field order, names, and string literals are normative.

### 1.1 Yard bindings — owned by `@hobo/yards`

```ts
export const YARD_BINDING_CONTRACT = "hobo.yard-binding/v1";

/** Capability profile id grammar (ADR-0151): <primitive-family>.<path>/v<major> */
export const YARD_BINDING_PROFILE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\/v[1-9][0-9]*$/;

export interface YardBindingInput {
	readonly profile: string;
	readonly productId?: string;
	readonly connectivityId?: string;
	readonly require?: readonly string[];
	readonly properties?: Readonly<Record<string, unknown>>;
}

export interface YardBinding {
	readonly contract: typeof YARD_BINDING_CONTRACT;
	readonly profile: string;
	readonly productId?: string;
	readonly connectivityId?: string;
	readonly require: readonly string[];
	readonly properties: Readonly<Record<string, unknown>>;
}

export type YardBindingErrorCode =
	| "YARD_BINDING_PROFILE_INVALID"
	| "YARD_BINDING_EMPTY_CONSTRAINT"
	| "YARD_BINDING_DUPLICATE"
	| "YARD_BINDING_CREDENTIAL_PROPERTY"
	| "YARD_BINDING_PIN_CONFLICT";

export class YardBindingError extends Error {
	readonly code: YardBindingErrorCode;
	readonly profile?: string;
}

/** Parses + canonicalizes a row set. Sorted by (profile, productId ?? "", connectivityId ?? ""). */
export function parseYardBindings(
	input: readonly YardBindingInput[] | undefined,
	options?: { readonly pinnedSlots?: readonly string[] },
): readonly YardBinding[];
```

Parse rules, in order:
- `profile` must match `YARD_BINDING_PROFILE_PATTERN` → else `YARD_BINDING_PROFILE_INVALID`.
- At least one of `productId` / `connectivityId` must be a non-empty string → else `YARD_BINDING_EMPTY_CONSTRAINT` (a row constraining nothing is meaningless and would read as a portability claim it does not make).
- `properties` keys are credential-screened → `YARD_BINDING_CREDENTIAL_PROPERTY`; values must be JSON-safe.
- A `profile` string equal to any `options.pinnedSlots` entry → `YARD_BINDING_PIN_CONFLICT` (the same subject must not be bound by both a resolver-slot pin and a capability row).
- Duplicate `(profile, productId ?? "", connectivityId ?? "")` → `YARD_BINDING_DUPLICATE`.
- Output is frozen, `require`/`properties` defaulted to `[]` / `{}`, sorted as above.

`YardConfig` gains `readonly bindings?: readonly YardBindingInput[]`; `Yard` exposes `readonly bindings: readonly YardBinding[]`; `yardToShape` includes `bindings` in the planning record so selection can consume it structurally without importing `@hobo/yards`.

### 1.2 Localhost Yard seed — owned by `@hobo/yards`

```ts
export const LOCALHOST_YARD_NAME = "yard:local";
export const LOCALHOST_PROVIDER_ID = "local";

export type SeedProvenance = "default" | "discovered" | "declared";
export type SeedFidelity = "real" | "simulated" | "mocked" | "camp-only";

export interface LocalhostCapabilityObservation {
	readonly capabilityId: string;   // e.g. "capability:runtime:node"
	readonly present: boolean;
}

export interface LocalhostYardSeed {
	readonly contract: "hobo.localhost-yard-seed/v1";
	readonly yard: Yard;
	readonly rows: readonly {
		readonly profile: string;
		readonly productId: string;
		readonly provenance: SeedProvenance;
		readonly fidelity: SeedFidelity;
	}[];
	readonly unavailable: readonly { readonly profile: string; readonly reason: string }[];
}

/** Pure. Deterministic given observations. No I/O, no clock, no randomness. */
export function seedLocalhostYard(
	observations: readonly LocalhostCapabilityObservation[],
): LocalhostYardSeed;
```

The seed maps the Bindle catalog primitives (`web, api, service, data, kv, bucket, queue, topic, secretRef, webhook`) to local implementations, each row labeled with its fidelity. A primitive with no local implementation appears in `unavailable` with a reason — it is never silently omitted.

### 1.3 Binding resolution + events — owned by `@hobo/bindings`

```ts
export const BINDING_RESOLUTION_CONTRACT = "hobo.binding-resolution/v1";

export type BindingUnavailableCode =
	| "YARD_BINDING_PRODUCT_UNKNOWN"
	| "YARD_BINDING_PROVIDER_MISMATCH"
	| "YARD_BINDING_EXCLUDED_ALL"
	| "NO_COMPATIBLE_BINDING";

export interface BindingResolution {
	readonly contract: typeof BINDING_RESOLUTION_CONTRACT;
	readonly yardId: string;
	readonly profile: string;
	readonly productId: string;
	readonly connectivityId: string;
	readonly realization: "native" | "pack" | "bridge";
	readonly appliedRows: readonly string[];   // canonical row keys that constrained this decision
	readonly consideredCount: number;
}

export const BINDING_EVENTS = ["binding.Resolved", "binding.Projected", "binding.Unavailable"] as const;
export type BindingEventName = (typeof BINDING_EVENTS)[number];

export function bindingResolved(input: BindingResolution): BindingResolvedEvent;
export function bindingProjected(input: {
	readonly yardId: string;
	readonly alias: string;
	readonly bindingProfileRef: string;
	readonly connectivityId: string;
	readonly projection: "provider-binding" | "environment-secret-ref" | "service-binding-files" | "wasi-config" | "in-process";
}): BindingProjectedEvent;
export function bindingUnavailable(input: {
	readonly yardId: string;
	readonly profile: string;
	readonly code: BindingUnavailableCode;
	readonly remediation: string;
	readonly consideredCount: number;
}): BindingUnavailableEvent;
```

Every event record is frozen, carries its event name, and contains no secret-shaped values. `remediation` is human-actionable text naming what to change.

### 1.4 Deployment phases — owned by `@hobo/core`

```ts
export const DEPLOYMENT_PHASES = ["plan", "init", "handle"] as const;
export type DeploymentPhase = (typeof DEPLOYMENT_PHASES)[number];

export const REQUEST_SCOPED_CAPABILITIES = ["request", "reply", "requestPrincipal", "requestSpan"] as const;
export const INIT_SCOPED_CAPABILITIES = ["bindingClient", "instanceState"] as const;
export type PhaseScopedCapability =
	| (typeof REQUEST_SCOPED_CAPABILITIES)[number]
	| (typeof INIT_SCOPED_CAPABILITIES)[number];

/** Dev is a MODE, not a phase (ADR-0158 §2). `hobo dev` runs phase "plan" then "init" with dev=true. */
export interface PhaseScope {
	readonly phase: DeploymentPhase;
	readonly dev: boolean;
}

export class PhaseViolationError extends Error {
	readonly code: "PHASE_VIOLATION";
	readonly capability: PhaseScopedCapability;
	readonly requiredPhase: DeploymentPhase;
	readonly actualPhase: DeploymentPhase;
}

export function parseDeploymentPhase(value: unknown): DeploymentPhase;
export function parsePhaseScope(value: unknown): PhaseScope;
export function phaseForCapability(capability: PhaseScopedCapability): DeploymentPhase;
/** Throws PhaseViolationError when `capability` is touched outside its phase. */
export function assertCapabilityPhase(scope: PhaseScope, capability: PhaseScopedCapability): void;
```

Also export the environment-variable contract used by hosts: `HOBO_PHASE` (values are the phase literals) and `HOBO_DEV` (`"1"`/`"0"`), with a parse helper that fails closed on an unknown value rather than defaulting.

### 1.5 Schema diff port + canonical differ — owned by `@hobo/core`

```ts
export const SCHEMA_IR_CONTRACT = "hobo.schema-ir/v1";
export const MIGRATION_PLAN_CONTRACT = "hobo.migration-plan/v1";

export interface SchemaColumn {
	readonly name: string;
	readonly type: string;
	readonly nullable: boolean;
	readonly primaryKey: boolean;
	readonly unique: boolean;
	readonly defaultExpression?: string;
}
export interface SchemaIndex {
	readonly name: string;
	readonly columns: readonly string[];
	readonly unique: boolean;
}
export interface SchemaTable {
	readonly name: string;
	readonly columns: readonly SchemaColumn[];
	readonly indexes: readonly SchemaIndex[];
}
export interface SchemaIr {
	readonly contract: typeof SCHEMA_IR_CONTRACT;
	readonly dialect: "postgres";
	readonly tables: readonly SchemaTable[];
}

export type MigrationPhaseName = "expand" | "backfill" | "contract";
export type MigrationStepKind =
	| "create-table" | "add-column" | "add-index" | "widen-column"
	| "backfill-column"
	| "drop-column" | "drop-index" | "drop-table" | "narrow-column";

export interface MigrationStep {
	readonly phase: MigrationPhaseName;
	readonly kind: MigrationStepKind;
	readonly table: string;
	readonly column?: string;
	readonly index?: string;
	readonly destructive: boolean;
}

export interface MigrationPlan {
	readonly contract: typeof MIGRATION_PLAN_CONTRACT;
	readonly steps: readonly MigrationStep[];
	readonly engineId: string;
	readonly engineVersion: string;
	readonly digest: string;   // canonical-JSON hash over {steps, engineId, engineVersion}
}

export interface SchemaDiffEngine {
	readonly id: string;
	readonly version: string;
	diff(current: SchemaIr, desired: SchemaIr): MigrationPlan;
	emitSql?(plan: MigrationPlan): readonly { readonly step: MigrationStep; readonly sql: string }[];
}

export function parseSchemaIr(value: unknown): SchemaIr;
/** Canonical differ. Pure, deterministic, forward-only. Destructive steps are always phase "contract". */
export function diffSchemaIr(current: SchemaIr, desired: SchemaIr, engine?: { id: string; version: string }): MigrationPlan;
```

Canonical differ rules: additions (`create-table`, `add-column` nullable-or-defaulted, `add-index`, `widen-column`) → `expand`; data population → `backfill`; removals and narrowings → `contract` with `destructive: true`. Never emit a down/inverse step (ADR-0032 is forward-only). Steps sort deterministically by `(phase, table, kind, column ?? index ?? "")`. `engineVersion` participates in `digest` so an engine upgrade changes the plan digest visibly.

### 1.6 App test harness — owned by `@hobo/testing`

```ts
export type Lane = "in-process" | "ephemeral-camp";
export type Fidelity = "real" | "simulated" | "mocked" | "camp-only";

export interface TestHarnessOptions {
	readonly lane?: Lane;             // default "in-process"
	readonly stage?: string;          // default "test"
	readonly yard?: unknown;          // required for "ephemeral-camp"; fail closed when absent
	readonly runner?: RunnerAdapter;  // default: auto-detected
}

export interface ResourceHandle {
	readonly alias: string;
	readonly kind: string;
	readonly fidelity: Fidelity;
	readonly endpoint?: string;
}

export interface FidelityReport {
	readonly byFidelity: Readonly<Record<Fidelity, number>>;
	readonly assertedAgainst: readonly { readonly alias: string; readonly fidelity: Fidelity }[];
	/** true only when no assertion rested on a `mocked` handle. */
	readonly prodReadinessClaimable: boolean;
}

export interface DeployedGraph {
	readonly stage: string;
	readonly lane: Lane;
	outputs<T = Record<string, unknown>>(): T;
	resource(alias: string): ResourceHandle;
	http(alias: string): { readonly baseUrl: string };
	fidelity(): FidelityReport;
}

export interface TestHarness {
	deploy(bindle: unknown): () => Promise<DeployedGraph>;
	destroy(bindle: unknown): () => Promise<void>;
	untilReady(target: string | ResourceHandle, options?: {
		readonly attempts?: number;      // default 20
		readonly initialDelayMs?: number; // default 500
	}): Promise<{ readonly status: number }>;
}

export function createTestHarness(options?: TestHarnessOptions): TestHarness;
```

`untilReady` retries on propagation-shaped failures (404, 5xx, network) with exponential backoff and **fails fast on deliberate 400/401/403** — an auth rejection is an answer, not a propagation delay. Teardown walks reverse dependency order. The `ephemeral-camp` lane throws a typed, remediation-carrying error when no Yard/credentials are supplied — it never degrades to `in-process`.

### 1.7 Provider scratch harness — owned by `@hobo/conformance`

```ts
export interface ScratchStack {
	deploy(desired: unknown): Promise<{ readonly outputs: Record<string, unknown>; readonly instanceId: string }>;
	destroy(): Promise<void>;
	readonly state: { list(): readonly { readonly id: string; readonly type: string }[] };
}

export interface ProviderLifecycleCase {
	readonly name: string;
	readonly run: (stack: ScratchStack) => Promise<void>;
}

/** The lifecycle suite every provider must pass: create, update-in-place, replace, delete,
 *  adopt, and crash-resume idempotency (reconcile twice ⇒ same outputs, one instance). */
export const PROVIDER_LIFECYCLE_SUITE: readonly ProviderLifecycleCase[];

export function createScratchStack(options?: { readonly seed?: unknown }): ScratchStack;
export function runProviderLifecycleConformance(
	provider: unknown,
	options?: { readonly cases?: readonly ProviderLifecycleCase[] },
): Promise<{ readonly passed: number; readonly failed: readonly { readonly name: string; readonly error: string }[] }>;
```

Scratch stacks are in-memory and per-test — they must never write to `.hobo/`, `.alchemy/`, or a shared stage.

### 1.8 Drizzle adapter — owned by `@hobo/adapter-drizzle`

```ts
export const DRIZZLE_ENGINE_ID = "drizzle-kit";

export interface DrizzleIngestOptions { readonly dialect?: "postgres" }
/** Structural ingestion of a Drizzle schema module's exported table objects → canonical SchemaIr.
 *  Unrecognized constructs are collected as impedance findings, never silently dropped. */
export function ingestDrizzleSchema(
	moduleExports: Readonly<Record<string, unknown>>,
	options?: DrizzleIngestOptions,
): { readonly schema: SchemaIr; readonly impedance: readonly { readonly code: string; readonly detail: string }[] };

export function createDrizzleDiffEngine(options?: {
	readonly version?: string;         // pinned engine version; participates in the plan digest
	readonly toolchainPresent?: boolean;
}): SchemaDiffEngine;
```

`emitSql` requires the drizzle-kit toolchain; when absent it throws a typed `TOOLCHAIN_UNAVAILABLE` error with remediation. `diff` always works — it delegates to the canonical `diffSchemaIr` and stamps `engineId`/`engineVersion`.

### 1.9 Better Auth adapter — owned by `@hobo/adapter-better-auth`

```ts
export const BETTER_AUTH_ADAPTER_ID = "better-auth";
export const AUTH_ADAPTER_CONTRACT = "hobo.auth-adapter/v1";

export interface AuthAdapterDescriptor {
	readonly contract: typeof AUTH_ADAPTER_CONTRACT;
	readonly id: string;
	readonly displayName: string;
	readonly hosting: "self-hosted" | "hosted";
	readonly requiredPorts: readonly string[];   // e.g. ["hobo:data/relational", "hobo:secrets", "hobo:http"]
	readonly claimsMappingVersion: string;
	readonly supportsOrganizations: boolean;
}

export interface BetterAuthConfigInput {
	readonly basePath: string;
	readonly secretRef: string;                    // locator only — never a value
	readonly database: { readonly profile: string };
	readonly emailAndPassword?: { readonly enabled: boolean };
	readonly socialProviders?: readonly string[];
	readonly organizations?: { readonly enabled: boolean };
}

export function parseBetterAuthConfig(input: unknown): BetterAuthConfig;
export const BETTER_AUTH_DESCRIPTOR: AuthAdapterDescriptor;

export interface MappedPrincipal {
	readonly subject: string;
	readonly issuer: string;
	readonly email?: string;
	readonly organizationId?: string;
	readonly roles: readonly string[];
}
/** Versioned, conformance-tested claims → principal mapping (ADR-0073 requires this be explicit). */
export function mapClaimsToPrincipal(claims: unknown): MappedPrincipal;
```

`parseBetterAuthConfig` rejects an inline secret (anything not parsing as a `secretRef` locator) with a typed error — the app never holds signing material (ADR-0113).

## 2. Work units (parallel, disjoint, no ordering between them)

Each unit owns **exclusive** file paths. Do not edit files outside your unit's paths — another agent owns them. Where you need a type from another unit, import it from that package and code against the verbatim contract in §1; it will resolve once all units land.

Every unit delivers: implementation + unit tests + `data-models/` (proto + CUE for its records) + `contracts/` (PACT inventory + consumer/provider tests where the package has a boundary) + README with `## HONEST SCOPE` + passing gates (§3).

---

### Unit A — core ports: phases + schema diff
**Owns:** `packages/core/src/ports/phase.ts`, `packages/core/src/ports/schema-diff.ts`, their exports in `packages/core/src/index.ts`, `packages/core/test/phase.test.ts`, `packages/core/test/schema-diff.test.ts`, `packages/core/data-models/phase.{proto,cue}`, `packages/core/data-models/schema_ir.{proto,cue}`.

Implement §1.4 and §1.5 exactly. The canonical differ is the substantive work: table/column/index diffing, phase assignment, destructive marking, deterministic ordering, canonical-JSON digest.

Tests must cover: every phase literal parses; unknown phase throws (never defaults); `assertCapabilityPhase` throws for a request capability in `init` and for an init capability in `handle`; dev flag is independent of phase; added-nullable-column → `expand`; dropped column → `contract` + `destructive`; identical schemas → empty plan; **digest changes when `engineVersion` changes with identical steps**; step ordering is stable under input permutation.

---

### Unit B — Yard bindings + localhost seed
**Owns:** `packages/yards/src/**`, `packages/yards/test/**`, `packages/yards/data-models/**`, `packages/yards/contracts/**`, `packages/yards/README.md`.

Implement §1.1 and §1.2. Extend `YardConfig`/`Yard`/`yardToShape` without breaking existing exports (`TOPOLOGY_CONTRACT_VERSION`, `yard`, `yardToShape`, `Yard`, `YardConfig`, `HOBO_YARDS_PACKAGE` must keep working). Preserve every existing invariant: required provider, camp provider coherence, `assertNoCredentials`, deep freeze.

Tests must cover: each parse error code; canonical sort stability; duplicate rejection; pin/slot conflict; a row with neither product nor connectivity rejected; rows surface in `yardToShape`; `seedLocalhostYard` is deterministic (same observations ⇒ deep-equal output, including ordering), labels fidelity, and lists unavailable primitives rather than omitting them; the seeded Yard passes `yard()`'s own parse (it must be a *real* Yard).

---

### Unit C — binding resolution records + events
**Owns:** `packages/bindings/src/resolution.ts`, `packages/bindings/src/events.ts`, additions to `packages/bindings/src/index.ts`, `packages/bindings/test/resolution.test.ts`, `packages/bindings/test/events.test.ts`, `packages/bindings/data-models/binding_resolution.{proto,cue}`.

Implement §1.3. Do not modify existing `binding.ts` / `standard-connectivity.ts` exports. Event records must be frozen, secret-free (reuse the package's existing redaction/parse helpers), and deterministic.

Tests: each event constructor produces a frozen record with the right name; `bindingUnavailable` carries non-empty remediation for every code; a resolution record rejects secret-shaped property values; canonical row keys in `appliedRows` are sorted.

---

### Unit D — selection integration
**Owns:** the selection/matching path under `packages/cloud/src/**` plus its tests. Touch only the files implementing candidate filtering/ranking and their tests.

Apply Yard binding rows as an **additional hard filter** in the existing gate sequence, before ranking, consuming `bindings` from the Yard planning shape (structural — do not import `@hobo/yards`). Add the resolution-time **provider-coherence gate** (definition `providerId` ≠ Yard `providerId` ⇒ `YARD_BINDING_PROVIDER_MISMATCH`). Emit `binding.Resolved` on success and `binding.Unavailable` on refusal, and record applied rows in the existing match decision record so the ADR-0033 audit trail names them.

**Do not touch ranking.** Rows filter; they never reorder. A test must prove this: with rows present and absent, the relative order of surviving candidates is identical.

Tests: unknown product ⇒ `YARD_BINDING_PRODUCT_UNKNOWN`; wrong-provider product ⇒ `YARD_BINDING_PROVIDER_MISMATCH`; rows that exclude every candidate ⇒ `YARD_BINDING_EXCLUDED_ALL`; a row can never admit a candidate that failed another gate; no rows ⇒ behavior byte-identical to today (regression guard).

---

### Unit E — `@hobo/testing`
**Owns:** all of `packages/testing/**` (skeleton `package.json`/`tsconfig.json` already exist — fill in `src/`, `test/`, `data-models/`, `contracts/`, `README.md`).

Implement §1.6. Runner adapters for Vitest and `node:test` behind a two-line import swap; auto-detect the active runner and fail closed with remediation if none is detected. The in-process lane boots the collected graph via `runtime-local`'s local binding resolver; the ephemeral-camp lane is gated. `FidelityReport.prodReadinessClaimable` is false whenever any assertion touched a `mocked` handle.

The README must state plainly what the in-process lane does and does not execute (no real `.wasm` bytes today) and when to use `@hobo/testing` vs `@hobo/conformance` vs `@hobo/contract-harness`.

Tests: default lane is in-process; ephemeral-camp without a Yard throws with remediation and does **not** silently downgrade; `untilReady` fails fast on 401/403 and retries on 404/503 with bounded attempts; fidelity report marks `prodReadinessClaimable: false` when a mocked handle was asserted against; destroy runs reverse dependency order.

---

### Unit F — provider scratch harness in `@hobo/conformance`
**Owns:** `packages/conformance/src/provider-lifecycle.ts` (+ subpath export wiring in its `package.json`), `packages/conformance/test/provider-lifecycle.test.ts`, and additions to its `index.ts`. Do not modify existing suites.

Implement §1.7. Scratch stacks are in-memory only. The suite must exercise create, update-in-place (logical id stable, outputs change), replace (a `stables` field change ⇒ new instance id), delete (idempotent: deleting twice succeeds), adopt (pre-seeded foreign resource becomes owned), and crash-resume (running reconcile twice yields identical outputs and exactly one instance).

Tests: a deliberately broken fake provider (non-idempotent delete; reconcile that creates a second instance on retry) **fails** the suite with a named case — proving the suite has teeth.

---

### Unit G — `@hobo/adapter-drizzle`
**Owns:** all of `packages/adapters/adapter-drizzle/**` (skeleton exists — fill it in).

Implement §1.8. Structural ingestion: read exported objects, recognize table-shaped values and their column descriptors, produce `SchemaIr`; anything unrecognized becomes an impedance finding with a code and detail (per ADR-0144, impedance is documented, never silently dropped). `createDrizzleDiffEngine().diff` delegates to core's `diffSchemaIr` and stamps engine id/version; `emitSql` throws `TOOLCHAIN_UNAVAILABLE` with remediation when the toolchain flag is false.

Tests: ingestion of a representative schema module; unknown construct ⇒ impedance finding, not a throw and not a silent drop; `emitSql` without toolchain throws with remediation; the same schema module ingested twice is deep-equal; engine version appears in the plan digest.

---

### Unit H — `@hobo/adapter-better-auth`
**Owns:** all of `packages/adapters/adapter-better-auth/**` (skeleton exists — fill it in).

Implement §1.9. Descriptor, config parse (rejecting inline secrets), versioned claims→principal mapping, declared required ports. Include a small conformance case list proving the mapping is total over the claim shapes it accepts and rejects the rest.

Tests: inline secret rejected with a typed code; valid `secretRef` accepted; missing `basePath` rejected; claims mapping is deterministic and version-stamped; unknown claim shape rejected rather than coerced; descriptor lists required ports including the relational store and brokered secrets.

## 3. Gates — run these; all must pass

From the repo root, with `NODE_OPTIONS=` cleared (this environment exports an incompatible `--import tsx` that breaks child Node processes):

```bash
NODE_OPTIONS= pnpm run test:unit              # unit tests
NODE_OPTIONS= pnpm run test:schema            # proto/CUE schema drift
NODE_OPTIONS= pnpm run test:contract          # PACT consumer + provider
NODE_OPTIONS= pnpm run lint:boundaries        # import-direction rules
NODE_OPTIONS= pnpm run architecture:guard     # PACT/protobuf/CUE/parse/event evidence
NODE_OPTIONS= pnpm run konsistent             # cross-package consistency
NODE_OPTIONS= pnpm run lint:code              # Biome formatting
NODE_OPTIONS= pnpm run docs:design-lint       # design-doc anchors/ADR ids/event families
NODE_OPTIONS= pnpm run docs:okf               # frontmatter
```

Scope your test runs to your package while iterating; run the full set before declaring done. **Do not run `pnpm install`** — the workspace is already installed and a concurrent install would corrupt the lockfile for the other agents. If you believe you need a new third-party dependency, you almost certainly do not: prefer structural typing and the standard library. Add nothing to the root `package.json`.

If a gate fails for a reason outside your unit's files, report it in your final message rather than editing another unit's files.

## 4. Definition of done (per unit)

1. Every symbol in your §1 contract is exported with the exact name and shape.
2. Tests cover the named cases plus the error path of every typed error code you introduce.
3. `data-models/` carries proto + CUE for each new record contract; `contracts/` carries PACT material where your package has a boundary; `pact-inventory.md` lists it.
4. README documents the surface and carries `## HONEST SCOPE` naming what is simulated/gated/unimplemented.
5. No secrets, no clock, no randomness in pure paths; collections sorted; records frozen.
6. The gates in §3 pass for your package.
7. Your final message reports: files created/changed, the exported surface, test counts, which gates you ran with their outcome, and anything you deliberately did **not** implement with the reason.

## 5. Repo conventions (authoritative — copy these shapes)

### 5.1 Package layout (enforced by `konsistent`)

A package directory contains **exactly**: `package.json`, `tsconfig.json`, `LICENSE`, `README.md`, `src/`, `test/`, `contracts/`, `data-models/`.

`package.json` (tabs, mirroring `packages/bindings/package.json`):

```json
{
	"name": "@hobo/<name>",
	"version": "0.0.1",
	"license": "MIT",
	"description": "<one sentence, concrete>",
	"type": "module",
	"files": ["LICENSE", "dist"],
	"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
	"publishConfig": { "access": "public" },
	"dependencies": { "@hobo/core": "workspace:*" },
	"devDependencies": { "@types/node": "^22.15.29", "vitest": "^4.1.9" },
	"scripts": {
		"prebuild": "pnpm --filter @hobo/core build",
		"build": "tsc -p tsconfig.json",
		"typecheck": "tsc --noEmit -p tsconfig.json",
		"lint": "biome check .",
		"pretest": "pnpm run build",
		"test": "vitest run test/",
		"test:unit": "vitest run test/"
	}
}
```

`tsconfig.json` — byte-identical everywhere:

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
	"include": ["src"]
}
```

(Adapters under `packages/adapters/<name>/` use `"extends": "../../../tsconfig.base.json"`.)

There is **no per-package vitest config** — the root config is used; tests live in `test/*.test.ts` and run via `vitest run test/`.

### 5.2 TypeScript style (Biome + `tsconfig.base.json`)

Inherited compiler flags that will bite you: `strict`, `module`/`moduleResolution: nodenext`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, **`exactOptionalPropertyTypes`**, `declaration`.

- **Tabs**, double quotes, semicolons, trailing commas (Biome defaults; linter is on for `packages/**`).
- **Relative imports carry `.js`**: `from "./ids.js"`, tests `from "../src/index.js"`.
- **Inline type modifier**: `import { foo, type Bar } from "…"` / `export { foo, type Bar } from "./x.js"` — required by `verbatimModuleSyntax`.
- **Named exports only. No default exports.** `src/index.ts` is a pure barrel: one re-export block per module, values then `type` entries.
- `exactOptionalPropertyTypes` means you may **not** assign `undefined` to an optional property. Build objects conditionally (`...(x !== undefined ? { x } : {})`) rather than setting `x: undefined`.
- `noUncheckedIndexedAccess` means `arr[0]` is `T | undefined` — narrow before use.
- Closed vocabularies: `export const FOO = [...] as const; export type Foo = (typeof FOO)[number];`
- Branded types: `declare const brand: unique symbol; export type X = string & { readonly [brand]: "X" };` constructed only via `parseX`.
- Errors: `export class XError extends Error { readonly code = "SCREAMING_SNAKE" as const; }` with `this.name = "XError"` in the constructor.
- `readonly` on every field, `readonly T[]` for arrays, `Object.freeze` exported constant arrays/records.
- Non-barrel modules open with a `/** … */` block explaining **why** the module exists. Regex literals carry the `u` flag.

### 5.3 Tests

**vitest only** (`import { describe, expect, it } from "vitest";`) — never `node:test` inside `packages/`. Import through `../src/index.js`. Patterns in use: module-scope fixture factories (`function candidate(overrides: Partial<X>): X`), `it.each([[input, "why"], …])`, `expect(() => f(x)).toThrow(/msg/u)` or `.toThrow(ErrorClass)`, and negative cases that assert an error **`code`** rather than a message.

**How to run tests as an agent.** `scripts/run-tests.ts` deliberately refuses broad categories when it detects an agent environment (`CLAUDECODE`, `CI_AGENT`, `CODEX`, `CURSOR_AGENT`): `unit`, `all`, `contract*` throw without `--final`, and any run touching more than three test files throws without `--changed`/`--final`. Use per-package runs while working:

```bash
NODE_OPTIONS= pnpm --filter @hobo/<name> run test
NODE_OPTIONS= pnpm --filter @hobo/<name> run typecheck
NODE_OPTIONS= pnpm --filter @hobo/<name> run lint
```

Do **not** run root `test:unit`/`test:all`/`check:all` — the coordinator runs the final validation.

### 5.4 `data-models/` — proto + CUE (both required)

Filenames are `snake_case` matching the concept; the `.cue` mirrors the `.proto` basename. Proto: `syntax = "proto3"; package hobo.<snake_domain>.v1;`, messages named `<Concept>Record`, fields `snake_case`. CUE defines **one definition per proto message/enum name, prefixed with `#`** — the guard greps `#<Name>:` — with real constraints (regex patterns, enums, cross-field invariants), tab-indented with aligned values. Both files open with a `//` comment explaining what the invariants are load-bearing for. These are **not compiled** unless the package adds `data-models/buf.yaml` — do not add one.

Guard rule `parallel-proto-type`: a TS `interface X`/`type X = {` whose name equals a proto message name is an error unless the line (or the one above) contains `domain-view:` or `parallel-type-allowed:`. Simplest avoidance: **suffix proto messages with `Record`** and keep TS names unsuffixed.

### 5.5 `contracts/` — PACT

Minimum viable (what pure packages ship): one `contracts/pacts/<boundary>.pact.json` with truthy `consumer`, truthy `provider`, and an `interactions` array. Include at least one **refusal** interaction (a fail-closed response with a `code`) — that is the house style and it documents the boundary's honesty.

If you also add `contracts/pact-inventory.md`, the header row must match exactly:

```
| Boundary | Consumer | Provider | Protocol | Pact file/test | Provider verification | Mock used | Status |
```

and **every** `pacts/*.pact.json` on disk must appear in column 5. An inventory that omits a pact file fails `checkPactInventory`. Executable consumer/provider tests are optional for pure packages; if you add them, declare `"test:contract:consumer": "vitest run contracts/consumer"` / `"test:contract:provider": "vitest run contracts/provider"` in `package.json`.

### 5.6 README — two mandatory grep targets

`architecture:guard` greps the concatenated package text. Your README must contain:

1. The phrase **"parse, don't validate"** *and* the phrase **"derived types"** (or "parsed types"). Use a `## Parse, don't validate` section explaining which functions are the parse boundaries and that they return derived domain types.
2. All seven of: **command**, **event**, **actor**, **event store**, **projections** (or "materialized views"), **snapshots**, **read store**. Use an `## Event architecture` section stating truthfully how your package relates to them (e.g. "this package is pure and owns no aggregate; its records are appended as events by the … actor into the durable event store, where projections build the materialized view the read store serves, with snapshots backing current status").

Also include a `## HONEST SCOPE` section naming what is simulated, gated, or unimplemented.

### 5.7 Boundary registration (mandatory for new packages)

`scripts/check-package-boundaries.mts` **throws** on an unknown package path. Any new package must be added to `KNOWN_PACKAGE_PATHS` in `packages/conformance/src/boundaries.ts`. **The coordinator owns that file** — it is already updated for `packages/testing`, `packages/adapters/adapter-drizzle`, and `packages/adapters/adapter-better-auth`. Do not edit it.

Layering rules you must respect:
- `packages/core` may import **nothing** `@hobo/*` except `@hobo/contract-harness`.
- `packages/adapters/*`, `packages/runtimes/*`, `packages/providers/*` are **adapters (layer 2)**: they may import `@hobo/core` and `@hobo/conformance` only — never another adapter, never a layer-3 package.
- Ordinary `packages/*` are **layer 3**: they may import core, `@hobo/wit`, `@hobo/contract-harness`, adapters, and each other. No cycles.

Concretely: `@hobo/adapter-drizzle` and `@hobo/adapter-better-auth` may depend on `@hobo/core` (+ `@hobo/conformance`) and nothing else HoBo. `@hobo/testing` (layer 3) may depend on core, `@hobo/runtime-local`, `@hobo/yards`, `@hobo/bindles`, `@hobo/conformance`.

### 5.8 Existing types you must compose with, not duplicate

- **`@hobo/trails` already owns migration execution**: `SchemaPhase = "expand" | "backfill" | "contract"`, `SchemaApplyPort` (`snapshot`/`applyPhase`/`verify`/`restore`), `DataMigrationPlan { migrationId, expand: string[], backfill: string[], contract: string[], verify }`, `executeDataMigration`, and the `migration.*` event constants. **There is no `SchemaIr` or diff engine anywhere** — that is the actual gap. Unit A's `MigrationPlan` is the *diff output*; it must be mechanically convertible into trails' `DataMigrationPlan` (same three phase names — reuse those literals exactly). Do not reimplement apply, snapshot, or the saga.
- **Selection lives in `packages/cloud/src/planner/profile-matching.ts`**: `matchCapabilityRequirement(input: ProfileMatchInput): ProfileMatchOutcome`, where `ProfileMatchInput` carries `definitions: readonly ResourceDefinitionVNext[]`, and `packages/capability-profiles/src/selection.ts` owns `selectCapabilityImplementation` with its fixed gate order and `REJECTION_CODES`. Yard rows filter **definitions** (they carry `semantics.productId`; `SelectionCandidate` does not), so the filter belongs in `profile-matching.ts` *before* candidate conversion, and the new codes join the rejection surface as `SelectionRejection`-shaped records.
- **`@hobo/bindings`** already owns `CapabilityBinding`, `ConnectivityImplementation`, `createConnectivityRegistry` (whose `resolve` already returns `[]` rather than downgrading) and the `CapabilityBindingError` code `NO_COMPATIBLE_BINDING`. Extend; do not fork.
- **Event constructor pattern**: a frozen fact per event — `function fact(type, data) { return Object.freeze({ type, schemaVersion, data: Object.freeze(data) }); }` with one `create<Name>Event`/`<name>Event` exported per fact, arrays copied on the way in (see `packages/events/src/events.ts` and `packages/stations/src/events.ts`).
- **`@hobo/yards` internals**: `assertNoCredentials` is module-private with the regex `/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i`; `yard()` deep-freezes and canonicalizes (dedupe+sort) every string list. Reuse those helpers rather than adding parallel ones.
- **`@hobo/stations`**: `stationCapability()` produces `capability:<kind>:<slug>` ids with `provenance: "default" | "discovered" | "declared"`; the localhost seed's `LocalhostCapabilityObservation.capabilityId` uses that id form.

### 5.9 Known pre-existing repo state

`pnpm run lint:boundaries` fails on a clean tree today because several existing packages (`packages/bindings`, `packages/capability-profiles`, `packages/claims`, `packages/trust`, `packages/wasp`, …) were never added to `KNOWN_PACKAGE_PATHS`. The coordinator is fixing that in the same change. If you see that error, it is not yours.
