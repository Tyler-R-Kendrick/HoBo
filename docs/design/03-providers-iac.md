# Plan 3 — Providers, IaC & build/VM adapters

> Part of the [HoBo Design Plan Suite](./README.md). The ports/adapters layer that turns agnostic Bindles into real infra. See [Plan 2 §Layer 2](./02-sdk-api.md) and [Plan 4](./04-control-plane.md).

## The three adapter families (one shape)
Everything that touches the outside world is a port with swappable adapters:
- **CloudProvider** — implements capability ports (`database`, `compute`, …) for a backend (AWS/Azure/GCP/Cloudflare/Fly/K8s).
- **IacProvider** — the *mechanism* a CloudProvider uses to realize resources (Pulumi/CDKTF/Crossplane/OpenTofu).
- **BuildProvider** — produces images/rootfs (Dagger/Packer/Firecracker/Vagrant).

A CloudProvider composes the other two: it declares *what* a resource is, then emits an `IacProgram` (and optionally a `BuildSpec`) for the chosen IaC/Build adapters to execute.

## Port & provider interfaces
```ts
// A capability port (one of many): the agnostic contract apps depend on
export interface DatabasePort {
  kind: "database";
  engine: "postgres" | "mysql" | "sqlite" | "mongo" | "kv";
  // requested features the provider must satisfy/negotiate
  features?: { managed?: boolean; ha?: boolean; vector?: boolean; serverless?: boolean };
}

export interface Capability {
  port: PortKind;                       // "database" | "compute" | "objectStore" | ...
  satisfies(req: PortRequest): Match;   // full | partial(missing[]) | none — capability negotiation
  estimateCost(req: PortRequest): CostSignal;
}

export interface CloudProvider {
  id: string;                                   // "aws"
  regions: string[];
  capabilities: Capability[];
  realize(plan: ResourcePlan): { iac: IacProgram; build?: BuildSpec };
  code(): HoboCode;                             // machine-readable signs (Plan 6)
  client(port: PortKind, outputs: Outputs): unknown; // the runtime client for ctx.bindings
}

export interface IacProvider {
  id: "pulumi" | "cdktf" | "crossplane" | "opentofu";
  preview(program: IacProgram): Promise<Diff>;
  apply(program: IacProgram): Promise<Outputs>;
  destroy(program: IacProgram): Promise<void>;
  refresh(program: IacProgram): Promise<DriftReport>;
}

export interface BuildProvider {
  id: "dagger" | "packer" | "firecracker" | "vagrant";
  build(spec: BuildSpec): Promise<ImageRef>;
}
```

## The Planner: Bindle + mapping → DeploymentPlan
The Planner is a pure function (easy to test, replayable): `plan(bindle, config, registry) → DeploymentPlan`. Steps:

1. **Collect resources** from the Bindle into nodes; collect `bind` edges into a dependency DAG.
2. **Resolve a provider per resource** by precedence:
   `bindings[name]` (explicit pin) → `tiers[serviceModel]` → `defaultProvider`.
3. **Capability negotiation** — for each (resource, candidate provider) call `Capability.satisfies(request)`:
   - `full` → accept.
   - `partial(missing)` → if the request used `prefer`, accept with a `PlanWarning` (degrade, e.g. emulate `vector` via an extension or fall back to a container); if `require`, reject the candidate.
   - `none` → reject.
   - If a pinned provider can't satisfy a `require`, emit `deployment.PlanRejected` with a precise reason (good for agents to self-correct).
