# Feature seed

A developer or agent runs the real product CLIs (`hobo` from `@hobo/cli`,
`hobo-code` from `@hobo/code`) and gets discoverable help, honest JSON
envelopes, and non-zero exits on failure — without live cloud credentials.

Scenarios invoke the actual binaries (built `packages/cli/dist/bin/hobo.js`
when present, else `pnpm exec tsx packages/cli/src/bin/hobo.ts`; hobo-code
via `pnpm exec tsx packages/code/src/bin/hobo.ts`). One-time setup for the
`hobo` bin: `pnpm --filter @hobo/cli... run build`.

Known-defect characterizations live in KNOWN-DEFECTS.md; affected scenarios
are tagged `@known-defect` and assert CURRENT behavior so the suite stays
green until the owning fix flips them.

evidence:
cli-product-hobo-cli-help-lists-verbs
cli-product-hobo-code-json-envelope-shape
