# @hobo/data-postgres

The provider-neutral PostgreSQL surface: how an app **asks** for a Postgres
database, what a Postgres product **advertises**, how that advertisement is
**proven**, and how data **leaves**.

No provider name appears anywhere in this package, and nothing in `src/` imports
a provider. That is enforced by a test, not by convention — `test/neutrality.test.ts`
scans the built API surface and the source tree for provider identifiers.

## The four things this package owns

| Concern | Entry point |
|---|---|
| Authoring an ask | `postgres.database({ version, extensions, migration })` |
| The advertised vocabulary | `POSTGRES_GUARANTEES`, `POSTGRES_FEATURES`, `postgresCapability(key)` |
| Proving the advertisement | `postgresConformanceSuite`, `planPostgresConformance`, `runPostgresConformance` |
| Getting the data out | `POSTGRES_MIGRATION_PROFILES`, `buildPgDumpArgv`, `buildPgRestoreArgv`, `buildLogicalCopyPlan` |

## Authoring

```ts
import { postgres } from "@hobo/data-postgres";

const requirement = postgres.database({
  version: ">=16",
  extensions: ["vector"],
  migration: { export: true, import: true, tools: ["prisma-migrate"] },
});
```

The result is a real `CapabilityRequirement` from `@hobo/capability-profiles`,
parsed on the way out, so an invalid ask throws at authoring time rather than at
placement time.

Three decisions in that helper are worth knowing about:

- **A version range becomes an integer gate.** `">=16"` is kept as the
  human-readable `serverVersion` ranking fact *and* lowered to a
  `serverVersionMajor >= 16` required feature, because a product advertising
  `"17"` must match `">=16"` and string comparison does not do that. The lowering
  is `parsePostgresVersionRange`, exported for anyone who needs the same mapping.
- **Guarantees are required, not preferred.** All seven
  (`POSTGRES_REQUIRED_GUARANTEE_KEYS`) are emitted as required gates. An unset
  key on a candidate fails the gate — absent beats optimistic, because a product
  that has not proven `transactionRollback` should lose a requirement that needs
  it, not win by silence.
- **Placement words are rejected.** Passing `region`, `provider`, `plan`, `tier`
  or similar throws. Those name *where* a thing runs; this helper names *what* is
  needed. Keeping the two apart is the whole reason a neutral package exists.

## The capability vocabulary

Guarantees (all boolean, all required by a `postgres.database()` ask):

`postgresWireProtocol`, `tls`, `transactions`, `transactionRollback`,
`constraints`, `connectionUriBinding`, `ddl`.

Features (ranked and gated, frequently absent):

`serverVersion`, `serverVersionMajor`, `isolationLevels`, `preparedStatements`,
`jsonDocuments`, `jsonb`, `migrationToolCompatibility`, `maxConnections`,
`pooling`, `connectivityTransports`, `extensions`, `credentialRotation`,
`logicalReplication`, `exportSupported`, `importSupported`, `maxStorageBytes`.

Eleven of these keys are already declared by `data.postgres/v1` or its parent
`data.relational/v1` in `@hobo/capability-profiles`. They are re-declared here
verbatim so there is one authoring vocabulary, and
`test/profile-matching.test.ts` asserts the two have not drifted apart.

Why some of the additions exist:

- **`migrationToolCompatibility` is not implied by the wire protocol.** An
  HTTP-only serverless endpoint speaks Postgres and still cannot run `pg_dump`.
- **`connectivityTransports` is not implied either.** A Workers or WASM caller
  has no raw TCP. Reachability is a separate, checkable fact from protocol.
- **`credentialRotation: "none"` is a legitimate value.** After a claim,
  rotation is what actually removes the creating party's authority, so a product
  that cannot rotate should say so and rank accordingly.

## Conformance

`postgresConformanceSuite` is 23 declarative cases. Each names the capability it
proves, the precondition under which it applies, a check, and its dependencies.
Cases are **pure data** — no connections, no clocks, no runtime string
assembly — so a suite can be printed, diffed, and hashed into the conformance
reference a product records (`postgresConformanceRef(productId, checkedAt)`).

