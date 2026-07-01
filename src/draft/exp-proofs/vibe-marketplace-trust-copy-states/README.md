# Vibe Marketplace Trust Copy States

HOBO-547 pins the branch proof for marketplace trust warning, org-catalog filter,
deprecation, yank, and hidden-listing copy states. This package is an independent
M1 experience proof; it does not build marketplace UI, publisher portal UI,
approval services, scanners, policy engines, notification delivery, support queues,
or launch claims without evidence.

## Contract

The parser in
[`src/vibe-marketplace-trust-copy-states.ts`](./src/vibe-marketplace-trust-copy-states.ts)
turns an untrusted proof record into a parsed `MarketplaceTrustCopyStates` object.
It fails closed when a required fixture, proof mode, path, handoff owner, evidence
source, accessibility note, or scope boundary is missing.

The proof shape is mirrored by:

- [`architecture/vibe_marketplace_trust_copy_states.proto`](./architecture/vibe_marketplace_trust_copy_states.proto)
- [`architecture/vibe_marketplace_trust_copy_states.cue`](./architecture/vibe_marketplace_trust_copy_states.cue)
- [`architecture/pacts/vibe_marketplace_trust_copy_states.pact.json`](./architecture/pacts/vibe_marketplace_trust_copy_states.pact.json)

## Required Fixtures

| Scenario | Path | Proof mode | Owner route | Evidence source |
|---|---|---|---|---|
| `preview-warning` | `stale-or-unknown` | `reference-fixture` | Marketplace Publisher Trust Evidence | `docs/design/marketplace-publisher-trust-evidence.md` |
| `installable-with-evidence` | `happy` | `live` | Capability Review & Approval | `docs/design/capability-review-approval.md` |
| `policy-block` | `blocked` | `simulated` | Org Catalogs | `docs/design/org-catalogs.md` |
| `deprecated-guidance` | `stale-or-unknown` | `reference-fixture` | Registry Distribution | `docs/design/adr/07-portability-extensibility.md#adr-0062` |
| `yanked-support-route` | `support-handoff` | `simulated` | Support Workflow | `docs/design/support-workflow.md` |
| `hidden-listing` | `blocked` | `scope-out` | Marketplace UX | `docs/design/marketplace-ux.md` |

Each fixture carries customer-safe copy, an owner route, an evidence source, and
the complete accessibility note set:
`keyboard-only`, `focus-order`, `semantic-labels`, `contrast`,
`responsive-layout`, `reduced-motion`, `screen-reader-smoke`, and
`state-copy-clarity`.

## Negative Guards

`classifyMarketplaceCopyClaim` rejects copy that overstates:

- security guarantees;
- popularity or ratings;
- installability or production readiness;
- registry guarantees;
- support readiness.

These refusals cover the HOBO-547 adversarial cases where marketplace wording
could imply security, popularity, installability, registry, or support guarantees
without linked evidence.

## Verification

Run the package test:

```bash
pnpm --prefix src/draft/exp-proofs/vibe-marketplace-trust-copy-states test
```

The test suite proves fixture coverage, proof-mode coverage, happy/blocked/stale
evidence/support paths, support handoff summaries, scope-out enforcement, safe-copy
classification, and Pact/CUE artifact alignment.

## Design Evidence

Branch evidence is summarized in
[`docs/design/proofs/vibe-marketplace-trust-copy-states/README.md`](../../../../docs/design/proofs/vibe-marketplace-trust-copy-states/README.md).
