# Trace Context Propagation Contract

Independent POC for HOBO-241. It pins the M1 trace-context skeleton without adding OTLP export,
metrics, logs, or provider instrumentation.

The contract proves:

- `meta.traceparent` is present and W3C-shaped at ingress.
- Commands, events, child commands, and queue hops preserve one trace.
- `withSpan()` records step/actor span metadata with causation and correlation links.
- Malformed or missing traceparents fail closed by regeneration with an explicit repair marker.
- Fan-out sibling spans keep the same parent, and clock skew cannot create negative spans.

Run:

```sh
npm.cmd --prefix src/draft/trace-context-propagation-contract test
```
