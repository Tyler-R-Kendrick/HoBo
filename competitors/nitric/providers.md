# Nitric — Provider Model, Runtime Contract & SDKs

> How Nitric maps resources to clouds, the gRPC runtime "membrane", custom providers, and language SDKs. Part of the [Nitric competitor reference](./README.md).

## Provider architecture (two layers)
A Nitric **provider** is a single compiled binary implementing two layers:

1. **Deployment layer** (Go) — translates the collected resource spec into cloud infra using **Pulumi** or **Terraform (CDKTF)**. Interface (illustrative):
   ```go
   type NitricPulumiProvider interface {
     Init(ctx *pulumi.Context) error
     Pre() error
     Config() map[string]interface{}
     Order() []string
     Api(...) error;  Bucket(...) error;  Service(...) error
     Topic(...) error; Queue(...) error;  /* ... per resource ... */
     Result() error
   }
   ```
2. **Runtime layer** (gRPC) — implements Nitric's proto service contracts; executes at runtime, translating SDK calls into cloud API calls.

## Pre-built providers
- **Pulumi-based** (direct deploy): `aws`, `gcp`, `azure`.
- **Terraform-based** (emit CDKTF to `cdktf.out/` for review): `aws`, `gcp`, `azure`.
- Selected/swapped purely in **stack config** (`provider: aws`), no code change.

## Custom providers (extensibility)
Two paths:
1. **Extend** an existing provider — replace a resource's implementation (e.g. S3 → DigitalOcean Spaces via S3-compatible API), add pre/post hooks, inject config. Reference as `provider: custom/extension@0.0.1`.
2. **Build new** — for other clouds (DigitalOcean, Linode…), on-prem, Kubernetes, or specialized needs.

Project structure & install:
```
provider-repo/
  cmd/deploy/   cmd/runtime/   deploy/   runtime/   Makefile   main.go
# compiled to a single binary placed at:
~/.nitric/providers/custom/<name>@<version>
```

## The runtime contract ("the Membrane", gRPC + protobuf)
SDKs are thin gRPC clients of the runtime. Contracts live in `github.com/nitrictech/contracts`. Representative services/ops:
- **Document/KV:** `Get`, `Set`, `Delete`, `Query`
- **Storage:** `Read`, `Write`, `Delete`, `ListFiles`, `DownloadUrl`, `UploadUrl`
- **Queue:** `Enqueue`, `Dequeue`, `Complete`
- **Topic:** `Publish`, `Subscribe`
- **Secrets:** `Put`, `Access`, `AccessVersion`
- **SQL:** `ConnectionString`
This proto boundary is what makes the SDKs language-agnostic and the providers swappable.

## Deployment flow (`nitric up`)
1. **Build** — each service → container image (autodetected runtime, standard or custom Dockerfile).
2. **Resource collection** — run each service in collection mode; capture (don't execute) all resource/`.allow()` declarations → resource spec/graph.
3. **Provider invocation** — pass spec to the provider plugin; Pulumi deploys directly, Terraform emits CDKTF.
4. **Deploy** — infra created/updated; **5. Output** — URLs/endpoints returned.

## Language SDKs (over gRPC)
| Language | Status | Package |
|---|---|---|
| Node.js | Full | `@nitric/sdk` |
| Python | Full | `nitric` |
| Go | Full | `github.com/nitrictech/go-sdk` |
| Dart | Experimental | `nitric` |
| C#/.NET, JVM | v0 / legacy | `nitrictech/dotnet-sdk`, `nitrictech/jvm-sdk` |

Each SDK = resource constructors + `.allow()` + handler registration + a gRPC client generated from the proto contracts.

## Configuration
- **`nitric.yaml`** (project): `services` (match glob, runtime, start cmd), `batch-services`, `websites`, custom `runtimes` (Dockerfile/context/args).
- **Stack files** `nitric.<stack>.yaml` (per target/env): `provider`, `region`, provider-specific config (profile/project/subscription). One per environment; swappable.
- **`.env`/secrets** included at deploy; in-code via env vars or `secret()`.
