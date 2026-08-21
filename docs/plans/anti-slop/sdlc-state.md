---
type: Plan
title: "anti-slop SDLC state"
description: "Stacked PR chain for vendoring dmmulroy/anti-slop and gating it on changed files."
tags: [hobo, sdlc, anti-slop, oxlint]
---

# anti-slop — stack state

```text
main
 └── sdlc/anti-slop-01-vendor      #1179 plugin, skill mirrors, oxlint 1.79, lint:slop:changed
  └── sdlc/anti-slop-02-precommit  #1180 relevant-check-policy + tests
   └── sdlc/anti-slop-03-scripts-warnings  #1185 ignore agent-skill dirs; scripts/lib/inspectable
    └── sdlc/anti-slop-04-test     #1187 root competitor/council tests
     └── sdlc/anti-slop-05-examples  #1192 examples/ oxlint-clean
      └── sdlc/anti-slop-06-site     #1193 site/ oxlint-clean (json-inspect helper)
       └── sdlc/anti-slop-07-connectors  #1195 connectors + ci-guard + manifest-plan
        └── sdlc/anti-slop-08-data       #1197 @hobo/data
         └── sdlc/anti-slop-09-recipes   #1199 @hobo/recipes
          └── sdlc/anti-slop-10-mcp      #1202 @hobo/mcp + cloud gateway
           └── sdlc/anti-slop-11-providers-small  #1203 config/agentv/cedar/opa/ax/blacksmith
            └── sdlc/anti-slop-12-providers-runners  #1204 depot + flux
             └── sdlc/anti-slop-13-providers-github-lakebed  #1205 github + lakebed
              └── sdlc/anti-slop-14-providers-railway-convex  #1207 railway + convex
               └── sdlc/anti-slop-15-providers-kafka-webernetes-ttl  #1209 webernetes + kafka + ttl-sh
                └── sdlc/anti-slop-16-providers-neon-prisma  #1211 neon + prisma-postgres
                 └── sdlc/anti-slop-17-providers-browser-wasm  #1212 browser-wasm
                  └── sdlc/anti-slop-18-providers-upstash  #1213 upstash
                   └── sdlc/anti-slop-19-providers-netlify  #1214 netlify
                    └── sdlc/anti-slop-20-providers-vercel  #1215 vercel
                     └── sdlc/anti-slop-21-providers-hostinger  #1216 hostinger
                      └── sdlc/anti-slop-22-providers-hetzner  #1218 hetzner
                       └── sdlc/anti-slop-23-providers-aws  #1220 aws
                        └── sdlc/anti-slop-24-providers-gcp  #1222 gcp
                         └── sdlc/anti-slop-25-providers-azure  #1224 azure
                          └── sdlc/anti-slop-26-providers-cloudflare  #1231 cloudflare
                           └── sdlc/anti-slop-27-providers-digitalocean  #1235 digitalocean
                            └── sdlc/anti-slop-28-code  #1238 @hobo/code
                             └── sdlc/anti-slop-29-hobo  #1241 packages/hobo
                              └── sdlc/anti-slop-30-core  #1242 packages/core
                               └── sdlc/anti-slop-31-broker  #1243 packages/broker
                                └── sdlc/anti-slop-32-connectivity  #1244 packages/connectivity
                                 └── sdlc/anti-slop-33-bindles  #1245 packages/bindles
                                  └── sdlc/anti-slop-34-contracts  #1249 packages/contracts
                                   └── sdlc/anti-slop-35-stations  #1251 packages/stations
                                    └── sdlc/anti-slop-36-storage-sqlite  #1254 packages/storage-sqlite
                                     └── sdlc/anti-slop-37-policy  #1256 packages/policy
                                      └── sdlc/anti-slop-38-dispatcher  #1258 packages/dispatcher
                                       └── sdlc/anti-slop-39-runtimes-small  #1261 wasm+celld+cloud-native
                                        └── sdlc/anti-slop-40-runtimes-browser-oci  #1263 browser+oci
                                         └── sdlc/anti-slop-41-runtimes-dapr-rivet  #1266 dapr+rivet
                                          └── sdlc/anti-slop-42-runtimes-local  #1274 runtime-local
                                           └── sdlc/anti-slop-43-runtime-conformance  #1276 runtime+conformance
                                            └── sdlc/anti-slop-44-identity  #1278 identity
                                             └── sdlc/anti-slop-45-adapters  #1280 adapters
                                              └── sdlc/anti-slop-46-provider-kubernetes  #1284 kubernetes
                                               └── sdlc/anti-slop-47-draft-epic  #1286 epic-proofs
                                                └── sdlc/anti-slop-48-draft-technical-tiny  #1289 tiny technical proofs
                                                 └── sdlc/anti-slop-49-draft-technical-mid  pact+replay+policy-ir
```

