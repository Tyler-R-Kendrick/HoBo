# Contracts

One boundary crosses out of this package: `KvRedisExecutor`. Everything else is
pure data.

## `KvRedisExecutor` — consumer-driven contract

`@hobo/kv-redis-compatible` is the **consumer**. Any adapter that drives a real
store — an Upstash REST client, a RESP socket client, an in-process fake — is a
**provider** of this contract and must satisfy every expectation below.

### Request

```ts
execute(command: readonly [string, ...string[]]): Promise<RedisReply>
```

- The verb is element 0; every remaining element is a single argument.
- Arguments are UTF-8 strings and must reach the store byte-for-byte. An
  adapter that URL-encodes must decode symmetrically; one that truncates or
  escapes is non-conformant, and `transport.utf8-round-trip` catches it.
- No argument is a secret. The executor already holds whatever credential it
  needs; the suite never passes one.

### Reply

```ts
type RedisReply =
  | { kind: "value"; value: string | number | null | readonly RedisValue[] }
  | { kind: "error"; message: string };
```

- **An implementation error is returned, never thrown.** A rejected command is
  `{ kind: "error" }`. This is the load-bearing part of the contract: several
  cases assert that a command *must* be rejected, and an adapter that throws
  instead makes those cases indistinguishable from a broken socket.
- **A thrown exception means the harness or transport failed**, not the store.
  The runner converts it to `CONFORMANCE_EXECUTOR_FAILED` and aborts the run
  rather than recording a case result.
- Integer replies may arrive as a JSON number or a numeric string. Both are
  accepted; `TTL` over REST and `TTL` over RESP legitimately differ here.
- `nil` is `value: null`. An empty string is a distinct, non-nil reply.

### Time control

```ts
advanceTime?(ms: number): Promise<void>
```

Optional. A real store satisfies it by sleeping; a deterministic fake satisfies
it by arithmetic. When it is absent the runner **skips** the expiry case — it
never waits, guesses, or assumes.

### Isolation

The runner prefixes every argument beginning with `hobo:conf:` with the
caller's `keyPrefix`. An adapter must not rewrite keys further, or two
conformance runs against one store will collide and the failure will look like
an implementation bug.

## Not a contract boundary

`runKvRedisConformance`, the case catalog, the requirement builders, and the
separation guard are pure functions over data. They are covered by unit tests,
not by a contract, because nothing crosses a process boundary to reach them.
