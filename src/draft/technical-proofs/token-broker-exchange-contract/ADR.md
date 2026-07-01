# Token Broker Exchange Contract — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs` for HOBO-629 (S3-03 token broker exchange).

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

Untrusted SVID and exchange requests cross one parser boundary (`parseSvid`,
`normalizeExchangeRequest`) into derived domain types. Downstream broker logic accepts
parsed SVID scope and principal refs — invalid or expired inputs are unrepresentable
beyond the exchange seam.

## Event Architecture

- **Command** — `ExchangeSvidForProviderToken`, `RenewBrokeredGrant`, `RevokeBrokeredGrant`.
- **Event** — `token.Granted`, `token.Used`, `token.Revoked`, `token.Denied`.
- **Actor** — Yard Identity broker service.
- **Projection** — `CredentialAudit` folds token events into the replayable credential audit.

No runtime engine or event store is implemented here; this is design-time contract evidence
for the S3-03 production broker module.

## Dependencies

Composes existing draft contracts:

- HOBO-48 / `hobo-auth-json-contract` — signed auth.json flow selection.
- HOBO-66 / `identity-event-contract` — validated audit events.
- HOBO-287 / `token-broker-ha-cache-contract` — grace-window bounds.

Promotion path: `packages/identity/src/broker/` after HOBO-628 lands SVID issuance.