Full-repo `pnpm run lint:slop` stays opt-in (large backlog). Pre-commit and
`agent:check` run `lint:slop:changed` on touched TS/JS with `--deny-warnings`.
Skill-tree edits now also select `skills:mirror-check`.

## Next slices (file-complete, not warning-only)

The changed-file gate lints the **whole file**. A warning-only pass over
`scripts/` fails because those files still carry anti-slop errors. Current
`scripts/` count: 127 errors / 16 warnings (57 files). Highest error counts:

- `require-safety-comment-for-type-assertion`
- `no-runtime-typeof`
- `no-known-value-widening`
- `no-unsafe-dictionary-type`

Each follow-up PR should take **one file (or a tight cluster) to zero
findings**, then stop. Do not edit a file that still has other anti-slop
errors.

Cleared: entire `scripts/` tree (layer 3). Layer 4: root competitor/council tests.
Layer 5: `examples/` oxlint-clean (named JsonValue parse boundaries,
UsageReader returns, Firecrawl client injection instead of `vi.mock`).
Layer 6: `site/` oxlint-clean (`site/src/lib/json-inspect.ts`).
Layer 7–10: connectors, data, recipes, mcp.
Layer 11: smallest provider packages (config, agentv, cedar, opa, ax,
blacksmith).
Layer 12: runner-depot + provider-flux.
Layer 13: runner-github + provider-lakebed.
Layer 14: provider-railway + provider-convex.
Layer 15: provider-webernetes + provider-kafka + provider-ttl-sh.
Layer 16: provider-neon + provider-prisma-postgres.
Layer 17: provider-browser-wasm.
Layer 18: provider-upstash.
Layer 19: provider-netlify.
Layer 20: provider-vercel.
Layer 21: provider-hostinger (#1216).
Layer 22: provider-hetzner (#1218).
Layer 23: provider-aws (#1220).
Layer 24: provider-gcp (#1222).
Layer 25: provider-azure (#1224).
Layer 26: provider-cloudflare (#1231).
Layer 27: provider-digitalocean (#1235).
Layer 28: `@hobo/code` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1238).
Layer 29: `@hobo/hobo` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1241).
Layer 30: `@hobo/core` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1242).
Layer 31: `@hobo/broker` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1243).
Layer 32: `@hobo/connectivity` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1244).
Layer 33: `@hobo/bindles` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1245).
Layer 34: `@hobo/contracts` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1249).
Layer 35: `@hobo/stations` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1251).
Layer 36: `@hobo/storage-sqlite` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1254).
Layer 37: `@hobo/policy` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1256).
Layer 38: `@hobo/dispatcher` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1258).
Layer 39: `@hobo/runtime-wasm` + `@hobo/runtime-celld` + `@hobo/runtime-cloud-native`
oxlint `--deny-warnings` and `tsc --noEmit` clean (#1261).
Layer 40: `@hobo/runtime-browser` + `@hobo/runtime-oci` oxlint `--deny-warnings`
and `tsc --noEmit` clean (#1263).
Layer 41: `@hobo/runtime-dapr` + `@hobo/runtime-rivet` oxlint `--deny-warnings`
and `tsc --noEmit` clean (#1266).
Layer 42: `@hobo/runtime-local` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1274).
Layer 43: `@hobo/runtime` + `@hobo/conformance` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1276).
Layer 44: `@hobo/identity` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1278).
Layer 45: remaining `@hobo/adapter-*` (drizzle, better-auth, openbao, hono) oxlint `--deny-warnings` and `tsc --noEmit` clean (#1280).
Layer 46: `@hobo/provider-kubernetes` oxlint `--deny-warnings` and `tsc --noEmit` clean (#1284).
Layer 47: `src/draft/epic-proofs` oxlint `--deny-warnings` clean (#1286).
Layer 48: 122 tiny `src/draft/technical-proofs` packages (1–3 findings) oxlint `--deny-warnings` clean (#1289).
Layer 49: `pact-contract-harness` + `deterministic-replay-engine` + `hobo-policy-ir-contract` oxlint `--deny-warnings` clean.
Next: remaining `src/draft/` (larger technical-proofs, exp-proofs, projects).
Full-repo `lint:slop --deny-warnings` is still red until those land.
