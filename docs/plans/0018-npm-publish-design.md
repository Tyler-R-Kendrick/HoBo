---
type: Implementation Plan
title: "npm publish path — release engineering design (owner-gated execution)"
description: "F34 of the remediation roadmap delivered as design: publish allowlist over the 71 workspace manifests, version policy, provenance attestation, dry-run lane, and install-path docs — execution explicitly awaits the owner's npm token and go decision."
---

# npm publish path — release engineering design

**Status:** design complete; **execution owner-gated** (npm org + token + go
decision). This is the only genuinely owner-gated item in
[0017](./0017-remediation-roadmap.md) (F34) and is recorded as such — nothing
below executes without the owner.

## 1. Publish allowlist

The workspace holds **71 manifests: 30 already non-private, 41 private**. The
non-private set is the publish allowlist seed; `private: true` remains the
default posture for anything not listed. Verification is mechanical:

- Gate script (`scripts/check-publish-allowlist.ts`, to be added with the
  first release PR): every manifest is either `private: true` or a member of
  the allowlist recorded in `release/allowlist.json`; drift fails CI.
- The allowlist ships in waves. **Wave 1 (public API floor):** `@hobo/core`,
  `@hobo/contracts`, `@hobo/bindles`, `@hobo/cli`, `@hobo/hobo` (the binary),
  `@hobo/storage-sqlite`, `@hobo/runtime-local`. **Wave 2 (platform):**
  dispatcher, trails, identity, policy, cloud, broker, conformance,
  management, control-api, runtime, remaining runtimes. **Wave 3
  (providers/iac):** the provider-* and iac-* families as their lanes reach
  credential-gated completeness. A package enters a wave only with a green
  architecture guard, a README, and its PACT/data-models artifacts.

## 2. Version policy

**Fixed-train versioning** (single version for every published package per
release), not per-package changesets:

- The platform's packages are contract-coupled (proto/CUE shapes, PACT
  fixtures, port types); a fixed train makes "which versions work together"
  a non-question — the answer is always "the same version".
- Mechanics: one `version` field driven by `pnpm -r exec npm version
  <next> --no-git-tag-version` in a release PR; a `release/CHANGELOG.md`
  section per train; git tag `vX.Y.Z` on the squash-merge.
- Changesets is deliberately rejected for now: 30+ interdependent packages
  with independent versions multiplies the support matrix for zero user
  benefit at this stage. Revisit when any package needs an out-of-train
  hotfix cadence.

## 3. Provenance attestation

- `npm publish --provenance` from the GitHub Actions release workflow (OIDC
  → npm provenance statements; requires the npm org to allow it).
- SLSA-shaped build provenance: the release workflow records the source
  digest + builder identity; the shapes align with the provenance statement
  types in `@hobo/registry` (F24) so HoBo can verify its own supply chain
  with the same code path users get.
- npm 2FA/automation token stays owner-held; the workflow uses a repository
  environment (`release`) with required reviewers = owner.

## 4. Dry-run lane (runs before any token exists)

- CI job `release-dry-run`: `pnpm -r publish --dry-run --no-git-checks`
  over the allowlist on every PR touching a `package.json` or
  `release/` file — proves packability (files whitelists, exports maps,
  dist presence) without publishing.
- Local: `pnpm run release:dry` (same command) for contributors.
- The existing `files: ["dist"]` convention plus per-package `build` scripts
  make the tarballs self-contained; the dry-run gate is what keeps that
  true.

## 5. Install-path documentation

On first publish: README quickstart switches from clone-and-build to
`npm i -g @hobo/hobo` (binary) and `npm i @hobo/bindles` (authoring); the
site's getting-started mirrors it. Until then both continue to document the
repo-local path — no aspirational install instructions (repo truth policy).

## Owner checklist (the gate)

1. Create/claim the `@hobo` npm org scope; enable provenance.
2. Mint an automation token into the `release` environment.
3. Approve wave 1 allowlist; merge the release PR (adds the gate script,
   allowlist file, workflow, dry-run lane).
4. `git tag v0.1.0` → workflow publishes wave 1.
