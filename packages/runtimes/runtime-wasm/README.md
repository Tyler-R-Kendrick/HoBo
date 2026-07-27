# `@hobo/runtime-wasm`

Camp **component host** backend for `componentHost=wasm` (alias: `isolated-wasm`).

Private bindle components are componentized to wasi:http/proxy `.wasm` and run in
real **Wasmtime OS-process sandboxes**. Public web stays process-local (wired by
`@hobo/hobo`).

```ts
import { createWasmRuntimeHost, ensureWasmRuntime } from "@hobo/runtime-wasm";

const host = createWasmRuntimeHost();
await host.ensure({ hoboHome: process.env.HOBO_HOME! });
const privateServe = await host.servePrivate({
  hoboHome,
  projectDir,
  privateComponents: [{ resourceName: "api", projectDir }],
});
```

Wired by the composition root (`hobo yard init --host wasm`).
