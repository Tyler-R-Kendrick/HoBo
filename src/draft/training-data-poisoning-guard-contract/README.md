# Training Data Poisoning Guard Contract

Independent HOBO-358 POC for the training/data flywheel poisoning boundary.

The contract models the guard that runs before an optimizer-produced candidate
can be promoted from trajectory and label evidence:

- poisoned trajectory labels are quarantined before scoring;
- label-flip, reward-inflation, gradual-drift, and Sybil-burst fixtures are
  executable adversarial vectors;
- promotion requires a passing contract backstop, enough independent trusted
  sources, enough shadow evidence, and trusted reward above the floor;
- candidate influence replay reconstructs trusted trajectory ids, quarantined
  trajectory ids, and trusted hashes from append-only events.

Scope kept out: optimizer implementation, model training, live traffic routing,
provider calls, and champion swap application.

Run:

```powershell
npm.cmd --prefix src\draft\training-data-poisoning-guard-contract test
```

Design proof: [HOBO-358 training data poisoning guard](../../../docs/design/proofs/hobo-358-training-data-poisoning/README.md).
