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
                                                 └── sdlc/anti-slop-49-draft-technical-mid  #1291 pact+replay+policy-ir
                                                  └── sdlc/anti-slop-50-draft-technical-ifc  #1294 ifc+ctx-config+membrane
                                                   └── sdlc/anti-slop-51-draft-s1-15  #1296 bind-wiring-topology
                                                    └── sdlc/anti-slop-52-draft-runtime-primitives  #1297 runtime-ts+multi-region-dr
                                                     └── sdlc/anti-slop-53-draft-escape-ir-postgres  #1299 raw-driver+contract-ir+postgres
                                                      └── sdlc/anti-slop-54-draft-cloudflare-camp  #1301 cloudflare-contract+camp-mapping
                                                       └── sdlc/anti-slop-55-draft-collection-azure  #1303 collection-engine+azure-full
                                                        └── sdlc/anti-slop-56-draft-ifc-actor-data  #1305 ifc-handler+actor-host+data-paradigm
                                                         └── sdlc/anti-slop-57-draft-portability-usage-convex  #1307 s4-08+s1-17+convex-adapter
                                                          └── sdlc/anti-slop-58-draft-planner-loop-closure  #1309 planner+local-loop+closure-builder
                                                           └── sdlc/anti-slop-59-draft-cloud-provider-contracts  #1311 azure+gcp+aws-contracts
                                                            └── sdlc/anti-slop-60-draft-cdktf-cqrs-projection  #1313 cdktf+cqrs+native-log
                                                             └── sdlc/anti-slop-61-draft-container-wrpc-drift  #1315 container-fallback+wrpc+drift
                                                              └── sdlc/anti-slop-62-draft-forge-aws-catalog-trust  #1316 forge+aws-catalog+artifact-trust
                                                               └── sdlc/anti-slop-63-draft-snapshot-k8s  #1319 snapshot-compaction+k8s-contract
                                                                └── sdlc/anti-slop-64-draft-realize-auth-projection  #1320 realize+auth-consumer+document-projection
                                                                 └── sdlc/anti-slop-65-draft-authoring-stage-ha  #1321 authoring+stage-gate+control-plane-ha
                                                                  └── sdlc/anti-slop-66-draft-broker-training-auth  #1323 meta-cloud-broker+training-engine+auth-authoring
                                                                   └── sdlc/anti-slop-67-draft-relational-registry-bindles  #1324 relational-projection+registry-ingest+bindles-freeze
                                                                    └── sdlc/anti-slop-68-draft-non-iac-mcp-componentize  #1327 non-iac-adapters+mcp-server+componentize
                                                                     └── sdlc/anti-slop-69-draft-policy-planner-adapters  #1328 built-in-policy+planner-dag+policy-adapters
                                                                      └── sdlc/anti-slop-70-draft-eval-overlay-dispatcher  #1329 eval-promotion+overlay-mesh+dispatcher-credits
                                                                       └── sdlc/anti-slop-71-draft-resource-operator-closure  #1330 resource-definition+operator-ports+closure-lowering
                                                                        └── sdlc/anti-slop-72-draft-slo-events-closure-eval  #1331 slo+events+closure-v1+live-eval
                                                                         └── sdlc/anti-slop-73-draft-vm-xaa-containment-policy  #1332 vm-microvm+inbound-xaa+containment+policy-port
                                                                          └── sdlc/anti-slop-74-draft-offline-engine-federate-acme  #1333 signed-offline+contract-engine+federate+acme
                                                                           └── sdlc/anti-slop-75-draft-connectivity-interconnect-flags  #1334 connectivity-policy+interconnect+flags+domain-validation
                                                                            └── sdlc/anti-slop-76-draft-artifact-dispatch-dagger-certify  #1335 artifact-repo+driver-dispatch+dagger+certify
                                                                             └── sdlc/anti-slop-77-draft-matching-host-projection-network  #1336 matching-engine+execution-host+projection-rebuild+tier-two
                                                                              └── sdlc/anti-slop-78-draft-local-dev-closure-agent-manifest  #1337 local-dev-authoring+closure-public-api+durable-agent+manifest
                                                                               └── sdlc/anti-slop-79-draft-protobuf-promotion-capability  #1338 protobuf-cue+observed-promotion+capability-manifest+capability-spec
                                                                                └── sdlc/anti-slop-80-draft-eventstore-ca-cost-revocation  #1339 camp-eventstore+internal-ca+cost-guard+session-revocation
                                                                                 └── sdlc/anti-slop-81-draft-wit-budget-eval-listing  #1340 wit-conformance+budget-quota+eval-methodology+listing-yank
                                                                                  └── sdlc/anti-slop-82-draft-runbook-pack-flag-identity  #1341 runbook+resource-pack+auth-flag-readset+identity-event
                                                                                   └── sdlc/anti-slop-83-draft-bind-junction-trace-flag  #1342 bind-reference+junction-federated+trace-context+feature-flag-port
                                                                                    └── sdlc/anti-slop-84-draft-rbac-broker-read-plan  #1343 rbac-resolution+broker-env+read-surface+deployment-plan-ir
                                                                                     └── sdlc/anti-slop-85-draft-core-poison-options-registry  #1344 core+poison-event+provider-options+registry-artifact
                                                                                      └── sdlc/anti-slop-86-draft-alert-wasm-connector-crew  #1345 alertmanager+build-wasm+connector-authoring+crew-event
                                                                                       └── sdlc/anti-slop-87-draft-orchestrator-saga-dns-authz  #1346 orchestrator+saga-templates+dns-rebinding+end-user-authz
                                                                                        └── sdlc/anti-slop-88-draft-lifecycle-evals-metering-openfeature  #1347 lifecycle-phase+live-evals+metering-view+openfeature
                                                                                         └── sdlc/anti-slop-89-draft-otel-remediation-escape-wasi  #1348 otel-traces+remediation-safety+repo-view-escape+wasi-pins
                                                                                          └── sdlc/anti-slop-90-draft-x509-yard-domain  #1349 x509-svid-mtls+yard-domain-validation
                                                                                           └── sdlc/anti-slop-91-draft-capability-conformance-authz-cutover  #1350 capability-negotiation+conformance-port+authz-cache+domain-cutover
                                                                                            └── sdlc/anti-slop-92-draft-drift-gateway-chaos-secret  #1351 drift-detection+gateway-realization+golden-chaos+config-secret
                                                                                             └── sdlc/anti-slop-93-draft-remediation-console-dapr-broker  #1352 remediation-action+operator-console+dapr-kafka+broker-resolution
                                                                                              └── sdlc/anti-slop-94-draft-mirror-oci-page-paradigm  #1353 mirror-digest+oci-artifact+paginated-query+paradigm-idiom
                                                                                               └── sdlc/anti-slop-95-draft-local-reactor-guardrails-signed  #1354 provider-local+reactor-fanout+agent-guardrails+signed-artifact
                                                                                                └── sdlc/anti-slop-96-draft-tier-one-rollback-wit-yard  #1355 tier-one-network+upgrade-rollback+wit-port-stub+yard-topology
                                                                                                 └── sdlc/anti-slop-97-draft-flag-chaos-tier-governance  #1356 flag-store+chaos-experiment+connectivity-tier+data-governance
                                                                                                  └── sdlc/anti-slop-98-draft-forge-search-guardrail-runtime  #1357 forge-certification+full-text-search+guardrail-gate+runtime-primitives
                                                                                                   └── sdlc/anti-slop-99-draft-opentofu-junction-queue-rbac  #1358 opentofu+junction-federation+queue-clock+rbac-binding
                                                                                                    └── sdlc/anti-slop-100-draft-registry-reconcile-rollback-runaway  #1359 registry-guard+resourceactor-reconcile+rollback-compensation+runaway-remediation
                                                                                                     └── sdlc/anti-slop-101-draft-spend-flag-secretless-escape  #1360 runaway-spend+sdk-flag+secretless-config+static-key-escape
                                                                                                      └── sdlc/anti-slop-102-draft-token-adopt-champion-host  token-broker+adopt-in-place+champion-challenger+component-host
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
Layer 49: `pact-contract-harness` + `deterministic-replay-engine` + `hobo-policy-ir-contract` oxlint `--deny-warnings` clean (#1291).
Layer 50: `ifc-handler-trigger-hobo-608` + `s1-19-ctx-config-local-resolution` + `membrane-deadline-backpressure-contract` oxlint `--deny-warnings` clean (#1294).
Layer 51: `s1-15-bind-wiring-topology-contract` oxlint `--deny-warnings` clean (#1296).
Layer 52: `hobo-runtime-ts-primitives` + `multi-region-dr-replay-contract` oxlint `--deny-warnings` clean (#1297).
Layer 53: `raw-driver-escape-hatch-contract` + `hobo-contract-ir` + `runtime-postgres-ports` oxlint `--deny-warnings` clean (#1299).
Layer 54: `provider-cloudflare-contract` + `camp-mapping-sugar-compiler` oxlint `--deny-warnings` clean (#1301).
Layer 55: `resource-collection-engine-contract` + `s4-03-provider-azure-full-capability-manifest` oxlint `--deny-warnings` clean (#1303).
Layer 56: `ifc-handler-trigger-contract` + `actor-host-runtime-port-contract` + `data-paradigm-authoring-contract` oxlint `--deny-warnings` clean (#1305).
Layer 57: `s4-08-portability-conformance-lane-contract` + `s1-17-usage-permissions-coverage-poc` + `convex-swaghaus-deploy-adapter` oxlint `--deny-warnings` clean (#1307).
Layer 58: `s2-04-planner-deployment-plan-dag-poc` + `hobo-612-dev-local-loop-poc` + `closure-builder-resource-handles-contract` oxlint `--deny-warnings` clean (#1309).
Layer 59: `provider-azure-contract` + `provider-gcp-contract` + `provider-aws-contract` oxlint `--deny-warnings` clean (#1311).
Layer 60: `iac-cdktf-import-only-contract` + `cqrs-command-aggregate-contract` + `native-log-projection-contract` oxlint `--deny-warnings` clean (#1313).
Layer 61: `container-fallback-wiring-parity-contract` + `wrpc-link-layer-contract` + `s6-05-observability-drift-loop-contract` oxlint `--deny-warnings` clean (#1315).
Layer 62: `s5-03-forge-ingestion-contract` + `provider-aws-full-capability-catalog-contract` + `componentize-artifact-trust-contract` oxlint `--deny-warnings` clean (#1316).
Layer 63: `snapshot-compaction-contract` + `provider-kubernetes-contract` oxlint `--deny-warnings` clean (#1319).
Layer 64: `hobo-realize-emission-contract` + `hobo-auth-consumer-contract` + `document-projection-sink-contract` oxlint `--deny-warnings` clean (#1320).
Layer 65: `provider-authoring-contract` + `s1-stage-gate` + `s6-02-control-plane-ha-contract` oxlint `--deny-warnings` clean (#1321).
Layer 66: `meta-cloud-broker-artifact-contract` + `training-engine-port-contract` + `hobo-auth-authoring-surface` oxlint `--deny-warnings` clean (#1323).
Layer 67: `relational-projection-sink-contract` + `registry-capability-manifest-ingest-contract` + `bindles-api-freeze-contract` oxlint `--deny-warnings` clean (#1324).
Layer 68: `non-iac-driver-adapters-contract` + `hobo-mcp-server-contract` + `hobo-componentize` oxlint `--deny-warnings` clean (#1327).
Layer 69: `built-in-policy-engine-contract` + `planner-dag-skeleton-contract` + `policy-engine-provider-adapters-contract` oxlint `--deny-warnings` clean (#1328).
Layer 70: `eval-promotion-gate-contract` + `tier-four-overlay-mesh-contract` + `dispatcher-maximize-credits-contract` oxlint `--deny-warnings` clean (#1329).
Layer 71: `resource-definition-driver-contract` + `operator-integration-ports-contract` + `closure-builder-manifest-lowering-contract` oxlint `--deny-warnings` clean (#1330).
Layer 72: `slo-as-code-contract` + `control-plane-event-schema-contract` + `closure-builder-v1-finalization-contract` + `openinference-live-eval-stream-contract` oxlint `--deny-warnings` clean (#1331).
Layer 73: `vm-microvm-build-providers-contract` + `inbound-xaa-resource-server-contract` + `malicious-provider-containment-contract` + `policy-engine-port-contract` oxlint `--deny-warnings` clean (#1332).
Layer 74: `signed-offline-bundle-contract` + `contract-engine-port-contract` + `hobo-auth-federate-verify-contract` + `acme-dns01-cert-issuance-contract` oxlint `--deny-warnings` clean (#1333).
Layer 75: `connectivity-policy-enforcement-contract` + `tier-three-private-interconnect-contract` + `flag-event-contract` + `domain-validation-gate-contract` oxlint `--deny-warnings` clean (#1334).
Layer 76: `artifact-repo-port-contract` + `driver-dispatch-routing-contract` + `build-dagger-provider-contract` + `generation-certify-stage-contract` oxlint `--deny-warnings` clean (#1335).
Layer 77: `matching-engine-skeleton-contract` + `execution-host-provider-contract` + `projection-rebuild-contract` + `tier-two-cross-region-network-contract` oxlint `--deny-warnings` clean (#1336).
Layer 78: `local-dev-test-authoring-contract` + `closure-builder-public-api-contract` + `durable-agent-primitive-contract` + `hobo-manifest-contract` oxlint `--deny-warnings` clean (#1337).
Layer 79: `s0-04-protobuf-cue-codegen` + `observed-contract-promotion-contract` + `provider-capability-manifest-contract` + `capability-spec-contract` oxlint `--deny-warnings` clean (#1338).
Layer 80: `camp-eventstore-runtime-port-contract` + `internal-ca-private-acme-contract` + `observability-cost-guard-contract` + `session-revocation-contract` oxlint `--deny-warnings` clean (#1339).
Layer 81: `s5-02-wit-interface-conformance-coverage` + `budget-quota-policy-contract` + `generation-eval-methodology-spike` + `listing-lifecycle-yank-contract` oxlint `--deny-warnings` clean (#1340).
Layer 82: `runbook-contract` + `resource-pack-distribution-contract` + `auth-flag-readset-contract` + `identity-event-contract` oxlint `--deny-warnings` clean (#1341).
Layer 83: `bind-reference-wiring-contract` + `junction-federated-domain-contract` + `trace-context-propagation-contract` + `hobo-feature-flag-port` oxlint `--deny-warnings` clean (#1342).
Layer 84: `auth-port-rbac-resolution-contract` + `broker-environment-publication-contract` + `default-read-surface-contract` + `deployment-plan-ir-contract` oxlint `--deny-warnings` clean (#1343).
Layer 85: `hobo-core-contract` + `poison-event-quarantine-contract` + `provider-options-pattern-contract` + `registry-artifact-descriptor-contract` oxlint `--deny-warnings` clean (#1344).
Layer 86: `alertmanager-routing-contract` + `build-wasm-provider-contract` + `connector-authoring-contract` + `crew-event-contract` oxlint `--deny-warnings` clean (#1345).
Layer 87: `delivery-orchestrator-skeleton-contract` + `deployment-strategy-saga-templates-contract` + `dns-validation-rebinding-guard-contract` + `end-user-authorization-policy-contract` oxlint `--deny-warnings` clean (#1346).
Layer 88: `lifecycle-phase-policy-contract` + `live-evals-runtime-contract` + `metering-view-projection-contract` + `openfeature-provider-adapters-contract` oxlint `--deny-warnings` clean (#1347).
Layer 89: `otel-traces-pipeline-contract` + `remediation-safety-gate-contract` + `repo-view-escape-hatches-contract` + `wasi-interface-pins` oxlint `--deny-warnings` clean (#1348).
Layer 90: `x509-svid-mtls-contract` + `yard-domain-validation-contract` oxlint `--deny-warnings` clean (#1349).
Layer 91: `capability-negotiation-contract` + `conformance-port-suite-contract` + `control-plane-authz-cache-contract` + `domain-cutover-saga-contract` oxlint `--deny-warnings` clean (#1350).
Layer 92: `drift-detection-loop-contract` + `gateway-realization-contract` + `golden-suite-chaos-verification-contract` + `hobo-config-secret-schema-contract` oxlint `--deny-warnings` clean (#1351).
Layer 93: `hobo-remediation-action-contract` + `human-operator-console-contract` + `messaging-dapr-kafka` + `meta-cloud-broker-resolution-contract` oxlint `--deny-warnings` clean (#1352).
Layer 94: `mirror-digest-selection-contract` + `oci-artifact-storage-contract` + `paginated-query-contract` + `paradigm-idiom-packages-contract` oxlint `--deny-warnings` clean (#1353).
Layer 95: `provider-local-zero-infra` + `reactor-coalescing-fanout-contract` + `s3-07-agent-guardrails-contract` + `signed-artifact-publish-install-contract` oxlint `--deny-warnings` clean (#1354).
Layer 96: `tier-one-private-network-contract` + `upgrade-rollback-dry-run-contract` + `wit-port-stub-contract` + `yard-topology-manifest-contract` oxlint `--deny-warnings` clean (#1355).
Layer 97: `built-in-flag-store-contract` + `chaos-experiment-orchestration-contract` + `connectivity-tier-ir-contract` + `data-governance-policy-contract` oxlint `--deny-warnings` clean (#1356).
Layer 98: `forge-certification-loop-contract` + `full-text-search-contract` + `guardrail-policy-gate-contract` + `hobo-runtime-primitives` oxlint `--deny-warnings` clean (#1357).
Layer 99: `iac-opentofu-backend-contract` + `junction-registry-federation-contract` + `queue-clock-runtime-port-contract` + `rbac-role-binding-contract` oxlint `--deny-warnings` clean (#1358).
Layer 100: `registry-dependency-confusion-guard-contract` + `resourceactor-reconcile-loop-contract` + `rollback-failure-compensation-contract` + `runaway-remediation-guard-contract` oxlint `--deny-warnings` clean (#1359).
Layer 101: `runaway-spend-circuit-breaker-contract` + `sdk-flag-surface-contract` + `secretless-config-resolution-contract` + `static-key-escape-hatch-contract` oxlint `--deny-warnings` clean (#1360).
Layer 102: `token-broker-skeleton-contract` + `adopt-in-place-contract` + `champion-challenger-promotion-contract` + `component-host-adapter-certification-spike` oxlint `--deny-warnings` clean.
Next: remaining 7-count `src/draft/technical-proofs`, then lower counts, then exp-proofs, projects.
Full-repo `lint:slop --deny-warnings` is still red until those land.
GitHub stack metadata is at the 100-entry cap; later layers still open PRs via `gh stack submit --auto`.
