# @hobo/provider-vercel

Vercel CloudProvider for HoBo Examples OOB yards.

- Equivalence → default Resource Definitions (`EQUIVALENCE_CLASSES` / `createVercelProvider`)
- Matching `satisfies` full|partial|none + typed impedance (`vercelImpedanceFindings`)
- **Temporary / agent stations via [Vercel Drop](https://vercel.com/docs/drop)** —
  `provisionTemporaryEnvironmentStation()` creates a **new** project from uploaded
  files (Drop semantics). Injectable transport for tests; default CLI
  Drop-equivalent uses a local `vercel login` session and **strips**
  `VERCEL_TOKEN` (never permanent API tokens on this path). Browser Drop:
  https://vercel.com/drop
- **Sponsor-backed claim strategy `vercel.sponsored-project-transfer/v1`** — HoBo
  owns and pays for the project until a human accepts a project transfer request.
  See below.

```sh
pnpm --filter @hobo/provider-vercel test
```

## `vercel.sponsored-project-transfer/v1`

### This is not an anonymous deployment

The distinction is the whole point of the definition, so it is stated in data
(`SPONSORED_PROJECT_TRANSFER_BOOTSTRAP`) and asserted by test:

| Fact | Value |
| --- | --- |
| `bootstrapClass` | `sponsor` |
| `publiclyAnonymous` | `false` — there is an account and a payer before the claim |
| `initialOwner` | `hobo-sponsor` |
| `costBearerBeforeClaim` | `hobo-sponsor` (`costBearerAfterClaim`: `claiming-team`) |
| `sponsorExposureMinorUnits` | `500` — HoBo's own exposure cap, ranking input only |
| Isolation | dedicated sponsor team + project; credential scoped to `single-project-deploy-and-transfer`; never shared across tenants |

`SPONSOR_BUDGET_EXCEEDED` is a refusal, not a warning: `assertSponsorBudget`
rejects a candidate whose exposure exceeds the caller's cap before anything is
created.

Vercel **Drop** is kept separate (`VERCEL_DROP_CLASSIFICATION`,
`drop-classification.ts`). Drop is `anonymous-claimable`, but retaining a Drop
project requires an account, so it is explicitly **not** classified as a direct
anonymous deployment.

### Provider / product / capability / bootstrap / claim / binding

| Provider | Product | Capability profiles | Bootstrap | Claim | Binding |
| --- | --- | --- | --- | --- | --- |
| `vercel` | `vercel.sponsored-project-transfer/v1` (application) | `web.static/v1`, `web.hosted/v1`, `api.http/v1` | sponsor-backed; HoBo-owned project in an isolated sponsor team | project transfer request; **1** human action; code valid **24 h**; atomicity `provider-bundled` | `binding.http/v1` |
| `vercel` + `prisma` | `prisma.postgres/v1` (associated marketplace resource) | `data.postgres/v1` | created inside the sponsored project boundary | transferred in the *same* Vercel ceremony, tracked as its **own** `ClaimItem` | `binding.postgresql/v1`, rotated after claim |
| `vercel` | `vercel.drop-temporary-station/v1` | temporary Environment Station | `anonymous-claimable` | account required to retain — **not** direct anonymous deployment | n/a |
| `vercel` | `netlify`-style authenticated path | n/a | see `@hobo/provider-netlify` | n/a | n/a |

### Two ownership facts, one provider ceremony

Vercel presents claiming a project and its connected database as a single
accept. HoBo models them as **two `ClaimItem`s** (`SPONSORED_CLAIM_ITEM_IDS`:
`project`, `associated-resource`) under `claimAtomicity: "provider-bundled"`,
with a dependency edge from project to resource.

This is what makes the failure mode representable: when the project transfers
and the Prisma resource does not, the shared `@hobo/claims` reducer refuses
`CompleteClaimBundle`, the bundle lands in repair with the resource item
outstanding, and `runSponsoredProjectTransferClaim` reports
`atomicSuccess: false`. There is no code path that reports atomic success on a
partial transfer.

`RESOURCE_TRANSFER_CAPABLE_MARKETPLACE_PROVIDERS` records all three providers
the docs name (`neon`, `prisma`, `supabase`); only `prisma` is wired end to end
(`MODELLED_ASSOCIATED_RESOURCE`), because a transfer path is not real until its
verification and rotation steps exist.

### After the claim

Both ownership facts are verified **independently** — a provider "yes" is not
verification:

- **Project** — `verifyProjectOwnership` requires the `accountId` on
  `GET /v9/projects/{idOrName}` to have moved *and* the sponsoring credential to
  have lost access. `verifyTransferAcceptanceCallback` checks the HMAC-SHA256
  webhook signature when a callback is configured.
- **Associated resource** — `verifyAssociatedResourceOwnership` goes through an
  injected `AssociatedResourceOwnershipProbe`. Vercel exposes no
  claims-generator-side endpoint for this, so the port is the honest shape;
  the unverified case is `CLAIM_NOT_VERIFIED`, never an assumption.
- **Sponsor authority removed** — `revokeSponsorAuthority` deletes every token
  id known *before* the claim via `DELETE /v3/user/tokens/{tokenId}`;
  already-gone tokens are success, not error.
- **Bindings rotated** — `rotateAssociatedResourceBinding` emits a new
  `SecretRef` and refuses plaintext credential material
  (`BINDING_ROTATION_REQUIRED` when rotation has not happened).

The claim URL is a bearer token. `buildClaimAction` returns it as a
`SecretValue` and `storeClaimAction` deposits it in the `@hobo/claims` one-time
action store; callers get a redacted handle.

### Verified provider facts

All URLs below were fetched and read on the dates shown
(`VERCEL_EVIDENCE_CHECKED_AT`, `SPONSORED_PROJECT_TRANSFER_SOURCES`). These are
ranking input, never billing input, and no vendor signed anything.

| Fact | Source | Checked |
| --- | --- | --- |
| Claim URL is `https://vercel.com/claim-deployment` with the transfer code in a `code` query parameter; associated resources transfer with the project; accept is `PUT /projects/transfer-request/:code` | https://vercel.com/docs/deployments/claim-deployments | 2026-08-08 |
| `POST /projects/{idOrName}/transfer-request` returns a code **valid 24 hours**; optional `callbackUrl` + `callbackSecret` webhook signed HMAC-SHA256; `410` on an expired code | https://vercel.com/docs/rest-api/reference/endpoints/projects/create-project-transfer-request | 2026-08-08 |
| Resource transfer accept calls the integration server twice (verify, then accept); documented failure modes include invalid provider claim id, missing installation, billing plan conflict, resource ownership | https://vercel.com/docs/integrations/create-integration/marketplace-flows | 2026-08-08 |
| `GET /v9/projects/{idOrName}` returns a required `accountId` — the post-transfer ownership fact | https://vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name | 2026-08-08 |
| `DELETE /v3/user/tokens/{tokenId}` invalidates a token; `current` invalidates the authenticating token | https://vercel.com/docs/rest-api/reference/endpoints/authentication/delete-an-authentication-token | 2026-08-08 |
| Function request/response body cap 4.5 MB; Hobby max duration 300 s; streaming supported | https://vercel.com/docs/functions/limitations | 2026-08-08 |

**Unverified / deliberately absent.** Numeric capability keys appear on the
candidate only where a doc states them, so a `required` ask for an unread limit
fails closed instead of selecting on a guess. Not verified here: any per-file or
file-count deploy limit; websocket upgrade (declared unsupported); Neon and
Supabase transfer paths (recorded, not wired); whether the claims generator can
read associated-resource ownership after transfer (hence the injected probe).

### Errors, transport, idempotency

Typed `VercelProviderError` with stable codes: `PROVIDER_RATE_LIMITED`,
`PROVIDER_AUTH_FAILED`, `PROVIDER_CONTRACT_CHANGED`,
`PROVIDER_OPERATION_AMBIGUOUS`, `CLAIM_EXPIRED`, `CLAIM_NOT_VERIFIED`,
`CLAIM_PARTIALLY_COMPLETED`, `BINDING_ROTATION_REQUIRED`,
`SPONSOR_BUDGET_EXCEEDED`, `SECRET_CUSTODY_UNAVAILABLE`. `redactProviderText`
strips credential shapes from anything that reaches a log or an error detail.

`createGuardedTransport` allows HTTPS only, to `api.vercel.com` only
(`VERCEL_API_ALLOWED_HOSTS`), on allowlisted path prefixes, with no redirects
and bounded response size and timeout.

An ambiguous timeout is resolved by observation, not retry:
`observeOrAdoptProject` adopts the existing project when it is already there and
reports the already-transferred and unreachable cases distinctly, so a repeated
bootstrap cannot double-create.

Tests are offline. Fixtures under `test/fixtures/` carry obviously fake
credentials (`FAKE-…`).

## Contracts and data models

- `data-models/provider_vercel.proto` — the records this package exchanges at
  the Vercel boundary and hands to `@hobo/claims`: the bootstrap disclosure, the
  transfer-code locator, the project read, the per-item claim record, the claim
  report, sponsor-authority revocation, the rotated database binding, and the
  Drop classification that keeps Drop apart from the sponsored strategy.
- `data-models/provider_vercel.cue` — the invariants over those records: a
  sponsored offer may never declare itself anonymous or carry zero exposure, the
  transfer deadline must equal the issue instant plus the documented 24 hour
  window, a stored locator must be a `hobo-secret://` / `hobo-token://` URI with
  no query string (that is where a code would ride), only the database item may
  owe a binding rotation, and `atomicSuccess` cannot coexist with an outstanding
  item.
- `contracts/provider-vercel-project-transfer-api.pact.json` — the consumer
  contract for the documented REST calls: create the transfer request, read
  `accountId` before and after the transfer, the forbidden read that means
  *unreachable by the sponsor*, the missing-`accountId` drift that fails closed,
  and token revocation including the already-gone case.
  `test/boundary.contract.test.ts` replays it through the real functions, so an
  interaction nobody exercises is a test failure rather than documentation.

Neither the proto nor the CUE is compiled at runtime: this package declares no
`data-models/buf.yaml` and imports no generated `*_pb.ts`. Where a TypeScript
declaration shares a name with a message, the declaration carries a
`parallel-type-allowed:` note saying why.

## Architecture evidence

**Parse, don't validate.** Untrusted provider bytes cross exactly one boundary
and come out as parsed derived types, or they do not come out at all:
`createProjectTransferRequest` seals the transfer code into a `SecretValue`
behind a custody locator instead of returning a string, `getProject` refuses a
body without the documented `accountId`, `verifyTransferAcceptanceCallback`
checks the HMAC before it reads a field, `buildClaimAction` rejects a non-HTTPS
`returnUrl`, and `rotateAssociatedResourceBinding` builds its binding through
`parseCapabilityBinding` + `parseSecretRef`. Downstream functions take those
derived domain types, so there is no second place where a raw payload is
re-checked.

## Event architecture

This package owns strategy and data; it owns no lifecycle. The facts it produces
flow through the shared claim plane in `@hobo/claims`:

- **Commands.** `sponsoredProjectTransferBootstrapCommands` and
  `sponsoredProjectTransferClaimCommands` compile observations into claim
  **commands** — `ReserveGuestLease`, `RecordProvisionedSubject`,
  `BeginClaimItem`, `ObserveClaimItem`, `VerifyOwnership`,
  `RotateCapabilityBinding`, `RevokeBootstrapAuthority`, `CompleteClaimItem`,
  `CompleteClaimBundle`. Two `RecordProvisionedSubject` commands, because the
  project and the Prisma database are separate ownership facts from the moment
  they exist.
- **Actor.** `runSponsoredProjectTransferClaim` folds those commands through
  `reduce`, the pure core of the claim coordinator **actor**. The completion
  attempt is unconditional on purpose: whether a bundle may be called complete is
  the reducer's ruling, not this driver's.
- **Events.** The reducer returns the **events** the host appends —
  `GuestLeaseReserved`, `ProviderSubjectProvisioned`, `ClaimStatusObserved`,
  `OwnershipVerified`, `CapabilityBindingRotated`, `BootstrapAuthorityRevoked`,
  `ClaimItemCompleted`, `ClaimBundleCompleted`, or `ClaimRepairRequested` when
  the project moved and the database did not. `assertNoSecrets` refuses to append
  a payload carrying a claim URL or a code, which is why this package deposits
  the claim action into the one-time action store before anything is emitted.
- **Event store.** Those events land in HoBo's durable **event store** (SQLite
  behind the `@hobo/core` ports by default, ADR-0135). Provider effects — the
  transfer request, the project read, the token deletions — happen outside that
  transaction, keyed by an idempotency key and recovered by
  `observeOrAdoptProject`, so an ambiguous timeout adopts rather than
  double-creates.
- **Projection and materialized view.** Folding the claim stream produces the
  claim-bundle **projection**: the **materialized view** that answers what is
  claimed, what is outstanding, and when the 24 hour code expires.
  `SponsoredClaimReport` is this package's honest slice of that view.
- **Snapshot and read store.** Periodic **snapshots** of that fold back the
  **read store** `hobo claim` queries for current status, so an operator asking
  whether the deployment changed hands reads a projection, never a live Vercel
  call — and never the claim URL, which lives only in custody.
