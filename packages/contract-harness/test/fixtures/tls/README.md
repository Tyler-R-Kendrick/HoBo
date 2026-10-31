# Test-only TLS fixtures

**Test-only.** These certificates and keys exist so `test/http-provider.test.ts`
can pin which name `exchangeHttp` verifies a TLS answer against, with no network
and no clock, and so that the stand-in mirror in `scripts/test/mirror-lane.test.ts`
can serve `--tls-self-signed` the way mirror does. They protect nothing: the
private keys are committed on purpose, were made for these tests alone, and
`.gitleaks.toml` exempts exactly the two key files (SECURITY.md says so).

They can only ever vouch for names nobody can own. The CA's critical
`nameConstraints` extension permits `DNS:test` (the `.test` top-level domain
RFC 2606 reserves) and `IP:127.0.0.0/255.0.0.0` and nothing else, so a TLS
client rejects anything it signs for a real host, and the leaves name only such
names. `test/tls-fixtures.test.ts` checks all of this.

| File | What it is |
|---|---|
| `ca.pem` | A throwaway CA, `CN=contract-harness test-only CA`, constrained as above. Its key was not kept. |
| `loopback.pem`, `loopback.key` | A server certificate for `IP:127.0.0.1` only (`CN=loopback.mirror-lane.test`): the address a client dials. |
| `hostname.pem`, `hostname.key` | A server certificate for `DNS:s3.mirror-lane.test` only: the name a rewritten request carries in `Host`, never the address dialled. |

Every certificate is valid from 2000-01-01 to 2125-12-31, so no test depends on
the date it runs. The keys are P-256. Made with OpenSSL 3.0
(`openssl ca -startdate 20000101000000Z -enddate 21251231235959Z`), each leaf
signed by the CA with `serverAuth` and the subject alternative name above.
