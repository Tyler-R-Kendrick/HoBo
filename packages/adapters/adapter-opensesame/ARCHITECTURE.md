# Architecture — `@hobo/adapter-opensesame`

Optional residual `SecretsPort` adapter. **Not** a default dependency of `@hobo/identity` or the composed `hobo`
binary. It lets HoBo run under OpenSesame's proxied invocation and hold a surrogate instead of a token.

## Schema and constraints

- Protobuf: [`data-models/adapter_opensesame.proto`](./data-models/adapter_opensesame.proto) (generated into `src/_generated/`)
- CUE: [`data-models/adapter_opensesame.cue`](./data-models/adapter_opensesame.cue)
- PACT: [`contracts/pacts/opensesame-proxied-run-boundary.pact.json`](./contracts/pacts/opensesame-proxied-run-boundary.pact.json)

## Parse, don't validate

Parse, don't validate: the bindings file crosses one boundary, `parseCredentialBindings`, and becomes frozen
`ParsedCredentialBinding` derived types (a narrowing of the generated `CredentialBinding`, branded with a symbol that
only the parser holds). The schema renderer, the launch and the port take the parsed type and never re-check a string;
the renderer still re-checks what it interpolates and fails `schema_injection`, because a forged value must not
add an entry to the file. The regular expressions are the CUE's; `test/binding.test.ts` reads them out of the `.cue`.
A run's end crosses another boundary, `parseOutcome`, and becomes a `ProxiedRunOutcome` whose `kind` is a closed set.

## Residual ranking (unchanged)

bound-resource -> **provider-federation** (this adapter) -> camp-value -> static-escape. Prefer secretless
federation (ADR-0027 / ADR-0113); this adapter is the way to hold even less than a residual store does.

## Event architecture

This adapter owns no aggregate. It implements the residual `SecretsPort` for a process started under OpenSesame.

- **Command** - `runProxied` (launch a command under OpenSesame) and the port's `put` / `access` / `accessVersion` /
  `listVersions`. `put` is rejected: secrets enter by a person's `opensesame pass insert`.
- **Event** - upstream `@hobo/identity` emits refs-only `secret.Accessed` / `config.Resolved` (never-compact
  CredentialAudit). The adapter's own record of a run is a `ProxiedRunOutcome` (a closed `kind`, an exit status and one
  fixed sentence chosen by the kind: no line of output, OpenSesame's or the child's, is ever copied into it) and a `SurrogateEvidence` (digests of the connection and the scope); neither carries a surrogate or a token.
- **Actor** - none owned here; OpenSesame's plugin is the actor that issues, redeems and revokes a surrogate for the
  life of one run, and the Camp / Station / config-resolver actors in identity and runtime packages invoke the port.
- **Event store** - the credential-audit stream on the platform EventStore (identity package), not an OpenSesame journal.
- **Materialized view / projection** - the credential-audit projection folds `secret.Accessed` by correlation; the
  surrogate is never projected, only the `opensesame://<connection>#surrogate` reference.
- **Snapshot** - none. A surrogate lives for one run (OpenSesame revokes it when the child exits, at most 12 hours).
- **Read store** - the plugin's notices (`opensesame plugins notices surrogate-proxy`) are OpenSesame's read store of
  tripwires and refusals; agents see references and outcome kinds only.

## Boundaries

| Surface | Direction |
|---|---|
| `@hobo/identity` `SecretsPort` | this adapter implements the residual port |
| `@hobo/bindings` `parseSecretRef` | locators are `hobo-token://` references |
| `opensesame dev --agent --schema <file> run -- <cmd>` | process boundary; the pact |
| OpenSesame surrogate-proxy plugin | OpenSesame's, never linked here |

## Why stderr is read, and what it is not

A proxied run that cannot deliver a surrogate still starts the child and exits as the child does. The only signal
is a line on stderr, so `parseOutcome` reads OpenSesame's own lines (column 0, `opensesame: ` or `Error: `) beside the
status. The child shares that stream, so this is a diagnosis, not a gate; the gate is the port, which serves only a
value shaped `osr_` + 32 hex from the child's own environment, under the run's markers.

A child can print a line in one of OpenSesame's shapes, and can exit 77, 143 or 129 itself. What it gains is a
fail-closed kind (a tripwire, a refusal, a placeholder) with a fixed sentence; it never gains a pass, and nothing it
wrote reaches the outcome or an error message. An `Error:` line that is not one of OpenSesame's is the child's own
failure (every uncaught Node exception starts that way): `child_exit`, the status, no words. The status 77, 143 or
129 is advisory beside its line.
