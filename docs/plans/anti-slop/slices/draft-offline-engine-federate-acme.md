---
type: Plan
title: "anti-slop slice: signed offline bundle, contract engine, federate, acme"
description: "File-complete anti-slop cleanup for signed-offline-bundle-contract, contract-engine-port-contract, hobo-auth-federate-verify-contract, and acme-dns01-cert-issuance-contract."
tags: [hobo, anti-slop, oxlint]
---

# signed offline + contract engine + federate + acme slice

Layer `sdlc/anti-slop-74-draft-offline-engine-federate-acme`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `signed-offline-bundle-contract`, `contract-engine-port-contract`, `hobo-auth-federate-verify-contract`, and `acme-dns01-cert-issuance-contract` is clean.

Local `src/json.ts` parse boundary. Rename Pact broker contract helpers off `shape`. Tests: offline 5; engine 8; federate 6; acme 5.
