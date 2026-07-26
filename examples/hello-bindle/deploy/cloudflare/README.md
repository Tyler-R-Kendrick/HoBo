# hello-bindle — Cloudflare Workers deployment target

This directory is the deployable realization of the [`hello-bindle`](../../) example
for Cloudflare Workers. It reproduces the bindle's exact observable contract:

- `GET /` — the web page (served from [`worker.mjs`](./worker.mjs)).
- `GET /hello?name=<name>` — the API, returning `{ "message": "hello, <name>" }`
  with the same parse default (`"world"`), mirroring [`src/api.ts`](../../src/api.ts).

It is a single ESM module Worker with no build step and no dependencies, so it
deploys on Cloudflare's native runtime with zero configuration.

## Deploy

Any of:

- **Wrangler:** from this directory, `wrangler deploy worker.mjs --name hobo-hello-bindle`.
- **Workers Script Upload API:** `PUT` the module to
  `https://api.cloudflare.com/client/v4/accounts/<account_id>/workers/scripts/<script_name>`
  with `Authorization: Bearer <token>` and a `multipart/form-data` body carrying a
  `metadata` part (`{"main_module":"worker.mjs","compatibility_date":"<YYYY-MM-DD>"}`)
  plus the `worker.mjs` module part (`type=application/javascript+module`). This is
  exactly the request HoBo's `@hobo/hobo` Cloudflare client forms.
- **HoBo pipeline:** with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set,
  `hobo up` selects the real Cloudflare deploy provider, uploads this module, enables
  the `workers.dev` route, and returns the
  `https://<script_name>.<subdomain>.workers.dev` URL.

## Relationship to HoBo

In the full platform, `hobo up` collects this bindle into its manifest IR, the
Planner produces a `DeploymentPlan`, and a `CloudProvider.realize()` emits the
provider-specific program that a `Yard` applies. This directory is the
already-realized artifact for the Cloudflare Workers target, checked in so the
deployment is a single action.
