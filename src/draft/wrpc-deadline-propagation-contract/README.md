# HOBO-24 wRPC Deadline Propagation Contract

Independent POC for deadline propagation across in-process wRPC links.

It proves:

- caller deadlines are carried on `link.Called`;
- exceeded deadlines return typed `deadline-exceeded` errors with the Plan-5 transient timeout classification;
- cancellable provider operations receive an `AbortSignal`;
- nested in-process calls inherit the parent deadline and shrink remaining time;
- hung in-process providers cannot hold the caller past the deadline.

Out of scope: NATS/JetStream lattice transport, cross-host hung-call timing divergence, backpressure, retry/provider-idempotency reconciliation, full classifier implementation, and wire-version negotiation.

```powershell
npm.cmd --prefix src\draft\wrpc-deadline-propagation-contract test
```
