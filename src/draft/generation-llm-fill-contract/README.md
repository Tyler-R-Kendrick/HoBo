# Generation LLM-Fill Contract POC

Independent POC for HOBO-324. It pins the M1 LLM-fill stage from the
generation pipeline: fill scaffold regions from authoritative contract inputs
while treating material as delimited, untrusted hints.

## Contract

- `fillGenerationCandidate()` consumes a valid HOBO-307 `GenRequest` plus the
  HOBO-321 scaffold candidate handoff.
- The fill candidate preserves the requested artifact kind, target WIT port,
  conformance suite, capability-manifest digest, and claimed capabilities.
- The frozen prompt records the model, seed, authoritative refs, source
  scaffold, and a clearly delimited `BEGIN_UNTRUSTED_MATERIAL` block.
- Candidate evidence is weaker without material, but the candidate still derives
  from WIT, conformance, and Capability Manifest authority.
- `gen.CandidateGenerated` is emitted with the filled candidate digest.

## Scope

This POC does not implement a real LLM provider, prompt-sanitization internals,
validation, repair, certification, or model-routing abstraction. Those are
separate slices. The deterministic filler exists only to prove the fill-stage
contract and event handoff.

## Verification

```powershell
npm.cmd --prefix src\draft\generation-llm-fill-contract test
```
