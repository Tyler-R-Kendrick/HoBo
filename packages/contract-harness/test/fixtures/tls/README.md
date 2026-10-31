# Test-only TLS fixtures

**Test-only.** These certificates and keys exist so `test/http-provider.test.ts`
can pin which name `exchangeHttp` verifies a TLS answer against, with no network
and no clock. They protect nothing: the private keys are committed on purpose,
were made for this test alone, and are allowlisted for gitleaks by path in
`.gitleaks.toml`. Never trust `ca.pem` anywhere else.

| File | What it is |
|---|---|
| `ca.pem` | A throwaway CA, `CN=HoBo contract-harness test-only CA`. Its key was not kept. |
| `loopback.pem`, `loopback.key` | A server certificate for `IP:127.0.0.1` and `DNS:api.vercel.com`, the names mirror.cloud's own throwaway certificate carries. |
| `hostname.pem`, `hostname.key` | A server certificate for `DNS:s3.us-east-1.amazonaws.com` only: the `Host` header name a rewritten AWS request carries, never the address dialled. |

Every certificate is valid from 2000-01-01 to 2125-12-31, so the test does not
depend on the date it runs. The keys are P-256. Made with OpenSSL 3.0
(`openssl ca -startdate 20000101000000Z -enddate 21251231235959Z`), each leaf
signed by the CA with `serverAuth` and the subject alternative names above.
