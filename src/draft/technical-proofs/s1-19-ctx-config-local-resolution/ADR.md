# ADR — S1-19 ctx.config local resolution (draft POC)

## Context

HOBO-609 delivers offline config/secrets authoring with local-Camp resolution and two security
invariants: refs-only audit events and redaction at capture.

## Decision

1. **References, not values** — manifest and events carry refs + source kinds only.
2. **Local ladder** — `camp-env` from Camp config; `secret-ref` via dev adapter
   (`.env.local` → keychain → prompt; prompt skipped under `CI`).
3. **Brokered rungs stubbed** — bound-resource and federated secret-store paths throw typed errors
   or route to static-hatch-required without reading plaintext.
4. **Redaction at capture** — `scrubAtCapture` runs before event/log/span/stream persistence.

## Parse-don't-validate seams

- `config()` normalizes raw entries into `ConfigContract`.
- `SecretsPort.get` returns `SecretValue`; errors are refined classes.
- Event records are closed structs with no `value` field (see `architecture/*.cue`).

## Promotion path

When S1-13 (`@hobo/bindles`) and S1-11 (`@hobo/runtime`) merge, port modules to production
packages without importing from this draft path.
