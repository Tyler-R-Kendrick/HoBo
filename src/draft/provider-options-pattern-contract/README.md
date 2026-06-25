# Provider Options Pattern Contract

Independent POC for HOBO-52. It pins the `.with(provider.option(...))` authoring contract as manifest annotations:

- provider options are additive and typed by provider/resource pairing;
- non-resolved providers stay recorded but inert;
- `prefer` and `require` serialize as distinct requirement markers;
- repeated options for the same provider merge deterministically unless a value conflicts;
- every `.with()` annotation records a PortabilityReport-readable lock-in marker.

Run:

```sh
npm test
```
