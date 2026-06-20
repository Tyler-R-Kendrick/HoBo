# Convex — Management, Platform & HTTP APIs

> Part of the [Convex reference](./README.md). The programmatic surfaces for provisioning + operating Convex (one of the three the user emphasized). **The Management/Platform API is Beta** — the authoritative shape is the published OpenAPI spec; some endpoints are documented only there. Contact `platforms@convex.dev` for capabilities beyond the beta.

## 1) Management API — provision teams/projects/deployments
- **Base:** `https://api.convex.dev/v1`
- **Auth:** `Authorization: Bearer <token>`, where the token is either a **Team Access Token** (manage your own team) or an **OAuth Application Token** (act on behalf of a user's team — how a third-party integration provisions Convex for users).
- **Spec / client:** OpenAPI at `https://api.convex.dev/v1/openapi.json`; official client `@convex-dev/platform` (npm).
- **Representative endpoints** (full list in the spec):
  - `GET  /projects/:project_id/list_deployments`
  - `POST /projects/:project_id/create_deployment`
  - `GET  /deployments/:deployment_name/list_deploy_keys`
  - `POST /deployments/:deployment_name/create_deploy_key`
  - project creation/management, deploy-key management, team-level ops.
- **Capabilities:** create/configure projects + deployments, mint/revoke deploy keys, manage env vars, programmatic provisioning of Convex infra.

## 2) Deployment Platform API — configure a single deployment
- **Auth:** an admin-scoped key with the **`Convex ` prefix**: `Authorization: Convex <access_key>` (accepts deploy keys, team-access tokens, or OAuth app tokens).
- **Purpose:** modify a deployment's configuration (e.g. environment variables — `list_environment_variables`, etc.).
- **Status:** openly available in **Beta**; not all endpoints are publicly documented.

## 3) Client HTTP API — call functions over HTTP
- **Base:** `<CONVEX_URL>/api/...`
- **Endpoints:** `POST /api/query`, `POST /api/mutation`, `POST /api/action`, and `POST /api/run/{functionIdentifier}`.
- **Request:** `{ "path": "module:function", "args": { … }, "format": "json" }` (the `/api/run/...` form omits `path`).
- **Response:** success `{ "status": "success", "value": …, "logLines": [...] }`; error `{ "status": "error", "errorMessage": …, "errorData": …, "logLines": [...] }`.
- **Auth:** end-user calls use `Authorization: Bearer <id_token>` (from your auth provider); admin/streaming use `Authorization: Convex <access_key>`. Only `json` format today; real-time subscriptions use the WebSocket client, not this HTTP API.

## 4) OAuth applications (third-party integrations)
Register in Dashboard → Team Settings → Applications → OAuth Apps (up to 20 redirect URIs incl. localhost; apps start "Unverified" — token issuance limited to your own team until verified). Standard **OAuth 2.0 Authorization Code flow (+ PKCE, S256)**:
1. **Authorize:** redirect to `https://dashboard.convex.dev/oauth/authorize/team` (or `/project`) with `client_id`, `redirect_uri`, `state`, `response_type=code`.
2. **Callback:** `<redirect_uri>?code=…&state=…`.
3. **Token:** `POST https://api.convex.dev/oauth/token` with `{ client_id, client_secret, code, grant_type: "authorization_code" }` (+ PKCE `code_verifier`) → `{ "access_token": "…", "token_type": "Bearer" }`.

**Token scopes:** *team-scoped* (create projects/deployments, access/modify data across the team's projects) or *project-scoped* (create deployments + manage data within one project). All tokens inherit the authorizing member's permissions.

## Notes / undocumented
- No `deployment token list` CLI command — track issued keys yourself.
- Streaming-import/export connector details (Airbyte/Fivetran) are referenced but lightly documented ([integrations-ops.md](./integrations-ops.md)).
- Treat the Management/Platform API as **moving** (Beta) — generate clients from the OpenAPI spec rather than hard-coding.
