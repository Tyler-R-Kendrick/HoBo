# @hobo/patterns

Canonical HoBo **pattern catalog**. SQLite/index files and VS Code snippets are
generated projections. Reference applications under `examples/` stay runnable
apps; they are not the catalog. Starters are pattern renderings. Transforms
are structural effects. Fixtures live beside patterns and prove parse/render
behavior only.

Zero LLM tokens on `hobo-code template` / `/template`. Receipts record
`llmCalls = 0`. Ordinary chat still uses the existing session engine; this
package does not silently intercept it. See [ADR.md](./ADR.md).

## Terms

| Term | Meaning |
|---|---|
| Reference application | Full `examples/*` app / CI fixture |
| Pattern | Versioned semantic concept with renderings |
| Starter | Multi-file project rendering (`starter.cli.*`, OpenUI) |
| Rendering | Snippet, file, project, markdown, VS Code, or effects |
| Catalog | Parsed patterns + content digest |
| Index | Generated retrieval projection |
| Fixture | Parse/render proof only. Starter Gherkin under `patterns/**/features/` is catalog data, not the repo behavior lane. |

## Commands

```sh
pnpm --filter @hobo/patterns test
pnpm --filter @hobo/patterns run eval
hobo-code template search "web frontend backed by an api"
hobo-code template --id bindle.topology.web-api --json
```
