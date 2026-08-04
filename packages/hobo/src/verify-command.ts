import type { CommandModule } from "@hobo/cli";
import { deploymentIdFor, loadProjectManifest } from "@hobo/cli";
import {
	type CostQuotaInput,
	createPermissiveDefaultPack,
	evaluateGatekeeper,
	type GatekeeperDecision,
	type PolicyPack,
	type ResidencyGateVerdict,
	type ResourcePlanRef,
} from "@hobo/contracts";
import { evaluateResidency, type ResidencyConstraint } from "@hobo/core";

export interface VerifyResidencyDeps {
	// The tenant's residency constraint (Tenant.residency, ADR-0146) — supplied
	// by whoever configured the tenant, never inferred.
	readonly constraint: ResidencyConstraint;
	// Region the plan would land in. `--region` on the CLI overrides this.
	readonly region?: string;
}

export interface VerifyCommandDeps {
	// Policy pack the Gatekeeper runs. Defaults to the permissive pack (records a
	// `policy.Decided` fact on every deploy without blocking — governed by
	// default). Inject a stricter pack to gate real changes; a test injects a
	// denying rule to prove explainable denial.
	readonly policyPack?: PolicyPack;
	// Resource-count budget the cost gate checks the plan against. Defaults to a
	// generous ceiling so the permissive lane allows; inject a low limit to
	// exercise the quota-exceeded denial.
	readonly costLimit?: number;
	// Residency dimension (ADR-0146). When present, verify evaluates the tenant
	// constraint against the plan region fail-closed and the Gatekeeper emits
	// gate:"residency" reasons on conflict. Absent = no constraint to evaluate.
	readonly residency?: VerifyResidencyDeps;
}

const DEFAULT_COST_LIMIT = 100;

// Map a parsed manifest's resources to the Gatekeeper's plan refs. A resource's
// `port` (kv/objectStore/…) is its channel; components without one contribute
// their `type` so every resource is represented in the plan.
function planRefs(
	resources: Record<string, { type: string; port?: string }>,
): ResourcePlanRef[] {
	return Object.entries(resources).map(([name, resource]) => ({
		name,
		port: resource.port ?? resource.type,
	}));
}

function remediationFor(decision: GatekeeperDecision): string[] {
	return decision.reasons.map(
		(reason) => `[${reason.gate}] ${reason.code}: ${reason.message}`,
	);
}

// `hobo verify` — run the unified Gatekeeper preflight over the project's Bindle
// BEFORE any deploy. It composes the four gates (contract compatibility, policy
// pack, obligations, cost/quota) into ONE explainable, machine-readable decision
// via the real `@hobo/contracts` engine — the same evaluation `hobo up` is
// governed by. It reads only the local manifest (no cloud call, no credential),
// so it is safe to run anywhere and answers "would this deploy be allowed, and
// if not, exactly why?" from the binary.
export function createVerifyCommand(
	deps: VerifyCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, emitProgress }) => {
			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const manifest = await loadProjectManifest(projectDir);
			if (!manifest) {
				return {
					ok: false,
					status: "no_bindle",
					code: "HOBO_NO_BINDLE",
					message:
						"hobo verify found no readable hobo.bindle.json — run from a Bindle project or `hobo collect` first.",
					remediation: [
						"Run `hobo verify` from a directory containing a valid hobo.bindle.json.",
					],
					data: { command: "verify" },
				};
			}

			const target = deploymentIdFor(projectDir);
			const refs = planRefs(manifest.value.resources);
			const costQuota: CostQuotaInput = {
				quota: "resources",
				used: 0,
				limit: deps.costLimit ?? DEFAULT_COST_LIMIT,
				requested: refs.length,
			};

			// Residency (ADR-0146): evaluate the tenant constraint against the plan
			// region fail-closed and hand Gatekeeper the precomputed verdict. The
			// classifications the constraint covers travel in the policy request
			// context so packs can also see them.
			const regionFlag =
				typeof flags.region === "string" ? flags.region : undefined;
			const planRegion = regionFlag ?? deps.residency?.region;
			let residency: ResidencyGateVerdict | undefined;
			if (deps.residency) {
				const evaluation = evaluateResidency({
					constraint: deps.residency.constraint,
					region: planRegion ?? "",
				});
				residency = evaluation.ok
					? { ok: true, reasons: [] }
					: {
							ok: false,
							reasons: [
								{
									code: evaluation.code,
									message: evaluation.remediation,
									region: evaluation.region,
									jurisdictions: evaluation.regionJurisdictions,
								},
							],
						};
			}

			const decision = evaluateGatekeeper({
				request: {
					subject: { kind: "user", id: "anonymous" },
					action: "deploy",
					resource: { kind: "bindle", id: target },
					phase: "plan",
					context: {
						target,
						...(planRegion !== undefined ? { region: planRegion } : {}),
						...(deps.residency !== undefined &&
						deps.residency.constraint.classifications.length > 0
							? {
									dataClassifications: [
										...deps.residency.constraint.classifications,
									],
								}
							: {}),
					},
				},
				deployedState: { contracts: [] },
				candidate: {
					plan: { objective: "deploy", resources: refs },
					contracts: [],
				},
				policyPack: deps.policyPack ?? createPermissiveDefaultPack(),
				...(residency !== undefined ? { residency } : {}),
				costQuota,
			});

			const deployable =
				decision.decision === "allow" || decision.decision === "allow-degraded";
			const remediation = remediationFor(decision);
			emitProgress(
				`gatekeeper: ${decision.decision} (${refs.length} resource(s) checked)`,
			);

			return {
				ok: deployable,
				status: decision.decision,
				code: deployable ? "HOBO_GATEKEEPER_ALLOW" : "HOBO_GATEKEEPER_DENY",
				message: deployable
					? `hobo verify: deploy allowed (${decision.decision})`
					: `hobo verify: deploy blocked (${decision.decision})`,
				...(remediation.length > 0 ? { remediation } : {}),
				data: {
					command: "verify",
					target,
					decision: decision.decision,
					reasons: decision.reasons,
					costQuota: decision.costQuota,
					canDeploy: {
						ok: decision.canDeploy.ok,
						summary: decision.canDeploy.summary,
					},
				},
			};
		},
	};
}
