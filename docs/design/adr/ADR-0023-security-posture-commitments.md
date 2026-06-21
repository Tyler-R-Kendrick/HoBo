# ADR-0023 — Security posture commitments for v1

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Security, Engineering, Product
- **Related:** [PRD §NFRs](../../requirements/PRD.md) · [TRD §5.6/§5.9/§5.12](../../requirements/TRD.md) · [12 Security](../12-security-multitenancy.md) · [06 AI/agent](../06-ai-native-agent-auth.md) · [23 Stubbable AI](../23-stubbable-ai-implementations.md) · supersedes nothing
- **Origin:** the requirements security review (see [`plans/README.md`](../../../plans/README.md), findings SEC-01…10).

## Context
The design (esp. [12-security-multitenancy.md](../12-security-multitenancy.md)) names the right threats — runaway/confused-deputy agents, Forge prompt-injection, supply-chain, cross-tenant access — but several mitigations lived only in the threat model or as design prose, not as **verifiable requirements**. A security review of the requirements suite found assumed-but-unstated controls: the legacy static-key escape hatch was unbounded, there was no Gateway/MCP rate-limiting requirement, Forge prompt-injection had no defense requirement, audit retention was "per policy" (unquantified), encryption-at-rest wasn't required across all runtimes, and per-run decryption authorization was unspecified. For an agent-facing control plane that holds other people's cloud credentials and runs AI-generated code, these must be commitments, not aspirations.

## Decision
Commit the following as v1 security requirements (each lands as an `NFR`/`TR` with a verification method):
1. **Bound the legacy static-key escape hatch** — any static API key carries a maximum TTL and an enforced rotation schedule, is fully audited (`token.*`), and is only reachable behind an explicit opt-in; federation is always preferred. (TR-051, NFR-005)
2. **Rate-limit & quota the Gateway/MCP surface** — per-principal (SVID/OIDC) and per-tenant limits with backpressure; exceeds return a typed throttle error. Protects against runaway agents and DoS. (TR-071, NFR-019)
3. **Forge generation is hardened against prompt injection** — source docs/OpenAPI fed to Forge are scanned/sanitized; the signed provenance includes a scrub report; conformance runs with **no egress** as a hard requirement (not a default). (TR-083)
4. **Confused-deputy default-deny** — before any agent obtains a scoped token, the policy engine checks `{principal, tenant, resource, action}`; cross-tenant issuance is denied unless explicitly delegated. (TR-053)
5. **Quantified audit retention** — `token.*`/`resource.*`/policy-decision streams are retained for a defined minimum and never compacted. (NFR-018, TR-052)
6. **Encryption everywhere it matters** — envelope encryption at rest for event streams across **all** runtimes (not just `runtime-local`); per-run payload decryption requires log-read **and** explicit authorization (run-owner / `decrypt:run`). (TR-111)
7. **Supply-chain specifics** — all published artifacts carry CycloneDX SBOMs; CI blocks publishing on CVSS ≥ 7.0 (with a documented waiver path); plugins signed with SLSA-style provenance. (TR-112)

## Alternatives considered
- **Leave these in the threat model only** — rejected: a threat model is not a testable control; reviewers and customers need requirements.
- **Forbid static keys entirely** — rejected: some providers require them; a bounded, audited, opt-in escape hatch is the pragmatic compromise.
- **Per-TR test-spec document now** — deferred: concrete attack-scenario test specs (SEC-10) are valuable but belong to the build phase; the ADR names the scenarios so they aren't lost.

## Consequences
- **(+)** The security promises become verifiable gates, not prose; regulated adopters (BR-010) can assess them.
- **(+)** The agent-facing surface (the product's differentiator) gets explicit abuse-case defenses.
- **(−)** More requirements to implement and test (rate-limiting infra, per-runtime encryption, Forge doc-sanitization). Some (e.g. encryption on every runtime) depend on the runtime adapter's capabilities — stated as opt-in-where-unsupported with the gap documented.
- **(−)** Rotation/TTL on legacy keys may friction a few provider integrations; mitigated by federation-first and the documented waiver path.
