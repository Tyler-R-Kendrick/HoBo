# Draft package instructions

Drafts iterate, roll up, and refine requirements — they are proof material, not the product.
Real implementations land as monorepo packages under `packages/` via lift-and-leave promotion
(with `reference-implementation.yaml` provenance back to the proof). Do not grow a draft into a
production implementation in place.

Run package-scoped checks first. For source or contract proof edits under one draft package, prefer:

```bash
pnpm exec turbo run test --filter ./src/draft/<kind>/<package>   # exp-proofs: ./src/draft/exp-proofs/<type>/<package>
```

Testing policy: no `test:e2e` lane and no live downstream services. Keep browser or behavior tests mocked from Pact/protobuf/CUE fixtures. Draft package `test/` files are treated as unit/contract proof tests by the root targeted checker.

## Folder guides

Layer-specific agent instructions live beside the proofs:
[technical-proofs](technical-proofs/AGENTS.md) · [epic-proofs](epic-proofs/AGENTS.md) ·
[exp-proofs](exp-proofs/AGENTS.md) (plus one per type folder) · [projects](projects/AGENTS.md).
New proofs scaffold from `_templates/<layer>/`; the draft-artifact and cascade gates
(`pnpm run draft:artifacts`, `pnpm run draft:cascade`) run automatically via `agent:check`.
