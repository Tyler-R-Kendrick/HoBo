# V1 Supported Platform Matrix Contract

HOBO-511 defines the v1 browser, device, and platform support contract.

## What This Proves

- Desktop browser support names Chrome, Edge, Firefox, and Safari with beta and GA support levels.
- Mobile/responsive support has a limited v1 posture, a 390px viewport floor, and explicit unsupported authoring uses.
- CLI and local bootstrap support names macOS, Linux, and Windows platform assumptions.
- Every support claim maps to evidence: e2e tests, accessibility checks, bootstrap smoke, docs, support guidance, or known limitations.
- Unsupported browser/device/platform reports route to support debug, release notes, or the known limitations register.

## Boundary

This package defines the support matrix contract. It does not build a device lab, native mobile app,
automated browser grid, live e2e suite, or package/runtime compatibility engine.

## Verification

```powershell
npm.cmd --prefix src\draft\v1-supported-platform-matrix-contract test
```
