# OTEL Traces Pipeline Contract

Independent POC for HOBO-253. It pins the M2 OTLP traces pipeline without adding
metrics, logs, OpenInference payloads, Run Inspector projection, dashboard UI, or
provider-specific SDK adapters.

The contract proves:

- A deploy exports one OTLP-shaped trace with nested deploy, step, actor, and provider spans.
- Provider-call spans carry provider, region, and operation attributes.
- Collector failures use retry backoff and do not throw into run progress.
- Trace-level sampling drops spans while preserving child trace linkage.
- A bounded buffer drops span floods instead of blocking producer operations.
- Provider SDK calls that swallow trace context are marked on the provider span.
- Deep span nesting is capped with an explicit trace attribute instead of overflowing.
- PII and secret span attributes are redacted before buffering and OTLP export.

Run:

```powershell
npm.cmd --prefix src\draft\otel-traces-pipeline-contract test
```
