# GitHub Actions bootstrap boundary

`jit_bootstrap_response.proto` owns the single-use confidential JIT response;
its CUE constraints and valid/invalid fixtures run through schema-tools. Never
persist the generated response or its credential field in events, logs or caches.

Shared durable configuration, job, lease and event records are imported from
`@hobo/ci` and owned by `../ci/data-models/ci.proto` relative to sibling packages.
GitHub's native REST, webhook and OIDC JSON is parsed at the external boundary.
