# Cloudflare CI readiness schema ownership

`readiness.proto` owns the SDK readiness message. `buf.yaml` opts into repository
codegen; runtime code imports `src/_generated/readiness_pb.ts`. `readiness.cue`
constrains integration identity, planned status, unavailable execution, the
official SDK target, and nonempty pending gates. Scoped schema-tools generation
and drift checks exercise the valid/invalid JSON fixture instances.

`parseReadiness()` parses protobuf JSON into the generated record, applies
the same invariants, and freezes a derived `PlannedReadiness` view. The Pact
consumer test checks the normalized protobuf JSON surface.

Shared account, offer, and lease records belong to `@hobo/ci`. Future execution
commands, checkpoint/lifecycle events, and results need their own protobuf/CUE
records before use; readiness does not model that lifecycle.
