# HOBO-396 IfC author flow contract

This POC proves the end-to-end IfC authoring path on a sample Bindle without touching provider deploy or runtime execution.

- `runIfcAuthorFlow()` composes existing contract modules for resource collection, collection coverage, usage-inferred permissions, XAA scope inference, SDK codegen, and manifest validation.
- The sample Bindle declares `api`, `kv`, `bucket`, `queue`, `config`/secret, bind wiring, and a `crossApp("asana")` call.
- The flow emits a validated `hobo.manifest/v1`, inferred least-privilege `allow` sets, a `ctx.user` XAA scope subset, and deterministic `_generated/` artifacts.
- The normal test run writes `contracts/manifests/support-desk.manifest.json`, mirroring the Pact pattern where consumer tests materialize a broker-uploadable JSON contract artifact.
- A generated consumer type-checks those `_generated/` declarations with `tsc --noEmit`.
- Coverage gaps fail before codegen when static analysis finds a resource on an unobserved branch.
- `.allow()` narrowing below observed usage fails the permission contract before codegen or manifest publication.
- Re-running the flow yields byte-identical manifest hashes and generated artifacts.
- The manifest artifact writer fails closed if collection coverage or permission contracts fail, so tests never publish a partial manifest IR.

Scope stays integration-only: no cloud deploy, provider planning, runtime handler execution, conformance harness internals, or SLO/policy implementation.
