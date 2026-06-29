# Policy authoring waiver contract

HOBO-170 pins the operator-facing policy authoring and gated waiver path from Plan 29 and ADR-0074.
This proof package stays inside the draft boundary: it compiles typed TypeScript policy rules into
policy-pack artifacts, routes policy-pack changes through control-plane create/update/approve
actions, and proves a waiver is scoped, role-gated, time-bounded, audited, and unable to widen a
mandatory deny-ceiling.

Out of scope: the full policy engine, pack signing/federation, break-glass, and OCSF export.
