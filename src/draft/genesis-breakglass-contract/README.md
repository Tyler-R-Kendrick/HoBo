# Genesis Break-Glass Contract POC

This draft pins the HOBO-166 contract for the first Yard `Org-Admin` bootstrap
and the emergency recovery path when normal identity and policy-control paths are
unavailable.

It defines:

- A one-time `identity.GenesisAdmin` fact with an immediate `role.BindingCreated`.
- A rotation path that revokes the bootstrap admin and binds the durable admin.
- Offline Ed25519 break-glass credentials that produce auditable policy and
  identity events.
- Emergency-context gating: a valid offline credential is denied unless the IdP
  is unavailable and a mandatory policy rule is blocking all changes.
- Replay protection for break-glass nonces.
- Guardrails proving normal IdP tokens and self-granted `Org-Admin` bindings
  cannot recover a bricked mandatory rule.

## Proof Boundaries

This is a contract POC. It does not implement the RBAC engine, KMS custody,
policy-pack storage, IdP integration, or runtime provider wiring.

## Verification

Run the focused contract suite:

```powershell
npm.cmd --prefix src\draft\genesis-breakglass-contract test
```

The root `npm.cmd test` also discovers this package's Node test suite.
