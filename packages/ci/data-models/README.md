# Shared CI contracts

`ci.proto` owns configuration, account offers, repository connections, jobs, leases,
events and snapshots. `ci.cue` constrains every message; valid/invalid fixtures are
executed by schema-tools. Generated records live under `src/_generated`.

Lease prices and free-allocation validity are pinned when capacity is reserved.
Settled free consumption is recorded separately from reserved free minutes so a
host finishing beyond the evidence window cannot be accounted as free.


`policy.proto` defines SDK-authored desired policy separately from the runtime
Account, leases and observed usage. `ci.cue` constrains policy fixtures.
`parseCiPolicy` enforces cross-reference and duplicate checks at the protobuf
JSON boundary; provider/Station authorization requires an external resolver.
Only manual budget periods are accepted until automatic rollover is implemented.

Azure DevOps offers pair `provider: "azure-devops"` with `backend: "ado"`;
desired policy accepts the same provider kind. CUE and runtime configuration
parsers reject mismatched backend/provider pairs. This authorizes an explicitly
host-bound adapter and does not infer a provider entitlement or remote agent.
