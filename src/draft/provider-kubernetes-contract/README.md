# @hobo/provider-kubernetes Contract POC

HOBO-182 proof package for the Kubernetes provider contract.

It models a Kubernetes-backed CloudProvider with:

- Crossplane/template driver intent for workload and infrastructure resources;
- default definitions for Deployment, Service, Ingress, wasmCloud operator host,
  in-cluster Postgres, and in-cluster Redis;
- provider-scoped `.with(kubernetes.*)` option blocks;
- provider-conformance coverage for seed ports `compute`, `database`, and
  `cache`;
- adversarial guards for missing CRDs, capacity, Crossplane drift, and
  namespace/RBAC tenant isolation.

Run:

```powershell
npm.cmd --prefix src\draft\provider-kubernetes-contract test
```
