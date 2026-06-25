# HoBo Monorepo Skeleton Contract

Independent POC for HOBO-1. It models the intended pnpm + Turborepo workspace,
the package tree from `docs/design/architecture.md`, and the first boundary lint
rules without converting the design repository itself into the product monorepo.

## Proven Behaviors

- Root workspace scripts are pinned: `build`, `typecheck`, `lint`, and `test`.
- The required placeholder packages include `packages/core`, adapter families,
  top-level product surfaces, and `examples/hello-bindle`.
- Changesets and conventional commits are required by the workspace contract.
- Adapter packages fail lint when they import another adapter package.
- Circular workspace dependencies fail the cycle check.

## Commands

```powershell
npm.cmd --prefix src\draft\hobo-monorepo-skeleton-contract test
npm.cmd --prefix src\draft\hobo-monorepo-skeleton-contract run build
npm.cmd --prefix src\draft\hobo-monorepo-skeleton-contract run typecheck
npm.cmd --prefix src\draft\hobo-monorepo-skeleton-contract run lint
```
