# X.509-SVID mTLS Contract POC

HOBO-242 proof for issuing tenant-scoped X.509-SVID certificates and using them for
service-to-service mTLS authentication.

## What This Proves

- Fixture services establish an mTLS session only when both peers present SVID-CA-signed
  X.509-SVID certificates.
- The certificate SAN carries the workload SPIFFE ID:
  `spiffe://yard/<tenant>/<bindle>/<resource>`.
- Rotation starts before TTL expiry, emits `identity.Rotated`, and keeps an overlap window so an
  established connection is not dropped.
- Tenant trust bundles are scoped: a service from another tenant trust domain is rejected.
- Air-gapped Yards use the internal CA/private ACME profile without phone-home.
- Spoofed SANs, expired certificates, and caller-requested cross-tenant SPIFFE IDs fail closed.

## Boundary

This package is an in-memory contract POC. It signs certificate-shaped X.509-SVID records with a
tenant-scoped SVID CA and verifies them at a simulated mTLS boundary. It does not implement JWT-SVID
issuance, connectivity-tier selection, relay reverse tunnels, public endpoint gateway mTLS, ACME
wire protocol, or a production TLS stack.

## Verification

```powershell
npm.cmd --prefix src\draft\x509-svid-mtls-contract test
```
