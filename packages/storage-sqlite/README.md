# `@hobo/storage-sqlite`

Driver-neutral SQLite schema, migrations, codecs, and commit semantics for HoBo’s
default durable EventStore / runtime journal.

SQLite is the **default engine**, not the public architecture boundary. Callers
depend on `@hobo/core` ports; native (`node:sqlite`) and browser (SQLite WASM +
OPFS) adapters implement a thin `SqliteDriver` and share this package’s SQL +
migration logic.

## Ownership model

One SQLite database file (partition) is owned by one active storage owner at a
time. Scale by partitions, not multi-writer WAL over shared network filesystems.

## Schema version

`PRAGMA user_version` tracks schema revisions. Current: **2**.

## Engine profiles

| Profile | Driver | Journal | Notes |
|---|---|---|---|
| Native Node | `node:sqlite` | WAL + `synchronous=FULL` | Storage worker serializes access |
| Browser OPFS | `@sqlite.org/sqlite-wasm` | VFS-specific (not blind WAL) | Worker + `opfs-sahpool` default |
| Component host | WIT import | Host-supplied | No SQLite handles cross the membrane |
