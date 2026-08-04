---
name: higgsfield-auth
description: Authenticate or re-authenticate the Higgsfield MCP server, and refresh its access token when generation starts failing with 401. Use when Higgsfield tools are missing, when `claude mcp list` shows higgsfield as "Needs authentication" or "Failed to connect", when an image/video generation call returns 401 or "unauthorized", when the user says the Higgsfield token expired, or when setting Higgsfield up for the first time. Also use before a long art-generation session, since the access token lasts only one hour.
---

# Higgsfield MCP auth

Higgsfield's access token lasts **one hour**. This skill mints and rotates it.

## Commands

```sh
node .claude/skills/higgsfield-auth/scripts/hf-auth.mjs ensure    # default: refresh only if needed
node .claude/skills/higgsfield-auth/scripts/hf-auth.mjs status    # how long is left
node .claude/skills/higgsfield-auth/scripts/hf-auth.mjs refresh   # force a rotation
node .claude/skills/higgsfield-auth/scripts/hf-auth.mjs login     # device flow (needs the user)
```

**Reach for `ensure`.** It is a no-op when the token has more than five minutes
left and refreshes otherwise, so it is safe to run before any generation batch.
`status` exits `0` when healthy, `2` when a refresh is due, `1` when there is no
token at all.

## Which command to run

| Symptom | Command |
|---|---|
| First-time setup, or no token stored | `login` |
| 401 / "unauthorized" from a generation call | `refresh` |
| About to generate a batch of assets | `ensure` |
| `claude mcp list` shows *Needs authentication* | `login` |
| Refresh itself is rejected | `login` (the refresh token expired too) |

After `login` or a `refresh` that changed the header, **Claude Code must be
restarted** for the MCP tools to pick up the new credential.

## Why the normal OAuth flow does not work

Higgsfield advertises two flows in
`https://mcp.higgsfield.ai/.well-known/oauth-protected-resource`, chosen
`client_capability_based`:

- **`authorization_code_pkce`** — for clients that *can* receive a redirect.
  `claude-code` is in their `potential_clients`, so Claude Code picks it.
- **`device_code`** — for clients that *cannot*, served by
  `fnf-device-auth.higgsfield.ai`.

The PKCE path needs `http://localhost:<port>/callback` pre-registered with
Higgsfield's Clerk tenant, and it is not. Both `clerk.higgsfield.ai` and
Higgsfield's own `/oauth2/authorize` proxy therefore reject it:

> `invalid_request` — *"The 'redirect_uri' parameter does not match any of the
> OAuth 2.0 Client's pre-registered redirect urls."*

Running `/mcp` in Claude Code will reproduce that error, not fix it. This skill
uses the device flow instead and installs the result as a plain
`Authorization: Bearer` header, which bypasses the handshake entirely.

The device endpoints are **not discoverable** — `fnf-device-auth.higgsfield.ai`
serves no `.well-known/oauth-authorization-server`. They are only in its
OpenAPI document: `POST /authorize` (no body) → `{device_code,
verification_uri, expires_in, interval}`, then `POST /token {device_code}`,
and `POST /refresh {refresh_token}`.

## The rotation hazard

**Every refresh returns a new `refresh_token` and invalidates the old one.**
Lose the new one and the only recovery is a full `login` with user interaction.

The script therefore writes `~/.higgsfield/token.json` **atomically** (temp file
+ rename, mode `0600`) and persists *before* wiring the header, so a crash costs
a rerun rather than a re-login. Do not hand-edit that file, and do not call
`/refresh` with curl during a session — that silently consumes the stored token
and the next `ensure` will fail.

## Where the credential lives

| Path | Contents |
|---|---|
| `~/.higgsfield/token.json` | access + refresh token, `0600`, outside any repo |
| `~/.claude.json` | `mcpServers.higgsfield.headers.Authorization` (user scope) |

**Never in `.mcp.json`.** That file is committed; the project entry there stays
OAuth-based for teammates. A bearer token in it would be a published credential.

## Verification

Both `login` and `refresh` finish by calling `initialize` against
`https://mcp.higgsfield.ai/mcp` with the new token and printing the HTTP status.
**200 means it genuinely works** — a token that parses but does not
authenticate is caught here rather than at the first generation call. Anything
else is a real failure; report the status rather than assuming success.