```ts
const report = await runPostgresConformance({
  advertised: candidate.structuredCapabilities,
  executors: { sql: mySqlExecutor, binding: myBindingExecutor },
  nowMs: clock(),
});
```

The fold is pessimistic on purpose:

| Situation | Case status | Report outcome |
|---|---|---|
| Executor ran, check passed | `pass` | `pass` only if every applicable case passed |
| Executor ran, check failed | `fail` | `fail` |
| A dependency failed | `blocked` | `fail` |
| No executor for that kind | `not-run` | `unknown` |
| A dependency was not run | `not-run` | `unknown` |
| The product never advertised it | skipped | does not affect the outcome |

`unknown` and `fail` are both non-selectable, so the only way to be picked is to
have actually run the checks. Note the distinction between `blocked` and
`not-run`: collapsing them would let a missing executor masquerade as a product
defect, and a CI lane without a live database would start reporting failures
that are really absences.

Skipping is not forgiveness. A product that never claims `extensions` is not
asked about pgvector; its `extensions` gate then fails on absence at selection,
which is the right place for that decision.

## Migration profiles

Two profiles, both exported as constants and both usable as
`ProfileImplementation.migrationProfiles` entries:

- `migration.postgres.pg-dump/v1` — logical export/restore.
- `migration.postgres.logical-copy/v1` — publication/subscription copy, for
  moves that cannot take downtime.

### Commands are argv arrays, and credentials are not in them

`buildPgDumpArgv`, `buildPgRestoreArgv`, and `buildPsqlArgv` return
`readonly string[]`. There is no code path in this package that produces a shell
string, because there is no code path that could then be handed to `sh -c`.

```ts
const argv = buildPgDumpArgv({
  target: { host: "db.example.test", port: 5432, database: "postgres", username: "app_role", sslMode: "require" },
  filePath: "/var/hobo/exports/db.pgc",
  format: "custom",
});
// ["pg_dump", "--host=db.example.test", …, "--no-password", "--file=/var/hobo/exports/db.pgc"]

const env = buildLibpqEnvironment({ target, credential: { channel: "environment" } });
```

`--no-password` is always present, so libpq fails fast instead of blocking on a
terminal prompt inside a non-interactive runner. The password travels in
`PGPASSWORD` (or `PGPASSFILE`, via `credential.channel`), never as an argv
element and never inside a DSN on the command line — argv is world-readable in
`/proc` on Linux, which is the entire reason for the split.

Every interpolated field goes through a parser first (`parsePostgresHost`,
`parsePostgresIdentifier`, `parsePostgresPort`, `parseArtifactPath`,
`parsePostgresTarget`). They reject `;`, backticks, `$(`, `|`, `&`, newlines,
NUL, leading `-`, and `..` traversal. `assertArgvSafe` re-scans the finished
array as a backstop, so a future edit that forgets a parser still cannot ship an
injectable command.

Rejection is deliberate rather than escaping. A database genuinely named
`weird"; DROP` would be quoted correctly by a careful escaper and still be a
value nobody should be able to introduce through a config file — refusing is the
smaller blast radius.

`buildLogicalCopyPlan` returns the publication and subscription **steps** with
the subscription's DSN deliberately left unassembled: the caller composes it
inside a resolved-secret scope so the connection string never becomes a value
this package could accidentally log.

## Error codes

`PostgresDataError.code` is one of `INVALID_POSTGRES_REQUIREMENT`,
`UNSAFE_COMMAND_ARGUMENT`, `MIGRATION_FAILED`, `CONFORMANCE_SUITE_INVALID`,
`CONFORMANCE_EXECUTOR_MISSING`. Each carries a structured `detail` naming the
offending field.

## Parse, don't validate

Untrusted input crosses one parse boundary and becomes a derived domain type
that the rest of the package accepts as-is:

