# hello-bindle — Vercel deployment target

This directory is the deployable realization of the [`hello-bindle`](../../) example
for Vercel. It reproduces the bindle's exact observable contract:

- `GET /` — the web page (`index.html`).
- `GET /hello?name=<name>` — the API (`api/hello.js`), returning
  `{ "message": "hello, <name>" }` with the same parse default (`"world"`),
  mirroring [`src/api.ts`](../../src/api.ts). The `/hello` route is mapped to the
  function by [`vercel.json`](./vercel.json).

It is self-contained (no build step, no dependencies) so it deploys on Vercel's
native runtime with zero configuration.

## Deploy

Any of:

- **Vercel CLI:** from this directory, `vercel deploy` (preview) or
  `vercel deploy --prod` (production).
- **Vercel Git integration:** import the repo in Vercel and set the project's
  root directory to `examples/hello-bindle/deploy/vercel`.
- **Vercel MCP / dashboard "Add New… Project":** point it at this directory.

## Relationship to HoBo

In the full platform, `hobo up` collects this bindle into its manifest IR, the
Planner produces a `DeploymentPlan`, and a `CloudProvider.realize()` emits the
provider-specific program that a `Yard` applies. This directory is the
already-realized artifact for the Vercel target, checked in so the deployment is
a single action.
