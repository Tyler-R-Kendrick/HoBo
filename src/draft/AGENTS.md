# Draft package instructions

Run package-scoped checks first. For source or contract proof edits under one draft package, prefer:

```bash
pnpm exec turbo run test --filter ./src/draft/<package>
```

Testing policy: no `test:e2e` lane and no live downstream services. Keep browser or behavior tests mocked from Pact/protobuf/CUE fixtures. Draft package `test/` files are treated as unit/contract proof tests by the root targeted checker.
