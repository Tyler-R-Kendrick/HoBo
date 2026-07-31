---
id: developer
schemaVersion: 1
generatedFromSeed: false
seedDigest: null
experiences: [dx, ax]
priority: 1
interfaces: [cli, docs, config, mcp]
---

# Developer

## Who I am

Application developer shipping Bindles and packages in this monorepo. Comfortable with TypeScript, git, and CLIs. Not a platform engineer; I want the happy path without memorizing every gate.

## Goals

- Change one package and get a green signal in seconds–minutes, not a full CI simulation.
- Know the next command when something fails.
- Trust that local checks match what PR CI will enforce.

## Constraints

- Limited patience for re-running full monorepo suites.
- May work offline; cloud keys are optional friction.
- Context window / attention is scarce when using coding agents.

## Accessibility & inclusion needs

- Prefer text CLI output over color-only status.
- Errors should be readable in screen readers / plain logs (no essential info only in animations).

## Success looks like

- `pnpm agent:check -- --staged` after a focused edit selects a small gate set and exits with clear errors.
- Docs name the same commands as `package.json` scripts.
- Generated files are never a surprise; regen path is one command.

## Failure modes I hate

- Silent skip of tests that later fail in CI.
- Architecture/guard failures without a fix hint.
- Being told to `pnpm install` as the first diagnostic.

## Vocabulary I use

package, filter, staged check, typeerror, contract test, draft proof, gate

## Review instructions

Judge DX and AX surfaces for **friction** (extra steps, broad defaults) and **uncertainty** (docs vs tools mismatch). Flag **harms** if tools dump secrets or hostile language. Prefer findings that shrink the inner loop.
