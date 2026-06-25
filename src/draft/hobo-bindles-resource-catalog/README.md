# @hobo-draft/bindles-resource-catalog

POC for HOBO-37: the `@hobo/bindles` resource catalog declaration surface.

This draft package proves the M0 contract before generated `hobo:sdk` bindings exist:

- every resource row in [`docs/design/authoring-resources-wiring.md`](../../../docs/design/authoring-resources-wiring.md#catalog--resource--wit-port--permission-verbs) has exactly one exported catalog factory;
- each handle records stable identity, `portRef`, and the type marker for its `.allow()` verbs;
- verb methods return inert descriptors that explicitly lower to future generated `hobo:sdk` bindings;
- `secret()` and `secretRef()` are distinct symbols;
- `search` remains a query-side `data(...).query(...)` capability, not a catalog factory.

Out of scope for this POC: collection, manifest emission, provider options, topology objects, codegen, and authoring new WIT.
