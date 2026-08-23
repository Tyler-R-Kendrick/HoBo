---
type: Plan
title: "anti-slop slice: ifc, ctx-config, membrane"
description: "File-complete anti-slop cleanup for ifc-handler-trigger-hobo-608, s1-19-ctx-config-local-resolution, and membrane-deadline-backpressure-contract."
tags: [hobo, anti-slop, oxlint]
---

# ifc / ctx-config / membrane slice

Layer `sdlc/anti-slop-50-draft-technical-ifc`.

`pnpm exec oxlint -c oxlint.config.ts --deny-warnings --no-error-on-unmatched-pattern` on `ifc-handler-trigger-hobo-608`, `s1-19-ctx-config-local-resolution`, and `membrane-deadline-backpressure-contract` is clean.

Local `src/json.ts` parse boundary. Remaining `as` assertions carry a `SAFETY:` comment on the containing statement. Domain objects that are not JSON (handlers, Error instances, config resolvers) stay generic; `isJsonObject` is not used as an Error tag check. Tests: ifc 10 + `tsc --noEmit`, s1-19 16, membrane 17.
