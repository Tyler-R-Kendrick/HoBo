# Plan 3 — Providers, IaC & build/VM adapters

> Part of the [HoBo Design Plan Suite](./README.md).

## Resolution pipeline (SDK → real infra)
1. **Plan** — Planner reads bindle topology + mapping rules → a `DeploymentPlan` (DAG of `ResourcePlan`s, each tagged with its resolved provider + options).
2. **Realize** — each Provider turns its `ResourcePlan`s into an `IacProgram` for the chosen **IaC adapter** (default `@hobo/iac-pulumi`, driven via the **Pulumi Automation API** — embeddable, TS-native, no CLI).
3. **Build** — image/VM resources call **build adapters** (`@hobo/build-dagger` for container images; `build-packer`/`build-firecracker` for VM/microVM images).
4. **Apply** — IaC adapter applies inside a sandboxed executor (Firecracker microVM) with scoped credentials ([Plan 6](./06-ai-native-agent-auth.md)); outputs (URLs, conn strings) flow back as events and become resource bindings.

## IaC adapter port
```ts
export interface IacProvider {
  id: "pulumi" | "cdktf" | "crossplane" | "opentofu";
  preview(program: IacProgram): Promise<Diff>;
  apply(program: IacProgram): Promise<Outputs>;
  destroy(program: IacProgram): Promise<void>;
  refresh(program: IacProgram): Promise<DriftReport>;
}
```
- **Pulumi Automation API** = primary (programmatic, multi-cloud, TS).
- **Crossplane** = the adapter used when a Camp's substrate is Kubernetes.
- **OpenTofu** = open-source HCL path.
- **CDKTF** flagged deprecating (HashiCorp sunset) — support as import-only.
- **Provider-specific config** for each IaC tool is itself passed via `.with(...)` (e.g. Pulumi stack settings, Crossplane composition selectors).

## Build/VM adapter port
Mirrors the IaC port (`build(spec) → ImageRef`):
- **Dagger** for reproducible container pipelines.
- **Packer** for AMIs/VM images.
- **Firecracker** for microVM rootfs.
- **Vagrant** for local VM dev parity.

## Iteration hooks
- The Planner's solving model (cost/region/capability optimization).
- State storage for IaC (per-resource Pulumi stacks vs one stack).
- Drift policy.
- How Crossplane substrate coexists with the TS-native orchestrator.
