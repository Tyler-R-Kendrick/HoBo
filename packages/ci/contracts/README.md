# HoBo.CI shared boundary

The generated protobuf JSON configuration is parsed by `parseConfiguration`; the
executable consumer tests are `../test/routing.test.ts`. Schema drift is checked
by schema-tools with the adjacent CUE valid/invalid fixture corpus.

Routing has no external service boundary. GitHub App, webhook, OIDC, dispatch and
JIT boundaries are inventoried in `../../ci-gh-actions/contracts`.
