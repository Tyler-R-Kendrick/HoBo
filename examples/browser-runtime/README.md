# Browser WIT Environment Station

The GitHub Pages Examples console builds one real WebAssembly Component Model
guest for its browser-local Environment Stations. The guest behavior is derived
from each validated `examples/try-site/apps/*/app.ts` runtime export and crosses
the `hobo:try/browser-station@0.1.0` WIT `invoke` export. For this static local
runtime, KV and queue state is component-local memory; no host capability import
or remote-provider binding is claimed.

```bash
node --import tsx site/scripts/build-browser-wit-runtime.mts
```

The build uses the pinned `componentize-js` and jco installations already owned
by `@hobo/runtime-wasm`, bundles jco's browser shims, and writes generated assets
to `site/public/examples/runtime/`. It does not consume the synthetic contract
bytes from `@hobo/componentize`. Component bytes from `componentize-js` are not
byte-reproducible; the generated manifest records the exact build digest and
source digest used by the page.

The Home Station fetches those static bytes, but the sandboxed blob document
creates the module/WASM blob URLs, initializes the component, and invokes it.
Only `ready` or `error` lifecycle status crosses back to the Home Station.
Neither application operations nor credentials cross that channel.

The WIT world is the executable contract for this in-document component boundary,
and the catalog/runtime parsers refine every repository and fetched JSON value before
use. There is no service transport or persistence port in this example, so it does
not duplicate that local WIT envelope as Protobuf, CUE, or PACT. Those gates become
required if the host gains a remote provider bridge or durable records.
