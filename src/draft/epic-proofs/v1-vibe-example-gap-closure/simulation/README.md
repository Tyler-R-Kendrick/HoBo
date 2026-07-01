# Simulation

Run:

```powershell
npm.cmd --prefix src\draft\epic-proofs\v1-vibe-example-gap-closure run simulate
```

The simulation evaluates the deterministic HOBO-539 child backlog fixture and emits:

- total child issue count;
- phase and project distribution;
- mocked Pact-style boundaries covered by tests;
- the downstream unblock condition; and
- scope-creep denials for production UI, live customer data, and unsupported launch claims.
