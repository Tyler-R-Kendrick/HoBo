# `@hobo/runtime-cloud-native`

Camp **component host** for `componentHost=cloud-native`.

Registry of multi-cloud host providers. Scaffold includes:

| Provider | Status |
|----------|--------|
| `mock` | In-process handlers for setup/parity tests |
| `aws` / `gcp` / `azure` / `vercel` / `cloudflare` | Stubs (ensure ok, serve unimplemented) |

```ts
import { createCloudNativeRuntimeHost } from "@hobo/runtime-cloud-native";

const host = createCloudNativeRuntimeHost({ defaultProvider: "mock" });
await host.ensure({ hoboHome });
```
