# @hobo/auth-md

The **auth.md agent-principal / delegated-authorization plane**: discovery of a
protected resource's agent policy, anonymous agent registration, identity
assertion verification, human claim, and the rotation/revocation that follows.

> **auth.md is agent identity, not infrastructure ownership.** Everything in
> this package exists to keep those two apart.

## Three independent state machines

HoBo tracks three things that are easy — and dangerous — to conflate. This
package models them as three separate machines in
[`src/state-machines.ts`](src/state-machines.ts), advanced by separate commands
and composed only in a read-only `PlaneSnapshot`. **Success in one never
implies another.**

| Machine | States | Advanced by |
|---|---|---|
| Human HoBo session | `anonymous` → `authenticated` | the human signing in |
| Agent principal | `unregistered` → `pre-claim` → `human-bound` \| `revoked` | registration, human claim, revocation |
| Infrastructure | `temporary` → `owner-controlled` \| `expired` | the owner claiming (or abandoning) the resources |

What that rules out, concretely:

- An authenticated human does **not** make a pre-claim agent human-bound.
- A human-bound agent does **not** make infrastructure owner-controlled.
- Owner-controlled infrastructure does **not** re-grant a revoked agent
  anything — it is precisely what makes rotation mandatory
  (`rotateAfterInfrastructureClaim`, enforced by `assertManagementAccess`).
- The safe outcome **"the work is claimed by the human, and the pre-claim agent
  is revoked"** is a first-class, representable, tested state
  (`isWorkClaimedByHumanWithRevokedAgent`).

## Metadata beats prose

Discovery reads two documents:

1. `/.well-known/oauth-protected-resource` — OAuth Protected Resource Metadata.
   **Machine-authoritative.**
2. `/auth.md` — the agent-readable companion document. **Advisory.**

When they disagree, the structured metadata wins. That is enforced structurally,
not by convention: every effective field on `AuthMdDiscovery`
(`effectiveScopes`, `anonymousRegistrationSupported`) is computed from the
metadata record, and prose disagreements surface as `conflicts` entries tagged
`authority: "metadata"`. A `/auth.md` file promising `admin:all` or promising
anonymous registration changes nothing about what this package will do.

## Security properties (all covered by tests)

- **No material in returned values, errors, or fixtures.** Assertions, claim
  tokens, private keys, and access tokens live in a `SensitiveRef` whose
  material is held in a module-private `WeakMap` — never an own-property — so
  `JSON.stringify` yields `"[redacted]"`. `formatRedacted` is the defence-in-depth
  formatter for everything else; `AuthMdError` scrubs its own message and details.
- **Pre-claim authorization is bound to four things at once**: session, tenant/project,
  audience, and the exact service (`SessionBinding`, `assertBindingMatches`).
- **Post-claim scopes never silently widen.** Anything above the pre-claim set
  requires an explicit `HumanAuthorization` naming those scopes; otherwise
  `AUTHMD_SCOPE_WIDENING_DENIED`.
- **Rotation is forced after an infrastructure claim.** Management access fails
  closed with `AUTHMD_ROTATION_REQUIRED` until `rotateAgentCredentials` runs.
- **Transport is fenced**: injected `fetchImpl` only (never global fetch in
  production paths), HTTPS-only, byte-bounded, deadline-bounded, and
  cross-host redirects are refused.

## Error codes

`AUTHMD_DISCOVERY_FAILED`, `AUTHMD_METADATA_INVALID`,
`AUTHMD_REGISTRATION_UNSUPPORTED`, `AUTHMD_ASSERTION_INVALID`,
`AUTHMD_CLAIM_EXPIRED`, `AUTHMD_SCOPE_WIDENING_DENIED`,
`AUTHMD_ROTATION_REQUIRED`, `AUTHMD_REVOKED`.

## Architecture

Parse, don't validate: untrusted provider JSON and prose cross exactly one
parser boundary in [`src/types.ts`](src/types.ts) and
[`src/discovery.ts`](src/discovery.ts) and become branded parsed domain types
(`HttpsUrl`, `Scope`, `Instant`, `RegistrationRef`, `SessionBinding`). Nothing
downstream re-checks a string.

Flows are event-driven. Each command (register, initiate claim, poll claim,
rotate, revoke) is handled by the agent-principal actor — one actor instance per
`registrationRef`, which is also the stream key — and the actor appends
`authmd.*` events to the event store rather than mutating a read model.
`foldAgentPrincipalEvents` is the materialized view / projection over that
stream, and `AgentPrincipalView` doubles as the snapshot persisted in the read
store for current-state reads. Every event is refs-only, so replay can never
resurrect key material.

Wire forms and their constraints live in
[`data-models/auth_md.proto`](data-models/auth_md.proto) and
[`data-models/auth_md.cue`](data-models/auth_md.cue); the boundary is pinned by
[`contracts/pacts/auth-md-protected-resource.pact.json`](contracts/pacts/auth-md-protected-resource.pact.json).

## Ports you must inject

| Port | Why it is injected |
|---|---|
| `HttpPort.fetchImpl` | production paths never close over global fetch; tests run fully offline |
| `AssertionVerifier` | this package invents no cryptography and ships no JWT/JWKS dependency (the repo has none). Bind a real verifier in deployment; `createFixtureAssertionVerifier` is the offline HMAC stand-in for tests |
| `RotationPort` | credential lifecycle belongs to the identity plane, not here |

## Usage

```ts
import {
  discoverAuthMd,
  registerAnonymousAgent,
  initiateHumanClaim,
  pollHumanClaim,
  toAgentPrincipalClaimRef,
  parseScopes,
  parseSessionBinding,
} from "@hobo/auth-md";

const port = { fetchImpl: fetch };
const discovery = await discoverAuthMd({ port, resource: "https://api.example.com" });

const registration = await registerAnonymousAgent({
  port,
  discovery,
  binding: parseSessionBinding({
    sessionId,
    tenantId,
    projectId,
    audience: "https://api.example.com/",
    service: "https://api.example.com/",
  }),
  requestedScopes: parseScopes(["repo:read"]),
});

const initiation = await initiateHumanClaim({
  port,
  registration,
  requestedPostClaimScopes: parseScopes(["repo:read"]),
});
// show initiation.claimUrl to the human, then poll
const result = await pollHumanClaim({ port, initiation, registration });
if (result.status === "claimed") {
  const claimRef = toAgentPrincipalClaimRef(result.principal);
}
```

## Testing

```bash
pnpm --filter @hobo/auth-md run build
pnpm --filter @hobo/auth-md run test
```

Every test is offline and injects a fetch fixture; there is no live-service lane.

## Sources

The protocol semantics above were taken from the official auth.md material,
**checked 2026-08-08**:

- <https://workos.com/auth-md/docs/flows/claimed> — claimed (human-bound) flow
- <https://workos.com/auth-md/docs/flows/anonymous> — anonymous agent flow
- <https://github.com/workos/auth.md> — the specification repository

HoBo is not affiliated with, endorsed by, or sponsored by WorkOS.
