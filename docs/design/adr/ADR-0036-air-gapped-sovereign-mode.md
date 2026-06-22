# ADR-0036 — Air-gapped / sovereign Yard mode

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 28 — HoBo Agent/GitOps/Pipelines](../28-agent-gitops-pipelines.md) (the connected-private Agent) · [Plan 12 — Security & multi-tenancy](../12-security-multitenancy.md) (supply chain, trust roots) · [Plan 4 — The Yard](../04-control-plane.md) (self-host) · [ADR-0023](./ADR-0023-security-posture-commitments.md) (no-egress Forge sandbox) · [ADR-0027](./ADR-0027-secretless-config-and-secrets.md) (in-boundary KMS) · [ADR-0034](./ADR-0034-search-vector-surface.md) (local `embed`) · [ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md) (private ACME) · open [Q20](../09-verification-open-questions.md) (Yard federation) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G6)
- **Origin:** the gap analysis (G6) found that while the HoBo Agent enables *connected-private* deploys, a fully **disconnected / sovereign (zero-egress)** mode — offline registry, in-boundary key custody — was unstated. Designed via brainstorming + grill-with-docs.

## Context
The **HoBo Agent** ([Plan 28](../28-agent-gitops-pipelines.md)) dials a hosted Yard over outbound 443 and keeps credentials + Executors inside the customer network — but it **assumes a reachable hosted Yard**. A classified/regulated/sovereign environment has no such path: no egress to a hosted control plane, the public Registry, public ACME, or hosted AI models. HoBo is already self-hostable (the Yard is a Bindle, [Plan 4](../04-control-plane.md)) and the Forge already runs no-egress ([ADR-0023](./ADR-0023-security-posture-commitments.md)), and recent ADRs added the in-boundary pieces (local `embed` — [ADR-0034](./ADR-0034-search-vector-surface.md); private-ACME-capable certs — [ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md); in-boundary KMS — [ADR-0027](./ADR-0027-secretless-config-and-secrets.md)). What's missing is the **profile that ties them together** and the **honest matrix** of what works, degrades, or needs a substitute with zero egress.

## Decision
1. **Air-gap is a first-class self-hosted Yard profile** — the entire control plane (Yard + Registry + Identity + Executors + runtime + optional models) runs **inside the boundary with zero egress**. The HoBo Agent remains the *connected-private* answer; this profile is the *disconnected/sovereign* answer. The design ships a **capability-degradation matrix** (below).
2. **Artifacts enter via signed offline bundle import** (`hobo registry import <bundle>`): a curated bundle of provider plugins, Hobo Code, Resource Packs, base images, and optional model weights, each carrying **SLSA-style provenance + conformance reports**, **verified in-boundary against the same trust boundary** as the live Registry (signature + provenance + conformance). Transfer is one-way-friendly (sneakernet / data diode); the in-boundary Registry serves the mirror — **no live crawl** of external `/.well-known/hobo-code/`.
3. **In-boundary trust roots + local models, graceful degradation.** Identity issues SVIDs locally (already in-boundary); custom-domain certs use an **internal CA / private ACME** ([ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md)); secrets use **in-boundary KMS/HSM** ([ADR-0027](./ADR-0027-secretless-config-and-secrets.md)); `embed`/Forge/`"use training"` use **local in-boundary models when provisioned, else degrade gracefully** (Forge → human-authored providers only; `"use training"` → static implementation; `embed` → BYO vectors). Telemetry/live-evals stay in-boundary (local OTel collector); **no phone-home**.
4. **The deterministic core never needs a model or egress.** Deploy, Matching ([ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)), migration ([ADR-0032](./ADR-0032-data-portability-schema-versioning.md)), and routing ([ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md)) are pure/local, so an air-gapped deploy works fully regardless of AI availability.
5. **Event:** `registry.BundleImported` (signed-bundle import + verification result) — a supply-chain audit fact.

### Capability-degradation matrix
| Capability | Normal (connected) | Air-gapped substitute |
|---|---|---|
| Registry (Hobo Code / plugins / packs) | crawl `/.well-known/hobo-code/` | **signed offline bundle import** → in-boundary mirror |
| Container/component images | public registry pull | mirrored into an in-boundary OCI registry (bundle) |
| TLS certs (custom domains) | ACME → Let's Encrypt | **internal CA / private ACME** (or provider-managed in-boundary) — [ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md) |
| Identity / SVID | issued by the Yard | unchanged — already in-boundary |
| Secrets | provider KMS | **in-boundary KMS/HSM** — [ADR-0027](./ADR-0027-secretless-config-and-secrets.md) |
| `embed` (search) | hosted embedding API | **local embedding model**, else BYO vectors — [ADR-0034](./ADR-0034-search-vector-surface.md) |
| Forge generation | hosted LLM | **local LLM**, else human-authored providers only |
| `"use training"` | hosted LLM + telemetry | **local LLM**, else static impl; live-evals in-boundary |
| Telemetry / live-evals | hosted/3p sinks | **in-boundary OTel collector**, no phone-home |
| Deploy / match / migrate / route | — | **zero egress, no model needed — always works** |

## Alternatives considered
- **"The HoBo Agent is enough."** Rejected: the Agent presumes a reachable hosted Yard over 443; a truly disconnected network has no such path.
- **Full air-gap out of scope for v1.** Rejected: leaves a known regulated/sovereign-market gap; most of the substrate already exists, so the marginal cost is a profile + a matrix + bundle import.
- **Live caching mirror/proxy for the Registry.** Rejected: requires egress to the public Registry — not air-gap (fine for connected-private).
- **Bake everything into the Yard image.** Rejected: inflexible (rebuild to add a provider/pack), bloated images, no clean incremental-provenance story.
- **Disable all AI in air-gap / require an in-boundary model.** Rejected (both extremes): the chosen "local-or-degrade" keeps AI when a model is present without making it a hard blocker, and never blocks the deterministic deploy path.

## Consequences
- **(+)** HoBo has a real **sovereign/regulated** story: a zero-egress Yard with a documented substitute for every external dependency; deploys work fully without any model or network.
- **(+)** Reuses self-host ([Plan 4](../04-control-plane.md)), the no-egress Forge sandbox ([ADR-0023](./ADR-0023-security-posture-commitments.md)), in-boundary KMS ([ADR-0027](./ADR-0027-secretless-config-and-secrets.md)), local `embed` ([ADR-0034](./ADR-0034-search-vector-surface.md)), and private ACME ([ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md)); the new surface is a profile + signed bundle import + one event.
- **(+)** Bundle import keeps the **same supply-chain trust boundary** (signature + provenance + conformance), so air-gap doesn't weaken trust — a tampered bundle is refused.
- **(−)** Operating an air-gapped install adds toil: producing/curating signed bundles, running an internal CA + in-boundary model, and a manual update cadence (no auto-pull).
- **(−)** AI features are reduced unless the operator provisions a capable local model; this is explicit in the matrix, not a silent surprise.
- **(↔)** Air-gap is a **single in-boundary Yard**; multi-Yard **federation** ([Q20](../09-verification-open-questions.md)) remains separately deferred.
