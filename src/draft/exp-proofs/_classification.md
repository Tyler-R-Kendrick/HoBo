# Experience-proof classification manifest

> Drove the one-time reorganization of `src/draft/exp-proofs/` into experience-type subfolders
> (`dx` developer · `ux` user · `cx` customer · `ax` agent · `api` API/SDK surface), executed with
> `git mv` by a one-off migration script (`migrate-exp-proofs.ts`, retired from `scripts/` after
> the migration completed). Every package appears exactly once. After the move a
> package lives at `src/draft/exp-proofs/<type>/<slug>/`.
>
> **Classification rules.** Prefix defaults: `vibe-*`→ux · `dx-*`/`cli-*`→dx · `sdk-*`→api ·
> `beta-pilot-*`/`launch-support-*`/`support-*`/`customer-*`/`billing-*`/`incident-*`/`legal-privacy-*`/`launch-site-*`→cx.
> Audience rule for evidence/scope packages: customer-facing evidence→cx, operator/developer-facing→dx.
> Named rulings: ops journeys (`devops-*`/`sre-*`/`secops-*`)→dx · MCP surfaces→ax (MCP is the agent
> surface) · admin consoles/explorers→ux · docs/tutorials/troubleshooting→dx · marketplace UX→ux but
> publisher trust/payout→cx · domain-model/interface shape contracts→api.

| Type | Count |
|---|---|
| dx | 59 |
| ux | 37 |
| cx | 50 |
| ax | 3 |
| api | 10 |

## dx (59)

| Package | Rationale |
|---|---|
| `adr-0064-ui-generation-citation-contract` | design-governance citation audit (internal docs engineering) |
| `app-dev-journey-contract` | end-to-end app-developer journey |
| `artifact-store-scope-contract` | internal platform artifact-store operations |
| `backup-restore-launch-drill-contract` | operator drill evidence |
| `backup-restore-scope-contract` | operator backup/restore workflow |
| `bootstrap-installer-scope-contract` | installer developer experience |
| `bootstrap-launch-smoke-matrix-contract` | install smoke matrix (developer/operator) |
| `chaos-resilience-tests-scope-acceptance` | internal resilience-test infrastructure |
| `cli-cloud-yard-path` | CLI developer surface |
| `cli-deploy-transcript-prototype` | CLI developer surface |
| `cli-error-refusal-examples` | CLI developer surface |
| `cli-manage-inspect-logs-drift-prototype` | CLI developer surface |
| `cli-migration-transcript-prototype` | CLI developer surface |
| `dapr-parity-anchor-audit` | competitor-doc anchor audit (docs engineering) |
| `convex-swaghaus-bindle` | Convex swaghaus Bindle authoring DX (provider-neutral convexApp) |
| `data-flywheel-privacy-spike` | internal ML-ops privacy spike |
| `default-role-action-matrix-contract` | authorization-defaults model (internal security eng) |
| `devops-canary-rollout-journey-contract` | ruling: ops journeys are developer/operator experience |
| `devops-self-host-yard-journey-contract` | ruling: ops journeys are developer/operator experience |
| `docs-portal-scope-contract` | ruling: developer docs surface |
| `dogfood-yard-acceptance-contract` | internal dogfood, operator/dev-facing |
| `dogfood-yard-ga-handoff-evidence-contract` | internal dogfood, operator/dev-facing |
| `dogfood-yard-m1-evidence-contract` | internal dogfood, operator/dev-facing |
| `dogfood-yard-private-beta-evidence-contract` | internal dogfood, operator/dev-facing |
| `dogfood-yard-release-candidate-contract` | internal dogfood, operator/dev-facing |
| `drift-reconciliation-scope-contract` | operator drift workflow |
| `dx-backbone-resource-lifecycle-vibe` | dx-prefixed developer-experience proof |
| `dx-resource-lifecycle-fixture-corpus` | dx-prefixed developer-experience proof |
| `dx-resource-lifecycle-scenario-matrix` | dx-prefixed developer-experience proof |
| `dx-result-refusal-proof-envelopes` | dx-prefixed developer-experience proof |
| `dx-sdk-resilience-scope-contract` | dx-prefixed developer-experience proof |
| `e2e-test-matrix-scope-acceptance` | internal test-infrastructure evidence |
| `enterprise-deployment-hardening-scope-contract` | operator deployment hardening |
| `environment-lifecycle-scope` | developer/platform-eng environment workflow |
| `example-apps-scope-acceptance` | developer example apps |
| `gitops-ci-journey-contract` | GitOps/CI developer journey |
| `inline-budget-authoring` | inline budget authoring developer ergonomics |
| `intent-alignment-iter2` | gap-review iteration evidence (internal governance) |
| `launch-demo-golden-path-contract` | developer golden-path demo |
| `launch-performance-capacity-envelope-contract` | operator perf/capacity evidence |
| `org-catalogs-scope-acceptance` | platform-engineering catalogs |
| `package-cache-scope-contract` | internal platform package cache |
| `performance-load-tests-scope-contract` | internal perf-test infrastructure |
| `provenance-retention-scope-acceptance` | supply-chain engineering retention |
| `release-channels-scope` | developer-facing release-channel consumption |
| `resource-garbage-collection-scope-acceptance` | operator resource-GC workflow |
| `resource-lifecycle-quickstart-examples` | developer quickstart examples |
| `secops-policy-audit-journey-contract` | ruling: ops journeys are developer/operator experience |
| `security-verification-scope-acceptance` | internal security verification |
| `sre-drift-remediation-journey-contract` | ruling: ops journeys are developer/operator experience |
| `svid-cross-tenant-guard-contract` | security-engineering guard evidence |
| `teardown-recovery-scope-acceptance` | operator teardown/recovery workflow |
| `tenant-isolation-quotas-scope` | platform security/isolation engineering |
| `threat-model-security-review-scope-acceptance` | internal security-engineering review |
| `troubleshooting-guides-scope-acceptance` | ruling: developer troubleshooting guides |
| `tutorials-walkthroughs-scope-acceptance` | ruling: developer tutorials |
| `upgrade-test-suite-scope-contract` | internal upgrade-test infrastructure |
| `v1-critical-path-dependency-map-contract` | internal launch-engineering dependency map |
| `v1-e2e-persona-matrix-contract` | internal test persona matrix |

