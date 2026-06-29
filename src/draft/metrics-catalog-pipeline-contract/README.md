# Metrics Catalog Pipeline Contract

Independent POC for HOBO-257.

This package proves the metrics side of the HoBo observability substrate:

- A typed metric catalog declares metric name, type, unit, and bounded labels.
- Control-plane deploy and provider metrics emit through one pipeline.
- Data-plane RED metrics are emitted for `service`/`web` requests.
- Wasm runtime metrics cover cold starts, instance density, and link-call latency/errors.
- A mock OTLP collector receives OTLP-shaped cumulative series from the same public interface.

Run:

```powershell
npm.cmd --prefix src\draft\metrics-catalog-pipeline-contract test
```

Scope kept out:

- SLO/burn-rate computation and alert routing.
- Real OTLP network transport or provider-specific collector adapters.
- AI-method/OpenInference metrics beyond the catalog family.
- Cardinality-explosion guard implementation beyond this contract's fail-closed label schema.
