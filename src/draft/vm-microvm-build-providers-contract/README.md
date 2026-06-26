# HOBO-199 VM/microVM Build Provider Contract

Independent POC for the `@hobo/build-packer`, `@hobo/build-firecracker`, and
`@hobo/build-vagrant` BuildProvider adapters.

This package proves the BuildProvider contract for VM, microVM rootfs, and local
VM box outputs without implementing real Packer, Firecracker, Vagrant,
Executor-sandbox runtime, BuildMachine scheduling, Workload Profile selection,
or provider IaC backends.

Acceptance mapping:

- `createPackerBuildProvider().build(spec)` returns a deterministic VM-image
  `ImageRef` for AWS AMI and Azure managed-image fixture targets.
- `createFirecrackerBuildProvider().build(spec)` returns a deterministic
  microVM rootfs `ImageRef` that declares Executor sandbox-base compatibility.
- `createVagrantBuildProvider().build(spec)` returns a deterministic local VM
  box `ImageRef` with an explicit production VM parity claim.
- All three ImageRefs wire back through the fixture provider `IacProgram` via
  `wireBuildOutputs(...)`.
- `runVmMicroVmBuildConformance(...)` gates the provider shape, reproducibility,
  IAC wire-back, target fail-closed behavior, and adversarial fail-closed cases.
- Adversarial guards reject digest drift, unsupported provider region/arch
  targets, Firecracker rootfs output missing required kernel modules, Vagrant
  production-parity drift, and pinned toolchain drift.

Run it with:

```powershell
npm.cmd --prefix src/draft/vm-microvm-build-providers-contract test
```