| Raw input | Parser | Derived type | Impossible afterwards |
|---|---|---|---|
| authoring options | `postgres.database` | a parsed `CapabilityRequirement` | a placement word (`region`, `provider`, `plan`) in a capability ask |
| version range string | `parsePostgresVersionRange` | `serverVersionMajor` gate | `">=16"` losing to `"17"` under string comparison |
| host / port / db / user | `parsePostgresTarget` | `PostgresTarget` | a shell metacharacter, a leading dash, or `..` reaching an argv element |
| artifact path | `parseArtifactPath` | a checked absolute path | traversal out of the export directory |
| a suite | `assertConformanceSuiteWellFormed` | a well-formed `PostgresConformanceSuite` | an unknown capability key or a dependency cycle |

`buildPgDumpArgv` and its siblings take the parsed target, never the raw fields,
so there is no code path that re-checks an identifier and no code path that
forgets to. `assertArgvSafe` re-scans the finished array only as a backstop for
a future edit that adds a field without a parser.

The protobuf records in `data-models/postgres_capability.proto` are the wire
projection of these parsed types, and `postgres_capability.cue` carries the
invariants that make an advertisement honest — `jsonb` implies `jsonDocuments`,
rollback implies transactions, and a product that cannot export cannot also
claim `pg-dump` compatibility.

## Event architecture

This package is a pure core: it holds no state, opens no connection, reads no
clock, and appends nothing. Its outputs are what the durable control plane
carries.

- **Commands** — a conformance report is what lets a selection **command** name
  this product at all; a migration plan is the payload of the `@hobo/claims`
  coordinator's `BeginResourceMigration`, `RecordMigrationCheckpoint`,
  `CommitConnectorCutover`, and `RotateCapabilityBinding` commands. Each carries
  the parsed target and the argv array built here, so a command replays against
  one concrete endpoint rather than against a re-interpolated string.
- **Events** — the claim coordinator **actor** (`reduce` in `@hobo/claims`)
  turns those commands into `ResourceMigrationStarted`,
  `ResourceMigrationCheckpointRecorded`, `ResourceMigrationVerified`,
  `LogicalConnectorCutoverCommitted`, and `CapabilityBindingRotated`. The
  `PostgresConformanceReport` record is what a `pass`/`fail`/`unknown` outcome in
  those event bodies means. No credential enters a body: the password is a
  channel (`PGPASSWORD`, `PGPASSFILE`), never a record field.
- **Event store** — the host appends those events to the durable SQLite-backed
  **event store** under per-stream OCC and a fencing token. `pg_dump` and
  `pg_restore` run outside that transaction, keyed by idempotency, so a retried
  migration does not produce a second archive.
- **Projections / materialized views** — the stream folds into the
  **materialized views** selection and the CLI read: current conformance outcome
  per product, the migration profiles a product supports, and the last verified
  export. Because `unknown` and `fail` are both non-selectable, a product only
  becomes selectable by appearing in that view with evidence.
- **Snapshots / read store** — periodic **snapshots** of the resource aggregate
  back the **read store** behind `hobo status`; historical snapshots keep the
  conformance reference a product was chosen under auditable after it is
  re-checked, which is why `postgresConformanceRef` pins the suite, the product,
  and the date a human looked.

## Tests

```bash
pnpm --filter @hobo/data-postgres run build
pnpm --filter @hobo/data-postgres run test
```

Offline and deterministic; no database is started and no clock is read. The
lanes pin, among other things: a SQLite/D1-shaped candidate never satisfies
`data.postgres/v1` while Neon-shaped and Prisma-shaped candidates do; every
argv builder rejects each injection class in every interpolated field; and the
conformance fold returns `unknown` rather than `pass` when an executor is
missing.

Gates protecting this package: TypeScript (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), the protobuf records
in `data-models/postgres_capability.proto`, the CUE invariants in
`data-models/postgres_capability.cue`, and the Pact-shaped boundary contract in
`contracts/pacts/postgres-conformance.pact.json`.
