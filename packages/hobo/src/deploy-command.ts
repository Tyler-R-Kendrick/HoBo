/**
 * `hobo deploy` — continuous delivery observe / rollback (attested apply plane).
 * Subcommands: status | logs | rollback
 * Always drives the shipped ContinuousDeliveryPlane (not placeholder strings).
 */
import type { CommandModule } from "@hobo/cli";
import {
	assertSecretFree,
	type ContinuousDeliveryPlane,
	createContinuousDeliveryPlane,
	createContractAssertedCdFixtures,
	type LocalCdFixtures,
} from "@hobo/cloud";

export interface DeployCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	/** Inject plane for tests; default is simulate offline equip. */
	readonly plane?: ContinuousDeliveryPlane;
	readonly fixtures?: LocalCdFixtures;
}

const SUBS = ["status", "logs", "rollback"] as const;

export function createDeployCommand(
	deps: DeployCommandDeps = {},
): CommandModule {
	return {
		run: async ({ args, flags, emitProgress }) => {
			const f = flags as Record<string, unknown>;
			const tenant =
				(typeof f.tenant === "string" && f.tenant) ||
				deps.env?.HOBO_TENANT ||
				"local";
			const fixtures =
				deps.fixtures ??
				createContractAssertedCdFixtures({
					tenant,
					environment: (typeof f.env === "string" && f.env) || "local-dev",
				});
			const plane =
				deps.plane ?? createContinuousDeliveryPlane({ mode: "simulate" });
			const sub = (args[0] ?? "status") as string;

			if (!(SUBS as readonly string[]).includes(sub)) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_DEPLOY_USAGE",
					message: `hobo deploy: unknown subcommand "${sub}"`,
					remediation: [
						"hobo deploy status",
						"hobo deploy logs",
						"hobo deploy rollback --reason <text>",
					],
					data: { command: "deploy", subcommands: [...SUBS] },
				};
			}

			// Ensure there is a real deliver result for status/logs on the local path.
			let last = plane.lastResult();
			if (!last || sub === "status") {
				last = await plane.deliver(fixtures.set, {
					deploymentId:
						(typeof f.deployment === "string" && f.deployment) ||
						last?.apply.deploymentId ||
						`dep_cli_${tenant}`,
				});
			}

			if (sub === "status") {
				emitProgress(`deploy status deployment=${last.apply.deploymentId}`);
				const statuses = await plane.status(
					fixtures.set,
					last.apply.deploymentId,
				);
				for (const s of statuses) assertSecretFree(s);
				assertSecretFree({
					steps: last.apply.steps.map((st) => st.status.outputs),
				});
				return {
					ok: true,
					status: "ok",
					code: "HOBO_DEPLOY_STATUS",
					message: `deploy status: ${statuses.length} resource(s) secret-free; plane=${last.status}`,
					data: {
						command: "deploy",
						subcommand: "status",
						setId: fixtures.set.setId,
						deploymentId: last.apply.deploymentId,
						gatekeeper: fixtures.set.gatekeeper.decision,
						planeStatus: last.status,
						attestation: last.apply.principal.attestationState,
						mode: last.apply.mode,
						ambientCredentials: false,
						activeCredentialsAfter: last.apply.activeCredentialsAfter,
						secretFree: last.apply.secretFree,
						progressive: last.progressive
							? {
									status: last.progressive.status,
									percent: last.progressive.percent,
									gatewayWeightPercent: last.progressive.gatewayWeightPercent,
									flagPercent: last.progressive.flagPercent,
									flagKillSwitch: last.progressive.flagKillSwitch,
								}
							: null,
						resources: statuses.map((s) => ({
							resourceId: s.resourceId,
							state: s.state,
							secretFree: s.secretFree,
							secretRefs: s.secretRefs,
						})),
						attestedApply: true,
					},
				};
			}

			if (sub === "logs") {
				const events = plane.logs(last.apply.deploymentId);
				const lines =
					last.logLines.length > 0
						? last.logLines
						: events.map((e) =>
								`${e.time} ${e.type} ${JSON.stringify(e.data)}`.slice(0, 500),
							);
				for (const line of lines) {
					// Ensure no plaintext secret patterns leak into CLI logs.
					if (/(?:AKIA[0-9A-Z]{16}|password=|apiToken":\s*"[^s])/i.test(line)) {
						return {
							ok: false,
							status: "secret_leak",
							code: "HOBO_DEPLOY_LOGS_SECRET",
							message: "deploy logs failed secret-free check",
							data: { command: "deploy", subcommand: "logs" },
						};
					}
				}
				return {
					ok: true,
					status: "ok",
					code: "HOBO_DEPLOY_LOGS",
					message: `deploy logs: ${lines.length} line(s) secret-free`,
					data: {
						command: "deploy",
						subcommand: "logs",
						deploymentId: last.apply.deploymentId,
						lines,
						eventCount: events.length,
						secretFree: true,
					},
				};
			}

			// rollback — zeros progressive exposure then A2H disposition
			const reason =
				(typeof f.reason === "string" && f.reason) || "operator-requested";
			const rolled = await plane.rollback(
				fixtures.set,
				last.apply.deploymentId,
				reason,
			);
			emitProgress(
				`deploy rollback → ${rolled.disposition.kind} flag%=${rolled.progressive.flagPercent} gateway%=${rolled.progressive.gatewayWeightPercent}`,
			);
			return {
				ok: true,
				status: "ok",
				code: "HOBO_DEPLOY_ROLLBACK",
				message: `deploy rollback: ${rolled.disposition.kind}`,
				data: {
					command: "deploy",
					subcommand: "rollback",
					deploymentId: last.apply.deploymentId,
					disposition: rolled.disposition.kind,
					incidentId: rolled.disposition.incidentId,
					progressive: {
						flagPercent: rolled.progressive.flagPercent,
						gatewayWeightPercent: rolled.progressive.gatewayWeightPercent,
						flagKillSwitch: rolled.progressive.flagKillSwitch,
						status: rolled.progressive.status,
					},
					...(rolled.disposition.kind === "a2h"
						? {
								obligationId: rolled.disposition.handoff.obligationId,
								deadline: rolled.disposition.handoff.deadline,
							}
						: {}),
				},
			};
		},
	};
}
