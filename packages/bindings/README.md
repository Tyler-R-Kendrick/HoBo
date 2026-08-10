# @hobo/bindings

Portable capability bindings and secret locators.

Provisioning a database does not decide how a Worker, a Vercel function, an OCI
container, a VM, a WASM component, or a local process reaches it. This package
keeps those two things apart: a product emits a portable **binding**, and a
runtime-specific **connectivity implementation** projects that binding into a
workload. Cloudflare Hyperdrive is connectivity, not a database provider.

## What is in here

- `secret-ref.ts` — `SecretRef` parsing, redaction, and the `SecretValue`
  wrapper that refuses to serialize.
- `binding.ts` — `CapabilityBinding` parsing and the connectivity registry.
- `standard-connectivity.ts` — first-party connectivity implementations
  (Hyperdrive, the Neon serverless driver, Upstash REST, Vercel/Netlify
  environment refs, OCI/VM service-binding files, WASI config).

## secretRef is a locator, never a value

A `SecretRef` is an opaque URI in a registered scheme (`vault://`,
`azure-kv://`, `aws-sm://`, `gcp-sm://`, `op://`, `infisical://`,
`hobo-secret://`, `hobo-token://`). The parser rejects raw values, embedded
userinfo, unsupported schemes, control characters and log-forging sequences, and
path traversal. Provider-returned connection strings and tokens are captured
server-side and deposited into the token authority immediately; plans,
manifests, events, receipts, projections, UI payloads, and logs carry only the
reference plus non-secret endpoint metadata. `redactSecretRef` is the only
formatter, and `SecretValue` exists so an accidental `JSON.stringify` cannot
leak a resolved value.

## Parse, don't validate

`parseSecretRef` and `parseCapabilityBinding` are the two parse boundaries.
They return derived domain types — a branded `SecretRef` and a
`CapabilityBinding` whose credential fields are branded rather than plain
strings — so a raw string cannot be substituted for a checked locator anywhere
downstream. The protobuf records in `data-models/` are the wire form; these
parsed types are narrowings of them.

## Rotation and identity

A binding rotates independently of the logical resource it points at: the same
`resourceRef` survives a credential rotation, which is what makes post-claim
rotation possible without rebinding every consumer. Expiry is only representable
alongside renewal or rotation support, because an expiring binding with neither
strands its workload.

## Event architecture

Binding resolution is pure and owns no aggregate. Rotation and revocation are
driven as commands into the claim coordinator actor in `@hobo/claims`, which
appends `CapabilityBindingRotated` and related events to the durable event
store. Projections over that stream produce the materialized view the site
renders, snapshots back the read store used for current status, and the receipt
records which connectivity implementation was chosen for each edge.

## Contracts

- `data-models/bindings.proto` / `.cue` — records plus the invariants that keep
  credentials out of endpoint metadata.
- `contracts/pacts/connectivity-binding.pact.json` — the producer/consumer
  boundary, including rejection with `BINDING_UNAVAILABLE` when no compatible
  connectivity path exists rather than silently downgrading the workload.
