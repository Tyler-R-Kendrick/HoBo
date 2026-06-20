# Plan 27 — Drivers, Resource Packs & Workload Profiles

> Part of the [HoBo Design Plan Suite](./README.md). The execution + packaging layer beneath Resource Definitions ([Plan 25](./25-resource-definitions-matching.md)) — HoBo's adoption of Humanitec's drivers/packs/profiles ([capture](../../competitors/humanitec/drivers.md)).

## Drivers (generalizing HoBo's IaC adapters)
HoBo's `IacProvider` ([Plan 3](./03-providers-iac.md)) becomes one **Driver** among a taxonomy. A Resource Definition names a driver; a capability provider uses it to realize the resource.

| Driver | Realizes via | Notes |
|---|---|---|
| **`terraform`** | Pulumi Automation API / OpenTofu | primary; any provider; per-resource state ([Plan 3](./03-providers-iac.md)) |
| **`template`** | render manifests/config (Go-template/CUE) | K8s manifests, config files, CRDs |
| **`echo`** | none — **adopt an externally-managed/BYO resource** | pass declared connection info through as outputs; HoBo reads, doesn't provision (gap-filler) |
| **`container`** | run arbitrary provisioning in a **Firecracker Executor** | Pulumi/CFN/scripts; HoBo already sandboxes Executors ([Plan 4](./04-control-plane.md)) |
| **`custom-webhook`** | call a self-hosted HTTP service | signed (SVID) request; returns outputs + optional manifests; any stack |

### Driver interface (conceptual)
```ts
export interface Driver {
  id: "terraform" | "template" | "echo" | "container" | "custom-webhook";
  provision(input: { context: MatchContext; inputs: unknown; oldState?: unknown })
    : Promise<{ outputs: Record<string, unknown>; manifests?: unknown[]; state?: unknown }>;
  destroy(input: { context: MatchContext; state: unknown }): Promise<void>;
  refresh?(input: { context: MatchContext; state: unknown }): Promise<DriftReport>;
}
```
Drivers run inside sandboxed Executors with short-lived scoped creds ([Plan 12](./12-security-multitenancy.md)); outputs flow back as events and into placeholders ([Plan 22](./22-wiring-manifest.md)). `echo` resources are read-only by default (drift behavior is an iteration hook).

## Resource Packs
A **Resource Pack** is a shareable, versioned bundle of Resource Definitions ([Plan 25](./25-resource-definitions-matching.md)) for a common need (e.g. "AWS data tier", "in-cluster preview stack"). Packs live in the **Registry** ([Plan 6](./06-ai-native-agent-auth.md)) with provenance + conformance reports, can be imported and customized by matching, and — the HoBo twist — can be **Forge-generated** from a backend's Hobo Code and certified sandboxed ([Plan 23](./23-stubbable-ai-implementations.md)). `hobo pack add <pack>` installs one.

## Workload Profiles
A **Workload Profile** declares **how a service is realized** on a target — the realization HoBo chooses for a `service`/`web` resource:
- `wasm-component` (default, [Plan 20](./20-wasm-wasi-runtime.md)) · `container` (OCI fallback) · `serverless-function` · `vm`/`microvm` ([Plan 21](./21-resources-catalog.md)).
- Platform engineers define custom profiles (e.g. a Dapr profile, a batch-job profile); the profile influences the manifest/Set the deploy produces ([Plan 22](./22-wiring-manifest.md)) and which provider compute port is used.
- Selected by the resource (default per target) or pinned via `.with(...)`.

## Placeholders / output references
Aligned to Humanitec syntax and HoBo's lazy references ([Plan 22](./22-wiring-manifest.md)):
- Resource outputs: `${resources.<type>.<class>#<id>.outputs.<name>}`
- Context: `${context.app}`, `${context.env}`, `${context.envType}`, `${context.res.id|class|type}`
Resolved at deploy from the resolved graph; unresolved refs fail planning with a precise error.

## Iteration hooks
- Driver authoring SDK + how custom-webhook drivers are registered/trusted (signing).
- Whether `echo`/BYO resources participate in drift/reconcile or stay read-only.
- Template engine choice (Go-template vs CUE vs both).
- Workload-Profile ↔ provider-compute-port negotiation when a target can't satisfy a profile.
