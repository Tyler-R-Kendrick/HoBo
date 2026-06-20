# Convex — CLI & Deployment Model

> Part of the [Convex reference](./README.md). The `npx convex` CLI and how code/config reach dev, prod, and preview deployments. (One of the three surfaces the user emphasized.)

## The `npx convex` CLI
Install: `npm install convex`. Key commands (with notable flags):

**Develop**
- `npx convex dev` — watch files → regenerate `convex/_generated/` ([generated-code.md](./generated-code.md)) → push code to your **dev** deployment. Creates `.env.local` with dev creds on first run. Flags: `--once` (config + codegen + one push, then exit), `--run <fn>`, `--tail-logs always|pause-on-deploy|disable`, `--until-success`.
- `npx convex codegen` — regenerate generated files without pushing (`--init`, `--typecheck`).
- `npx convex dashboard` / `npx convex docs` — open dashboard / docs.

**Deploy**
- `npx convex deploy` — typecheck, regenerate, bundle, **push to production** (or a preview). Flags: `--cmd 'npm run build'` (runs the frontend build with `CONVEX_URL` injected), `--cmd-url-env-var-name VITE_CONVEX_URL`, `--preview-create <name>`, `--preview-run <fn>`, `--message '…'`, `--dry-run`. Non-interactive in CI via `CONVEX_DEPLOY_KEY`.

**Run / data**
- `npx convex run <module:fn> '<jsonArgs>'` — execute any function (`--watch`, `--push`, `--prod`, `--component`, `--inline-query 'await ctx.db.query("messages").take(5)'`).
- `npx convex data [table]` — list tables / browse rows (`--limit`, `--order`).
- `npx convex import [--table <t>] <file|zip>` / `npx convex export --path <dir|zip> [--include-file-storage] [--prod]`.

**Env / ops**
- `npx convex env list|get|set|remove` (`--from-file`, `--prod`). Limits: name ≤256 chars, value ≤8 KiB, ≤512 vars, ≤512 KiB total.
- `npx convex logs [--prod]`, `npx convex insights [--details] [--prod]` (concurrency conflicts / limit hits over ~72h), `npx convex function-spec` (function arg/return metadata).

**Deployment / auth**
- `npx convex deployment select|create|token …` (see below).
- `npx convex login [--name] [--force]`, `npx convex login status`, `npx convex logout`.
- `npx convex update`, `npx convex mcp` (Beta, MCP server), `npx convex ai-files` (AI helper files).

## Deployment model
- Each project has **one shared production** deployment + **one dev deployment per team member**, plus **preview** deployments for feature branches. Deployments in a project usually run the same codebase.
- **Deployment URL:** `https://<adjective>-<animal>-<number>.convex.cloud` (e.g. `https://acoustic-panther-728.convex.cloud`); HTTP-actions host is `…convex.site`.
- **Key env vars:** `CONVEX_DEPLOYMENT` (selects the default deployment in local dev), `CONVEX_URL`/`VITE_CONVEX_URL` (frontend → backend; set by `deploy`), `CONVEX_DEPLOY_KEY` (non-interactive CI deploys), `CONVEX_SELF_HOSTED_URL`/`CONVEX_SELF_HOSTED_ADMIN_KEY` (self-host).

## Deploy keys (taxonomy)
| Type | Format (prefix) | Scope |
|---|---|---|
| Production deploy | `prod:<name>\|…` | deploy code to one prod deployment |
| Preview deploy | `preview:<team>:<project>\|…` | deploy to preview deployments |
| Project token | `project:<team>:<project>\|…` | whole project (create prod+dev) |
| Development deploy | `dev:<name>\|…` | one dev deployment (e.g. scoped agent work) |
| Admin key | `<name>\|…` | full deployment control (offline/self-host) |
Manage via `npx convex deployment token create <name> [--prod] [--deployment <ref>] [--save-env .env.local]` / `… token delete <nameOrToken>`.

## CI / Vercel / Netlify
Set `CONVEX_DEPLOY_KEY` in the build env, then make the build command:
```bash
npx convex deploy --cmd 'npm run build'
# custom frontend var name:
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL
```
`deploy` pushes the backend, sets `CONVEX_URL` for the build, then runs your build. Preview deployments use a **preview** deploy key + `--preview-create`/`--preview-run`; the Vercel marketplace integration syncs the deploy key automatically and supports separate Production/Preview configs.
