# @hobo/provider-kubernetes

Kubernetes CloudProvider for HoBo: an equivalence map from the `compute` port
onto a Deployment, an injected-transport apiserver driver that places that
workload on a real cluster, and the temporary/agent Environment Station
contract.

```sh
pnpm --filter @hobo/provider-kubernetes test
```

## What this package does

- **Equivalence → default Resource Definitions** (`EQUIVALENCE_CLASSES` /
  `createKubernetesProvider`), with Matching's `satisfies` answering
  full/partial/none rather than fabricating parity.
- **Placement on a cluster.** `parseWorkloadPlacement` refines an authored
  option bag; `createKubernetesApiClient` creates the Namespace, Deployment and
  ClusterIP Service through an injected HTTP transport; `provisionWorkload`
  orders those three and returns a receipt.
- **Rollout truth.** `observeRollout` reads the Deployment's `/status`
  subresource and reports the phase the controller's own generation and
  conditions support.
- **Teardown that stops at what it created.** `cleanupWorkload` deletes only a
  namespace this driver created, and reports `deleting` — not `deleted` — until
  it has observed the namespace gone.
- **Temporary/agent Environment Stations:**
  `supportsAnonymousTemporaryDeploy = true`, provisioned through an
  injectable/local transport with no permanent API tokens.

## What it does not do

- **No kubeconfig, no credential handling.** The host supplies a
  `KubernetesTransport` that already authenticates. Nothing here reads
  `~/.kube/config`, and nothing here holds a bearer token.
- **No ingress, no LoadBalancer, no external address.** The receipt carries an
  in-cluster `http://<svc>.<ns>.svc.cluster.local:80` URL, because that is the
  only object this provider created. Advertising an external hostname would be
  claiming something it never provisioned.
- **No waiting.** `observeRollout` reads once. A driver that polls owns a
  deadline, a backoff and a cancellation story, and all three belong to the
  caller that knows what the deploy is for.
- **No deletion of anything it adopted.** An adopted namespace was the
  operator's before this deploy existed and holds objects nobody here
  enumerated.

## Parse, don't validate

Nothing in this package re-checks a value it already accepted. Untrusted input
crosses one parser and comes out as a **derived domain type** that cannot hold
the bad case:

- `parseWorkloadPlacement` turns the untrusted `.with(kubernetes.workload(...))`
  option bag into a `WorkloadPlacement`: an RFC 1123 name and namespace, a
  registry-qualified image with a tag or digest, bounded replicas, and CPU and
  memory already normalized to millicores and bytes. Kubernetes quantities are a
  suffix language — `250m`, `0.25`, `1M`, `1Mi` — and comparing them as written
  is how a limit ends up below its request. `parseCpuMillicores` and
  `parseMemoryBytes` are the only code that reads a suffix; everything
  downstream compares integers.
- `parseNamespaceRecord`, `parseDeploymentRecord` and `parseServiceRecord` turn
  apiserver JSON into records whose fields are already checked: UID-shaped uids,
  opaque `resourceVersion` tokens, a Namespace phase from the documented pair, a
  routable ClusterIP (a headless `None` is rejected, because a record built from
  one would promise an endpoint that does not exist).
- `rolloutPhaseFor` collapses a generation, an observed generation, four replica
  counters and a condition list into one of `pending | progressing | available |
  failed`. A `ProgressDeadlineExceeded` rollout whose old replicas are still
  serving reports every counter as healthy; the phase is `failed` anyway, and
  `available` is unreachable unless the controller has observed the current
  generation.
- `parseApiStatus` reads the apiserver's own `kind: "Status"` envelope, so a 409
  `AlreadyExists` (adopt the namespace) can be told apart from a 409 `Conflict`
  (stale resourceVersion), which want opposite responses.
- `NamespaceRecord.createdByHobo` makes "we created this" a field rather than an
  assumption. It is what `cleanupWorkload` reads before issuing a DELETE.

`data-models/provider_kubernetes.proto` is the design-time wire view of these
shapes and `data-models/provider_kubernetes.cue` carries the invariants the
parsers enforce (DNS-1123 labels, replica and port ranges, limit ≥ request,
`available` implying an observed current generation, retention naming its
reason). The parsed types above are the executable view of that pair.

