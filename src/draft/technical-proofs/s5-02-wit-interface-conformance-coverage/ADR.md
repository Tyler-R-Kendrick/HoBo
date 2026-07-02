# S5-02 WIT Interface Conformance Coverage — Architecture Evidence

Parse-don't-validate at catalog, registry, coverage-report, and publish-gate
boundaries. Untrusted catalog JSON and provider claims cross one parser each;
downstream code receives derived types.

Event vocabulary (design-time): `conformance.CoverageReportGenerated`,
`conformance.ProviderRecertified`, `registry.PublishGateEvaluated` — append-only
projections; no runtime engine here.

See `architecture/` protobuf + CUE + PACT for guard evidence.
