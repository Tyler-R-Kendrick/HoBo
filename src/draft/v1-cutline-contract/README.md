# V1 Cutline Contract

HOBO-401 defines the launch cutline that separates v1 blockers from post-v1 growth.

This POC records a machine-checkable cutline in `src/v1-cutline.ts`:

- `inScope` lists the v1 work classes that can block launch.
- `outOfScope` lists work that must not be implemented in the cutline issue.
- `blockerCategories` maps each launch blocker class to an owning project or initiative.
- `followUpTaskPolicy` prevents M1-M4 execution fan-out before M0 acceptance.

The required readiness domains are reference architecture, productization, support, legal/privacy, documentation, and operations readiness. Scope-out entries cite the current design docs or ADR anchors so the public v1 boundary can be audited without inventing capability work in this slice.

Run:

```sh
npm --prefix src/draft/v1-cutline-contract test
```


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for V1 Cutline Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
