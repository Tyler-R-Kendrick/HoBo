# @hobo/cli

HoBo command-line shell and `hobo new` scaffolds for the S1 local developer loop.

Promotes:

- `src/draft/technical-proofs/hobo-cli-shell-contract/` (CLI shell, parser, registry, renderer, dispatch seam)
- `src/draft/technical-proofs/hobo-new-scaffold-contract/` (`hobo new` offline scaffolds)
- `src/draft/epic-proofs/cli-mcp-developer-experience/` (CLI↔MCP parity boundary)

## Surface

Canonical verbs only: `up`, `down`, `dev`, `new`, `login`, `claim`, `plan`, `verify`, `can-deploy`, `inspect`, `logs`, `doctor`, `codegen`, `build`, `collect`, `stub`, `drift`, `add`, `registry`, `import`, `generate`, `sandbox`, `test`, `attest`, `erase`, `derivative`, `runbook`.

Global flags: `--json`, `--camp <camp>`, `--cwd <path>`, `--verbose`, `-q`, `--help`.

`hobo dev` behavior and the `@hobo/mcp` server land in later S-stage slices. This package exposes `dispatchCommand` for MCP parity.

## Usage

```bash
pnpm exec turbo run build --filter @hobo/cli
node packages/cli/dist/bin/hobo.js --help
node packages/cli/dist/bin/hobo.js new my-app -t api
```

## Contracts

- `contracts/cli-command-path.pact.json` — shell ↔ command registry boundary
- `contracts/hobo-new-scaffold.pact.json` — scaffold boundary

Data models live in `data-models/` (protobuf + CUE).
