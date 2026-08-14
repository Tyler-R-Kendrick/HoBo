# `@hobo/runtime-celld`

Experimental **Durable Objects dialect** for [celld](https://github.com/denoland/celld).

This is **not**:

- a HoBo WASM Component Model / WIT host
- a multi-tenant public actor service
- a filesystem-local `hobo dev` default
- a Flux-hosted fleet (recipe status: `unsupported` until overlay proofs exist)

It **is** a Camp runtime adapter: overlay-required, operator port private, CAS bucket (`s3`/`gs`/`r2`), one fleet per trust boundary. Bindles still author `actor()`. Workers/Wrangler is a scored Camp escape.

See `ARCHITECTURE.md`.

Live baremetal / deploy / Worker-module tests require the pinned `celld`
binary (`CELLD_BIN`, default `/tmp/hobo-live/bin/celld`). A missing binary
is a failure, not a skip.
