# Experience proofs — agent instructions

Experience proofs live under a type folder: `src/draft/exp-proofs/<type>/<slug>`, classified in
[`_classification.md`](_classification.md). Layer reference:
`.claude/skills/draft/references/exp-proofs/process.md` (use the **draft** skill).

| Type | Audience | Required artifacts (gate-enforced by `pnpm run draft:artifacts`) |
|---|---|---|
| `dx` | developers/operators | pseudo-code, protobuf + CUE contracts, mermaid diagrams |
| `ux` | end users | `assets/` with **real visuals** (SVG/PNG wireframes, mockups, screenshots). Interactive/game proofs also require Playwright **screenshots + MP4 recordings** + `evidence-manifest.json` (see `ux/AGENTS.md`) |
| `cx` | customers/publishers | journey maps/scripts, comms fixtures (`assets/*.md` or `journeys/`) |
| `ax` | agents | MCP transcripts, tool schemas, llms.txt fixtures (`assets/` or `transcripts/`) |
| `api` | API/SDK consumers | interface declarations, type tests (`type-tests/`), example consumers |

All types additionally need `proof.json` (with matching `experienceType`), executed `examples/`,
and an executed `notebook.ipynb` demonstrating the experience.

## Run / modify

- `pnpm exec turbo run test --filter ./src/draft/exp-proofs/<type>/<slug>` (note the THREE-level path)
- Moving/reclassifying a package: `git mv` + update `_classification.md` + rerun the gates.
- Changing an exp proof cascades: update referencing epic rollups in the same diff
  (`pnpm run draft:cascade -- --staged` enforces; see the per-type AGENTS.md and
  `src/draft/epic-proofs/AGENTS.md`).

New packages: scaffold from `src/draft/_templates/exp/` into the right type folder.