## ux (37)

| Package | Rationale |
|---|---|
| `accessibility-usability-launch-baseline-contract` | a11y/usability launch baseline is a UI quality bar |
| `admin-console-scope` | ruling: admin surfaces are user interfaces |
| `admin-support-breakglass-boundaries` | ruling: admin/support console boundary is a UI concern |
| `audit-explorer-scope-contract` | ruling: audit explorer is a UI surface |
| `deployment-dashboard-topology-scope-contract` | dashboard/topology UI surface |
| `full-dashboard-projection-views-contract` | dashboard projection views UI |
| `marketplace-ux-scope-contract` | explicitly a UX scope |
| `member-rbac-administration-scope` | RBAC administration UI workflow |
| `plan-diff-viewer-scope-acceptance` | plan-diff viewer UI |
| `publisher-portal-scope-contract` | publisher portal UI surface |
| `settings-project-lifecycle-scope` | settings UI workflow |
| `v1-readiness-dashboard-contract` | readiness dashboard is a UI surface |
| `vibe-accessibility-usability-checklist` | vibe UX checklist artifact |
| `vibe-clickable-first-run-walkthrough` | vibe first-run walkthrough UI |
| `vibe-dashboard-freshness-rbac-fixtures` | dashboard UI state fixtures |
| `vibe-deployment-dashboard-mockups` | dashboard mockups |
| `vibe-docs-portal-ia-states` | docs-portal information-architecture states |
| `vibe-first-customer-pilot-storyboard` | pilot UI storyboard |
| `vibe-first-run-activation-rail` | first-run activation UI rail |
| `vibe-launch-asset-refresh-plan` | launch visual-asset plan |
| `vibe-marketplace-discovery-prototype` | marketplace discovery UI prototype |
| `vibe-marketplace-installability-mockups` | marketplace install-flow mockups |
| `vibe-marketplace-trust-copy-states` | marketplace trust copy/UI states |
| `vibe-pilot-first-proof-walkthrough` | pilot walkthrough UI |
| `vibe-plan-annotation-pseudocode` | plan-annotation UI behavior sketch |
| `vibe-plan-diff-review-prototype` | plan-diff review UI prototype |
| `vibe-plan-review-states` | plan review UI states |
| `vibe-publisher-portal-review-mockups` | publisher portal review mockups |
| `vibe-representative-a11y-usability-checks` | representative a11y/usability checks |
| `vibe-role-tutorial-outlines` | role-based tutorial UI outlines |
| `vibe-snapshop-launch-demo-storyboard` | launch demo storyboard |
| `vibe-support-case-redacted-evidence` | support-case UI evidence states |
| `vibe-support-workflow-mockups` | support workflow mockups |
| `vibe-topology-status-prototype` | topology status UI prototype |
| `vibe-troubleshooting-decision-trees` | troubleshooting decision-tree UI |
| `vibe-workspace-project-states` | workspace/project UI states |
| `workspace-onboarding-scope-acceptance` | workspace onboarding UI flow |

## cx (50)

