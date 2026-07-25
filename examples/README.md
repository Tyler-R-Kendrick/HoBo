# HoBo reference examples

`examples/*` are HoBo's reference example apps: runnable, production-grade
packages that make the product story inspectable without becoming a hidden
implementation lane (scope and proof modes:
[`docs/design/example-apps.md`](../docs/design/example-apps.md)). Examples are
tests — they double as CI fixtures ([`architecture.md`](../docs/design/architecture.md#plan-10))
— and every example is a production package under the architecture guard:
protobuf + CUE in `data-models/`, generated runtime types in
`src/_generated/`, executable PACTs in `contracts/`, parse-don't-validate
derived types, and event-driven CQRS shape.

| Example | What it proves |
|---|---|
| [`hello-bindle/`](./hello-bindle/README.md) | The minimal Bindle: a hello-world API, a web app bound to it, and the wiring — plus the S0/S1 stage-gate and E2E fixture lanes. |
| [`ci-runner-balancing/`](./ci-runner-balancing/README.md) | A credit-aware CI runner dispatcher balancing GitHub-hosted, self-hosted, and third-party Actions runner providers by usage/budget then billable cost — free credits before realtime billing (ADR-0071 `maximize-credits`). Dogfooded by this repo's own CI. |

Planned next (reserved in [`architecture.md`](../docs/design/architecture.md#plan-10)):
`multi-cloud-shop/` · `durable-agent/` · `self-host-yard/`.

## Conventions

- Package name `@hobo/example-<name>`, private, ESM, scripts `test`,
  `typecheck`, `lint` (see [`hello-bindle/package.json`](./hello-bindle/package.json)).
- All `.proto`/`.cue` live under the package-local `data-models/` only; every
  proto message carries a matching CUE `#Type:` constraint; generated output
  is checked in under `src/_generated/` (`buf generate data-models --template
  ../../buf.gen.yaml -o src/_generated`).
- Service boundaries ship executable PACT contracts under `contracts/pacts/`.
- `npm run architecture:guard` must pass for any example change.