4. **Region & colocation** — honor explicit regions; otherwise pick a region satisfying all colocated resources' constraints (latency edges from `bind`), minimizing cross-provider/cross-region egress.
5. **Cost shaping** (optional, [Plan 16](./16-cost-finops.md)) — when multiple candidates satisfy `full`, choose by a cost/latency objective; record the rationale as `meta` on `deployment.Planned`.
6. **Emit `DeploymentPlan`** — DAG of `ResourcePlan{ name, port, provider, options, deps, strategy }`, each tagged with its resolved provider + merged `.with(...)` options (only the resolved provider's block survives).

The plan is content-addressed and stored via `deployment.Planned`, so the exact decisions are auditable and re-runnable.

```mermaid
flowchart TD
  B[Bindle + hobo.config] --> P{Planner}
  R[(Registry: Hobo Code<br/>capabilities + cost)] --> P
  P -->|resolve provider| RP[ResourcePlan x N]
  P -->|reject| X[deployment.PlanRejected<br/>precise reason]
  RP --> DAG[DeploymentPlan DAG]
```

## Resolution pipeline (plan → real infra)
1. **Plan** — as above.
2. **Realize** — each CloudProvider turns its `ResourcePlan`s into an `IacProgram` for the chosen IaC adapter (default `@hobo/iac-pulumi` via the **Pulumi Automation API** — embeddable, TS-native, no CLI shell-out).
3. **Build** — image/VM resources call BuildProviders (`@hobo/build-dagger` for container images; `build-packer`/`build-firecracker` for VM/microVM images). Output `ImageRef`s feed back into the IaC program.
4. **Apply** — IaC adapter runs `preview` then `apply` inside a Firecracker Executor with scoped creds ([Plan 12](./12-security-multitenancy.md)); `Outputs` (URLs, conn strings) become resource bindings and flow back as events.

## IaC backends
- **Pulumi Automation API** = primary (programmatic, multi-cloud, TS-native, real language for compositions).
- **Crossplane** = the adapter used when a Camp's substrate is Kubernetes (compositions + managed resources; reconciliation delegated to k8s controllers).
- **OpenTofu** = open-source HCL path (wrap the binary; state via supported backends).
- **CDKTF** = **import-only** (HashiCorp sunset) — read existing stacks, don't author new.
- Provider-specific IaC config is passed via `.with(...)` too (e.g. Pulumi stack settings, OpenTofu backend, Crossplane composition selectors).

## IaC state model
- **Per-resource stacks by default:** each resource owns an isolated IaC stack (Pulumi stack / TF workspace) keyed by `tenant/deployment/resource`. Benefits: blast-radius isolation, independent reconcile/lock, clean compensation (destroy one slice). Cost: more state objects — acceptable.
- **State backend:** pluggable; default to the Yard's own object store; locking via the resource's ActorHost lease (single-writer already guaranteed, so IaC-level locks are belt-and-suspenders).
- **Outputs → bindings:** stack outputs are captured into `resource.Provisioned` and resolved into the dependent resources' env/secret refs.
- **Drift:** `refresh()` feeds the drift loop in [Plan 5](./05-reliability-ha.md).

## Cross-cloud equivalence classes
Agnostic ports map to provider services via curated equivalence classes (extensible, and what the [Forge](./06-ai-native-agent-auth.md) targets):
| Port (request) | AWS | Azure | GCP | Cloudflare | Fly |
|---|---|---|---|---|---|
| `database{postgres,managed}` | RDS/Aurora PG | Flexible Server | Cloud SQL PG | (Neon/Hyperdrive) | Fly Postgres |
| `objectStore` | S3 | Blob | GCS | R2 | Tigris |
| `compute{container}` | Fargate/App Runner | Container Apps | Cloud Run | Workers/Containers | Machines |
| `queue` | SQS | Service Bus | Pub/Sub | Queues | (NATS) |
| `cache` | ElastiCache | Cache for Redis | Memorystore | KV | Upstash |

## Build / VM adapters
- **Dagger** — reproducible container build pipelines, defined in TS, run in containers; primary image path for `compute`/`containerService`.
- **Packer** — baked VM images (AMI/Azure image) for `vm`.
- **Firecracker** — microVM rootfs for `microVm` and the Executor sandbox itself.
- **Vagrant** — local VM parity for `hobo dev` when a resource truly needs a VM.

## Authoring a provider (human or Forge)
A provider package exports: (1) a factory (`aws({...})`) returning a `CloudProvider`, (2) typed `.with(...)` option builders per port (`aws.rds`, `aws.fargate`), (3) capability declarations + equivalence mappings, (4) `realize()` emitting IaC, (5) a runtime `client()` per port, and (6) a `code()` Hobo Code manifest. It must pass `@hobo/conformance` for every port it claims — that suite is the contract that lets AI-generated providers be trusted ([Plan 6](./06-ai-native-agent-auth.md), [Plan 9](./09-verification-open-questions.md)).

## Iteration hooks
- Planner objective function when several providers fully satisfy (cost vs latency vs carbon vs "stay on one provider").
- Per-resource vs grouped IaC stacks (isolation vs state sprawl).
- How `prefer` degradation is surfaced/approved (silent warning vs require ack).
- Maintaining equivalence classes by hand vs Forge-generated + curated.
- Crossplane substrate: delegate reconciliation to k8s vs keep ResourceActors authoritative.
