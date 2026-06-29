# Local Dev/Test Authoring Contract

This package is an independent HOBO-392 proof for the author-side local development and test-runtime surface.

It intentionally stays out of the runtime engine and CLI watch loop. The contract covers:

- `testRuntime()` start/resume/clock/replay helpers for deterministic workflow tests.
- Local Camp resource resolution for every `@hobo/bindles` catalog resource without provider symbols.
- Dev-only secret source classification for `.env.local`, OS keychain, and non-CI interactive prompt sources.
- Negative cases for replay divergence, skipped CI prompts, and missing local equivalents.

Run with:

```powershell
npm.cmd --prefix src\draft\local-dev-test-authoring-contract test
```
