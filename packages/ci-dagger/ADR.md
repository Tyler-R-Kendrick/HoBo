# Dagger integration readiness

Status: planned. HoBo CI GitHub Actions remains the first delivery target.

This package implements a readiness query and parser, with execution explicitly
unavailable. Local protobuf defines `Readiness`, and schema-tools generates its
runtime record. The derived domain type `PlannedReadiness` refines that generated type. Its
parser applies the CUE-mirrored invariants once and returns a frozen view:
parse, don't validate, rather than a raw DTO with a separate validity boolean.

A synchronous-message Pact pins the in-process SDK boundary, with valid/invalid
CUE fixtures, TypeScript, and scoped codegen checks protecting the schema.
The Pact is hand-authored consumer evidence; it asserts neither an HTTP service
nor Dagger provider verification.

There is no execution command or lifecycle event yet. No actor, event store,
projection, snapshot, or read store is implemented by the readiness-only API.
Before execution, define commands/events, checkpoint and outbox replay behavior,
usage projections, and snapshot/read store persistence alongside cancellation.
These requirements remain deferred work, not implied behavior of a getter.

Future execution will reuse HoBo account/budget authorization and customer-owned
provider credentials. Pin SDK/runtime bindings and verify external boundaries
with PACT fixtures before deployment. No provider price, free allocation, or
live execution evidence is asserted by this readiness contract.
