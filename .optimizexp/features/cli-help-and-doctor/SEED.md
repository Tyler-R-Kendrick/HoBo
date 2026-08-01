# Feature seed

A developer or agent runs the real HoBo CLI help/doctor and gets actionable
status without live cloud credentials.

Re-pointed (optimizexp Phase 1) from repo pnpm scripts to the real product
CLI: scenarios invoke the `hobo` binary (`packages/cli`, built dist or tsx
source) through the shared step definitions in
`../cli-product/steps/bindings.steps.ts`.

Honest status: `hobo --help` lists `doctor`, and the composed `hobo doctor`
handler (packages/hobo) builds again — `doctor --offline --json` returns the
real doctor report via the composed CLI bin (KD-4 fixed; see
`../cli-product/KNOWN-DEFECTS.md`).

evidence:
cli-help-and-doctor-hobo-help-lists-doctor
cli-help-and-doctor-hobo-doctor-real-report