| Package | Rationale |
|---|---|
| `ai-generation-launch-posture-contract` | published customer-facing AI-generation posture |
| `beta-pilot-dogfood-alpha-evidence-contract` | pilot-program customer evidence |
| `beta-pilot-feedback-contract` | pilot feedback loop |
| `beta-pilot-ga-handoff-evidence-contract` | pilot-program customer evidence |
| `beta-pilot-release-candidate-evidence-contract` | pilot-program customer evidence |
| `billing-credits-scope-contract` | customer billing/credits |
| `billing-launch-policy-contract` | customer billing policy |
| `capability-review-approval-scope` | publisher review/approval workflow |
| `compatibility-matrix-scope-contract` | customer-facing compatibility statement |
| `compliance-evidence-pack-scope` | customer assurance evidence |
| `customer-assurance-evidence-packet-contract` | customer assurance evidence |
| `customer-onboarding-scope-acceptance` | customer onboarding |
| `customer-onboarding-script-contract` | customer onboarding script |
| `entitlements-plan-limits-scope` | plan tiers/limits customers purchase |
| `hosted-broker-ga-handoff-evidence-contract` | GA-handoff launch-evidence family |
| `incident-communications-scope-contract` | customer incident comms |
| `known-limitations-register-contract` | published limitations register |
| `launch-blocker-taxonomy-contract` | launch-program governance |
| `launch-messaging-claim-register` | public marketing claims |
| `launch-site-demo-alpha-evidence-contract` | public launch site |
| `launch-site-ga-handoff-evidence-contract` | public launch site |
| `launch-site-private-beta-evidence-contract` | public launch site |
| `launch-site-release-candidate-evidence-contract` | public launch site |
| `launch-support-dogfood-alpha-evidence` | customer support program |
| `launch-support-escalation-matrix` | customer support escalation |
| `launch-support-ga-handoff-evidence-contract` | customer support program |
| `launch-support-private-beta-evidence-contract` | customer support program |
| `launch-support-release-candidate-evidence-contract` | customer support program |
| `legal-privacy-ga-handoff-evidence-contract` | customer legal/privacy readiness |
| `legal-privacy-private-beta-evidence-contract` | customer legal/privacy readiness |
| `legal-privacy-release-candidate-evidence-contract` | customer legal/privacy readiness |
| `legal-privacy-terms-readiness-contract` | customer legal/privacy readiness |
| `marketplace-payout-hooks-scope-contract` | publisher commercial hooks |
| `marketplace-publisher-trust-evidence-contract` | ruling: publisher trust evidence is customer-facing |
| `pre-launch-outcome-contract` | launch-program outcome |
| `sbom-vulnerability-notice-evidence-contract` | customer security assurance |
| `support-debug-tools-scope-contract` | support-staff tooling serving customers |
| `support-sla-channels-contract` | customer SLA channels |
| `support-workflow-scope-contract` | customer support workflow |
| `tenant-data-lifecycle-contract` | customer data-rights lifecycle |
| `upgrade-migration-scope-contract` | customer upgrade/migration experience |
| `usage-metering-scope-contract` | customer metering/billing transparency |
| `v1-beta-pilot-private-beta-evidence` | pilot-program customer evidence |
| `v1-release-notes-dogfood-alpha-evidence` | release comms to customers |
| `v1-release-notes-private-beta-evidence-contract` | release comms to customers |
| `v1-release-notes-upgrade-guide-ga-handoff-evidence-contract` | release comms to customers |
| `v1-release-notes-upgrade-guide-release-candidate-evidence-contract` | release comms to customers |
| `v1-supported-platform-matrix-contract` | customer-facing platform support statement |
| `vulnerability-disclosure-launch-blocker-contract` | public disclosure program |
| `workspace-activation-telemetry-contract` | customer activation measurement |

## ax (3)

| Package | Rationale |
|---|---|
| `cli-mcp-parity-resource-lifecycle-contracts` | ruling: MCP parity is the agent surface |
| `rem-030-crew-mcp-autonomy-limitation` | Crew MCP autonomy limitation (agent surface) |
| `role-journey-cli-mcp-transcripts` | ruling: MCP role-journey transcripts are agent experience |

## api (10)

| Package | Rationale |
|---|---|
| `control-plane-api-resource-lifecycle-shapes` | control-plane API shapes |
| `meta-cloud-broker-rejection-matrix-contract` | broker API rejection semantics |
| `meta-cloud-broker-scope-contract` | broker authority API scope |
| `organization-workspace-model-contract` | org/workspace domain-model shapes |
| `per-app-tenant-routing-contract` | ruling: routing contract is an API surface |
| `policy-audit-export-contract` | audit export API surface |
| `sdk-object-graph-manifest-ir-shapes` | SDK object-graph/manifest IR shapes |
| `sdk-to-cli-golden-path` | ruling: SDK-to-CLI surface contract |
| `wrpc-wit-baseline-poc` | wRPC/WIT interface baseline |
| `xaa-scope-inference-contract` | ruling: XAA scope-inference API behavior |

