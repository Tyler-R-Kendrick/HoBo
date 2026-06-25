# HoBo config and secret schema contract

Independent POC for HOBO-40. It pins the varlock-style authoring surface:

- `config({...})` declares refs, not values.
- `fromBinding(name)` records a secretless bound-resource source.
- `secretRef(ref)` records a use-time secret-store ref and stays distinct from catalog `secret(name)`.
- `env(default)` records non-secret Camp config type without serializing the default value into the manifest.
- `createConfigContext()` exposes `ctx.config.<KEY>()` only for declared keys.

The tests prove refs-only manifest emission, plaintext leak detection, dev-only source marking, and the TypeScript key surface.
