# Atomic snippets

Git-backed snippet atoms. Each folder is one concept:

- `meta.json` — id, tier, tags, queries, `requires` / `provides`, params
- `body/` — literal `{{param}}` files
- `acceptance.json` — deterministic fill fixture

The catalog loader treats these as first-class patterns. Users reach them
with the same zero-LLM command as the rest of the catalog:

```sh
hobo-code template list
hobo-code template --id bindle.web-only
hobo-code template render bindle.web-api --name greeter
hobo-code template "web only bindle"
```

`../compositions/` still lists multi-atom recipes for chat compose.
Closed intents in `packages/code/templates/intents/` match in the Bo chat
session. Same-path snippets merge by `@hobo.entity` / `@hobo.slot` /
`@hobo.hole`.
