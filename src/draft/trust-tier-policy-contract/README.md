# HOBO-385 Trust Tier Policy Contract

This proof package implements the HOBO-385 trust-tier composite and can-deploy
minimum-tier policy contract.

The contract keeps trust advisory by default. Policy enforcement only happens
when a policy pack supplies `require.minTier`; the hardened production profile
adds that policy by default as `deny-ceiling:prod-min-provenance-tier`.

## Contract Surface

- `trustTier(listing)` derives a deterministic tier from listing facts only:
  provenance tier, publisher identity, and ratings tier.
- `evaluateTrustTierPolicy({ listing, policy })` denies selection below
  `policy.require.minTier` at `can-deploy`, with remediation evidence.
- `createTrustPolicyProfile({ profile: "prod" })` emits the default production
  minimum-provenance policy.
- Explicitly disabling the production deny ceiling requires an actor and reason,
  then emits a `trust.MinProvenanceTierDisabled` audit fact.

The composite intentionally carries no price, commercial, or monetization field.
Ratings can improve a listing only after provenance and publisher identity have
already cleared their caps.

## Verification

```powershell
npm.cmd --prefix src\draft\trust-tier-policy-contract test
```
