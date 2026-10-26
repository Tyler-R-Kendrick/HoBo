# Shared CI contracts

`ci.proto` owns configuration, account offers, repository connections, jobs, leases,
events and snapshots. `ci.cue` constrains every message; valid/invalid fixtures are
executed by schema-tools. Generated records live under `src/_generated`.

Lease prices and free-allocation validity are pinned when capacity is reserved.
Settled free consumption is recorded separately from reserved free minutes so a
host finishing beyond the evidence window cannot be accounted as free.
