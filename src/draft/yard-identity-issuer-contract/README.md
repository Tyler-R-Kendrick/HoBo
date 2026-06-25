# Yard Identity Issuer Contract POC

HOBO-71 proof for the Yard Identity OIDC issuer + JWKS endpoint skeleton.

## What This Proves

- The issuer serves an OIDC discovery document and JWKS for the stable Yard issuer URL.
- JWT-SVIDs signed by the genesis key verify against the published JWKS.
- Seed to self-deploy handoff preserves the issuer URL and genesis key id.
- Signing-key rollover publishes old and new kids during the overlap window.
- Air-gapped mode serves discovery/JWKS locally without phone-home.
- Durable signing keys stay behind the KMS seam and are non-exportable.

## Boundary

This is a local contract skeleton, not a production IdP. It does not implement real KMS/HSM
providers, HTTP serving, SVID issuance policy, workload attestation, provider STS exchange,
HA broker cache, or certificate issuance. Those remain owned by their dedicated identity,
networking, and broker slices.

## Verification

```powershell
npm.cmd --prefix src\draft\yard-identity-issuer-contract test
```
