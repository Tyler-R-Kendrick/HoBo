# HoBo JWT-SVID Contract POC

This draft pins the HOBO-44 contract as a small executable surface:

- `schema/jwt-svid.v1.schema.json` publishes the required JWT-SVID claim set.
- `src/jwt-svid.mjs` parses Yard SPIFFE identities and validates compact JWT-SVIDs.
- `test/jwt-svid-contract.test.mjs` covers the acceptance and adversarial cases from HOBO-44.

The compact JWT parser rejects unsigned tokens and `alg: none`, but it does not perform JWKS
signature verification. That belongs to the Identity issuer/JWKS runtime slice; this POC defines
the structural contract that runtime must verify against.
