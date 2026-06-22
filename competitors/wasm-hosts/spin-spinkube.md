# Fermyon Spin & SpinKube — wasm on Kubernetes

> Part of the [wasm-hosts reference](./README.md). Grounds HoBo's **SpinKube / containerd-wasm** `component-host` adapter ([ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)). Source: [spinkube.dev](https://www.spinkube.dev/) · [fermyon.com/blog](https://www.fermyon.com/blog/introducing-spinkube-fermyon-platform-for-k8s) — summarized for analysis.

## Spin
**Spin** (Fermyon) is an open-source framework for building/running **event-driven wasm apps**, primarily **WASI-http** (HTTP-triggered) components. Spin apps are portable: "WASI-http components have many compatible hosts — **Spin (CLI), Fermyon Cloud, Wasmtime, NGINX Unit, SpinKube** …" — direct evidence for **one component, many hosts**.

## SpinKube — wasm as native K8s workloads
**SpinKube** is "an open-source, Kubernetes-native project that streamlines developing, deploying, and operating wasm workloads in Kubernetes" (Microsoft, SUSE, Liquid Reply, Fermyon). Three parts:
1. **Containerd Shim for Spin** — uses **runwasi** so **containerd runs Spin wasm apps** in a cluster (wasm alongside containers, same control plane).
2. **Spin Operator** — define Spin wasm apps as **native Kubernetes resources**; orchestrates deployments/pods/services.
3. **Runtime Class Manager** — installs/updates/configures the containerd shims (lifecycle of the wasm runtime class on nodes).
   (+ a **Spin Kube CLI plugin** for scaffold/deploy/inspect.)

## Why it matters for HoBo
- **Validates the SpinKube/containerd-wasm adapter** in [ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md): a real, K8s-native `component-host` that runs WASI components via a containerd shim — exactly the "k8s-native, shim-level density" adapter HoBo names.
- **Validates the perf basis** of HoBo's cost/density story ([Plan 16](../../docs/design/16-cost-finops.md)/[Plan 20](../../docs/design/20-wasm-wasi-runtime.md)): "~1 ms cold start, ~10 MB memory, <5 MB binary vs container ~300 ms / 50–100 MB."
- **Validates the OCI-container path** ([ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md) v1 default): running wasm *via containerd* (same registry/scheduler as containers) is precisely HoBo's "wasm-in-container reuses the OCI pipeline, zero new infra" default — SpinKube is the K8s expression of it.
- **Capability-based security by default** (deny-by-default sandbox) ≈ HoBo's `.allow()`→link enforcement.

## Refinement surfaced for HoBo (analysis)
- **runwasi/containerd-shim is the concrete mechanism** for both the **wasm-in-container default** *and* the **SpinKube adapter** — HoBo's component-host should target **runwasi** as the containerd integration point rather than a bespoke shim. A small sharpening of [ADR-0031](../../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md).
- **Spin is HTTP-trigger-centric**; HoBo's component-host must also serve non-HTTP ports (queue/actor/workflow), so the Spin *adapter* covers the HTTP-service slice while Wasmtime/in-container covers the rest — consistent with the per-Camp adapter model.

**Net:** SpinKube concretely validates HoBo's wasm-in-container default + SpinKube adapter + the cold-start/density economics, and pins **runwasi/containerd** as the integration mechanism.
