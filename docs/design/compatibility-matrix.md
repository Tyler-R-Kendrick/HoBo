---
type: Reference
title: "V1 Supported Browser, Device, And Platform Matrix"
description: "Source issue: HOBO-511."
tags: [hobo, design]
---

# V1 Supported Browser, Device, And Platform Matrix

Source issue: HOBO-511.

Executable proof lives in
[`src/draft/v1-supported-platform-matrix-contract`](../../src/draft/v1-supported-platform-matrix-contract/README.md).
Branch evidence is summarized in
[`proofs/hobo-511-supported-platform-matrix`](./proofs/hobo-511-supported-platform-matrix/README.md).

## Goal

Release compatibility is customer-facing, not only package/runtime compatibility. V1 needs an
explicit browser, device, and platform support contract so web UX, CLI bootstrap, docs, release
notes, and support triage use the same evidence and limitation language.

## Primary Personas

| Persona | Need |
|---|---|
| App developer | Know whether the web UX and local CLI path are supported on their daily development machine. |
| Platform engineer | Know which OS/browser assumptions affect rollout, support, and bootstrap instructions. |
| Support operator | Classify unsupported environment reports without inventing support promises. |
| Release owner | Publish beta and GA support claims only when evidence exists or a limitation is documented. |

## Desktop Browser Matrix

| Browser | Version policy | Beta | GA | Evidence |
|---|---|---|---|---|
| Chrome | Current and previous stable | Supported | Supported | E2E tests, accessibility checks, docs |
| Edge | Current and previous stable | Supported | Supported | E2E tests, accessibility checks, docs |
| Firefox | Current stable | Limited | Supported | E2E tests, accessibility checks, known limitation |
| Safari | Current stable on macOS | Limited | Limited | E2E tests, accessibility checks, known limitation |

## Device And Responsive Posture

| Area | V1 posture |
|---|---|
| Minimum viewport | 390px wide by 844px high |
| Beta support | Limited |
| GA support | Limited |
| Supported mobile uses | Read release notes and known limitations; inspect status and support guidance; complete lightweight account/session recovery. |
| Unsupported mobile uses | Full topology editing; large plan diff review; provider credential bootstrap. |

V1 is desktop-first for authoring and operations. Mobile/responsive support is a limited support and
inspection posture, not a native mobile product claim.

## CLI And Local Bootstrap Platforms

| Platform | Architectures | Beta | GA | Evidence |
|---|---|---|---|---|
| macOS | arm64, x64 | Supported | Supported | Bootstrap smoke, docs, support guidance |
| Linux | x64, arm64 | Supported | Supported | Bootstrap smoke, docs, support guidance |
| Windows | x64 | Limited | Supported | Bootstrap smoke, docs, known limitation |

## Evidence Source Map

Every support claim must map to one or more of these evidence sources:

- e2e tests;
- accessibility checks;
- bootstrap smoke;
- docs;
- support guidance;
- known limitation.

## Unsupported Report Routing

| Destination | Owner | Handles |
|---|---|---|
| Support debug | Support operator | Customer report needs environment capture, reproduction note, and unsupported/supported classification. |
| Release notes | Release owner | Known unsupported or limited environment should be visible in release notes and upgrade guidance. |
| Known limitations register | Product owner | Accepted v1 limitation or GA blocker needs durable tracking without promising support. |

## Scope Out

- No broad device lab or real-device coverage program.
- No native mobile app or full mobile authoring implementation.
- No automated browser grid implementation.
- No live e2e execution or performance certification in this issue.
- No package/runtime compatibility replacement; this matrix adds user-facing environment support.

## Dependencies

- [release-notes-upgrade-guide.md](./release-notes-upgrade-guide.md) publishes supported install
  paths, compatibility matrix inputs, and known limitations.
- [launch-support-escalation.md](./launch-support-escalation.md) consumes unsupported environment
  routing and support/debug evidence.
- [workspace-onboarding-ux.md](./workspace-onboarding-ux.md) owns browser-visible first-run and
  responsive UX expectations.
- [developer-experience.md#plan-07](./developer-experience.md#plan-07) owns CLI, local bootstrap,
  dashboard, docs, and support-facing DX surfaces.
- [ADR-0082](./adr/02-identity-security.md#adr-0082) keeps launch claims tied to reproducible
  verification evidence.
