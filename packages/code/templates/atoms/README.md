# Atomic templates

Git-backed atoms for Bo. Each folder is one snippet:

- `meta.json` — id, tier, tags, queries, `requires` / `provides`, Valibot params
- `body/` — literal `{{param}}` files
- `acceptance.json` — deterministic fill fixture

`../compositions/` lists multi-atom recipes. Runtime: SQLite FTS5 + pinned
local hashed-trigram embedder + RRF. Derived cache:
`$HOBO_HOME/durable/code/template-index.sqlite`. Rebuild:

```bash
pnpm --filter @hobo/code run atoms:index
hobo-code atoms rebuild
```

Closed intents in `../intents/` match before the index (`deploy to azure`,
`bundle apps in the same network`). Same-path snippets merge by
`@hobo.entity` / `@hobo.slot` / `@hobo.hole`. Holes are `"use training"`
skeletons, not authored logic.

High-confidence retrieve emits with zero inference. Full apps under
`examples/` stay composition proofs.