## Why the transport guard is this package's own

Eight provider transports in this repo delegate to `guardTransport` in
`@hobo/core`. This one does not, and the reason is not "different semantics" in
the abstract — it is two of core's checks that an apiserver client cannot
satisfy, measured against the real policy:

| what core does | what an apiserver needs |
|---|---|
| `allowedHosts` must contain the hostname exactly | there is no host to write down: the apiserver is the operator's own, at an address only they know |
| the port must be empty or `443` | clusters answer on `:6443`, and `kubectl proxy` on `:8001`; `https://cluster.example.test:6443/api/v1/namespaces` is refused by core on the port before any host rule is consulted |

Expressing this package in core's policy would mean adding an `allowAnyHost` and
an `allowedPorts` escape — that is, making the two checks the guard exists for
optional, for the benefit of one caller. The `allowInsecureLoopback` flag here
covers only the `kubectl proxy` cleartext case, which is the *smallest* of the
differences, so lifting it alone would not have helped.

What is shared is the rule that actually drifted: `encodesPathSeparator` comes
from `@hobo/core`, so the percent-encoded-separator refusal has one definition
across every transport in the repo.

## Contracts

`contracts/provider-kubernetes-apiserver.pact.json` is the consumer-driven
contract for the core/v1 and apps/v1 surfaces this package calls;
`test/contract.test.ts` replays every interaction through the real client with
the fake at the HTTP seam and nowhere else. See
[`contracts/README.md`](contracts/README.md).

## Event architecture

This package is a strategy leaf: it holds no reducer, no stream, and no store.
Its job is to turn one apiserver interaction into facts a durable plane can
record, and that machinery lives in the deploy/claim planes, not here.

The flow for one placement:

1. A **command** from the deploy family — `PlaceWorkload`, `ObserveRollout`,
   `ReleaseWorkload` — is what a caller issues. `provisionWorkload`,
   `observeRollout` and `cleanupWorkload` are the effectful halves those
   commands invoke.
2. Each returns an observation, not a durable fact: a `ProvisionReceipt`, a
   `DeploymentRecord`, a `CleanupOutcome`. The deploy coordinator **actor** is
   what turns them into the **events** `WorkloadPlaced`, `NamespaceAdopted`,
   `RolloutObserved`, `RolloutFailed` and `WorkloadReleased`.
3. That actor appends the command and its events to the durable **event store**
   on the `deploy:<deploymentRef>` stream under an optimistic `expectedSeq`. The
   records here are designed to be appendable: they carry names, uids,
   `resourceVersion` tokens, counters and instants, and never a token, a
   kubeconfig or a Secret payload.
4. Folding that journal back yields a **snapshot** of the placement — the
   namespace's ownership flag, the last observed generation, the last rollout
   phase — which the next append fences against, and which is what makes a
   repeated deploy adopt rather than duplicate.
5. The rollout **projection** over that snapshot is the **materialized view**
   `hobo deploy status` renders, and it is the **read store** for the endpoint
   URL and phase. It cannot report a placement healthy while the last observed
   phase is `failed`, and it cannot report a namespace released while the last
   `CleanupOutcome` was `deleting`.

The distinction step 5 depends on is the one this package is careful about:
`deleting` is an acceptance, `deleted` is an observation, and only the second
one may retire a placement from the read model.

## Error codes

`KubernetesProviderError.code` is one of `PROVIDER_AUTH_FAILED`,
`PROVIDER_CONTRACT_CHANGED`, `PROVIDER_OPERATION_AMBIGUOUS`,
`PROVIDER_RATE_LIMITED`, `PROVISIONING_CONFLICT`, `PLACEMENT_REJECTED`,
`ROLLOUT_FAILED`, `CLEANUP_INCOMPLETE`.

A 5xx on a create is `PROVIDER_OPERATION_AMBIGUOUS`, never a retryable error: a
timed-out POST never proves the apiserver did nothing. Every message and detail
passes `redactClusterText`, because a `Status` message quotes the object that
caused it and those objects carry ServiceAccount tokens and imagePullSecrets.
