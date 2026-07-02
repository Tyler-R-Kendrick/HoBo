# Project MVP rollups — agent instructions

Projects integrate epic proofs into a scoped MVP. Layer reference:
`.claude/skills/draft/references/projects/process.md`.

**When a project proof needs behavior to change, use the draft skill to modify the EXISTING
upstream draft** (technical/exp/epic proof) — plan the change, review the blast radius, add the
ADR beside the changed proof — never fork or reimplement proof logic inside the project.

Required (gate-enforced for new packages): `proof.json` linking every integrated epic in
`references.epicProofs`; rollup + propagation ledgers; an **Install / Configure / Run** README
section verified by actually running it; per-experience-type evidence (`dx`·`ux`·`cx`·`ax`·`api`)
captured from the running project; executed `examples/` + `notebook.ipynb`.

Scaffold from `src/draft/_templates/project/`. Do not create fake MVPs — the registry
(`_registry.md`) stays empty until a project has an owner, outcome, and scope.
