/**
 * `hobo incident` — observe CD failure disposition (A2H / self-heal).
 * Subcommands: status | open
 * Drives shipped ContinuousDeliveryPlane failure path.
 */
import type { CommandModule } from "@hobo/cli";
import {
	type ContinuousDeliveryPlane,
	createContinuousDeliveryPlane,
	createContractAssertedCdFixtures,
	createDefaultSafetyEnvelope,
	type LocalCdFixtures,
} from "@hobo/cloud";
import { must } from "@hobo/core/total-access";

export interface IncidentCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly plane?: ContinuousDeliveryPlane;
	readonly fixtures?: LocalCdFixtures;
}

const SUBS = ["status", "open"] as const;

export function createIncidentCommand(
	deps: IncidentCommandDeps = {},
): CommandModule {
	return {
		run: async ({ args, flags, emitProgress }) => {
			const f = flags as Record<string, unknown>;
			const tenant =
				(typeof f.tenant === "string" && f.tenant) ||
				deps.env?.HOBO_TENANT ||
				"local";
			const fixtures =
				deps.fixtures ?? createContractAssertedCdFixtures({ tenant });
			const plane =
				deps.plane ?? createContinuousDeliveryPlane({ mode: "simulate" });
			const sub = (args[0] ?? "status") as string;

			if (!(SUBS as readonly string[]).includes(sub)) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_INCIDENT_USAGE",
					message: `hobo incident: unknown subcommand "${sub}"`,
					remediation: [
						"hobo incident status",
						"hobo incident open --signal slo-burn",
						"hobo incident open --signal apply-failed --self-heal",
					],
					data: { command: "incident", subcommands: [...SUBS] },
				};
			}

			if (sub === "status") {
				const last = plane.lastResult();
				const active = last?.failure !== undefined;
				return {
					ok: true,
					status: "ok",
					code: "HOBO_INCIDENT_STATUS",
					message: active
						? `incident: active ${must(last!.failure).kind} ${must(last!.failure).incidentId}`
						: "incident: no active CD incident",
					data: {
						command: "incident",
						subcommand: "status",
						active,
						...(active
							? {
									kind: must(last!.failure).kind,
									incidentId: must(last!.failure).incidentId,
								}
							: {}),
						defaultPath: "a2h",
						selfHealRequires: [
							"registered-agent",
							"policy-allow",
							"safety-envelope",
							"adr-0076-lane",
						],
					},
				};
			}

			const signal = (typeof f.signal === "string" && f.signal) || "slo-burn";
			const withSelfHeal =
				f["self-heal"] === true ||
				f.selfHeal === true ||
				f["self-heal"] === "true" ||
				f.selfHeal === "true";
			emitProgress(`incident open signal=${signal}`);
			const result = await plane.deliver(fixtures.set, {
				forceFailure:
					signal === "apply-failed"
						? "apply-failed"
						: signal === "golden-failed"
							? "golden-failed"
							: signal === "progressive-rollback"
								? "progressive-rollback"
								: "slo-burn",
				envelope: createDefaultSafetyEnvelope({
					blastRadius: withSelfHeal ? "resource" : "unknown",
					reversible: true,
					selfCausation: false,
					estimatedSpendUsd: 1,
					spendCapUsd: 50,
				}),
				...(withSelfHeal
					? {
							selfHealAgent: {
								agentId: "agent:local-sre",
								tenant: fixtures.set.tenant,
								scopes: Object.freeze([
									fixtures.set.environment,
									"local-dev",
									"local",
								]),
								policyAllowed: true,
							},
							attemptFixInLane: (lane) => {
								if (lane.baselineMutation !== false) {
									return {
										ok: false,
										summary: "baseline mutation forbidden",
									};
								}
								return { ok: true, summary: "lane fix proposed" };
							},
						}
					: {}),
			});

			return {
				ok: true,
				status: "ok",
				code: "HOBO_INCIDENT_OPEN",
				message: `incident: ${result.failure?.kind ?? "none"}`,
				data: {
					command: "incident",
					subcommand: "open",
					status: result.status,
					failureKind: result.failure?.kind,
					incidentId: result.failure?.incidentId,
					deploymentId: result.apply.deploymentId,
					attested: result.apply.principal.attestationState,
					secretFree: result.apply.secretFree,
					...(result.failure?.kind === "a2h"
						? {
								handoff: {
									obligationId: result.failure.handoff.obligationId,
									deadline: result.failure.handoff.deadline,
									decisionRequired: result.failure.handoff.decisionRequired,
								},
							}
						: {}),
					...(result.failure?.kind === "self-heal-lane"
						? {
								laneId: result.failure.lane.laneId,
								baselineMutation: result.failure.lane.baselineMutation,
								proposedDelta: result.failure.attempt.proposedDelta?.deltaId,
								promotionPath:
									result.failure.attempt.proposedDelta?.promotionPath,
							}
						: {}),
				},
			};
		},
	};
}
