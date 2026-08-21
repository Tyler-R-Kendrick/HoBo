---
type: Plan
title: "anti-slop slice: vm microvm, inbound xaa, containment, policy port"
description: "File-complete anti-slop cleanup for vm-microvm-build-providers-contract, inbound-xaa-resource-server-contract, malicious-provider-containment-contract, and policy-engine-port-contract."
tags: [hobo, anti-slop, oxlint]
---

# vm microvm + inbound xaa + containment + policy port slice

Layer `sdlc/anti-slop-73-draft-vm-xaa-containment-policy`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `vm-microvm-build-providers-contract`, `inbound-xaa-resource-server-contract`, `malicious-provider-containment-contract`, and `policy-engine-port-contract` is clean.

Local `src/json.ts` parse boundary. Tests: vm 5; xaa 6; containment 10; policy-port 8.
