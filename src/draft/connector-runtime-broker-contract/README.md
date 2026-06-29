# Connector Runtime Broker Contract

HOBO-235 proof package for the runtime side of `connector(...).connection().token()`.

The package consumes the completed authoring and inference contracts:

- `src/draft/connector-authoring-contract`
- `src/draft/xaa-scope-inference-contract`
- `src/draft/outbound-xaa-token-exchange-contract`

It proves the runtime bridge that:

- maps `manifest.connectors.<target>.allow` to the outbound XAA broker request;
- defaults raw `.token()` to the usage-inferred manifest scope set;
- allows explicit token requests only when they narrow that manifest set;
- binds broker subjects to the current `ctx.user` delegation principal; and
- rejects manifest/runtime mismatches before the outbound broker can mint an ID-JAG.

It deliberately does not implement typed-client authoring/codegen, static scope inference, ID-JAG
minting, or policy deny-ceiling evaluation. Those remain with the referenced packages and follow-on
slices.

## Verification

Run the focused contract suite:

```powershell
npm.cmd --prefix src\draft\connector-runtime-broker-contract test
```

The root `npm.cmd test` also discovers this package's Node test suite.
