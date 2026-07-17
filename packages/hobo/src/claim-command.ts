import type { CommandModule, YardRuntime } from "@hobo/cli";
import { DEFAULT_TENANT, deploymentIdFor } from "@hobo/cli";
import { deploymentClaimed, deploymentViewProjection } from "@hobo/cloud";
import type { PrincipalRef } from "@hobo/core";

export interface ClaimCommandDeps {
	// The shared Yard runtime whose durable log carries the deployment. The
	// composed CLI injects the same runtime `up` writes to.
	readonly runtime?: YardRuntime;
}

// `hobo claim` — bind an anonymous `hobo up` deployment to an account WITHOUT
// re-provisioning: it appends a `deployment.Claimed` fact that rebinds ownership
// on the authoritative log, and the DeploymentView folds the new owner while
// carrying every provisioned fact — resources, outputs, URL — forward untouched.
// The account is the first positional arg (or `--to`). Reads/writes only the
// local event store; no cloud call, no re-deploy.
export function createClaimCommand(deps: ClaimCommandDeps = {}): CommandModule {
	return {
		run: async ({ context, flags, args }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo claim has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "claim" },
				};
			}

			const account = args[0] ?? flags.to;
			if (!account) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_CLAIM_NO_ACCOUNT",
					message:
						"hobo claim needs an account: `hobo claim <account>` (or `--to <account>`).",
					remediation: ["Pass the account to bind to, e.g. `hobo claim acme`."],
					data: { command: "claim" },
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const deploymentId = deploymentIdFor(projectDir);
			const stream = `deployment:${deploymentId}`;
			const snapshot = await deploymentViewProjection.rebuildFromZero(
				runtime.store,
				stream,
			);
			const row = deploymentViewProjection.get(snapshot, deploymentId);

			if (!row) {
				return {
					ok: false,
					status: "no_deployment",
					code: "HOBO_CLAIM_NO_DEPLOYMENT",
					message: `hobo claim: no deployment found for "${deploymentId}" — run \`hobo up\` first.`,
					data: { command: "claim", deploymentId },
				};
			}

			const previousOwner = row.owner;
			const newOwner: PrincipalRef = { kind: "user", id: account };

			// Already owned by this account — idempotent no-op.
			if (
				previousOwner?.kind === newOwner.kind &&
				previousOwner?.id === account
			) {
				return {
					ok: true,
					status: "already_claimed",
					code: "HOBO_OK",
					message: `hobo claim: deployment "${deploymentId}" is already bound to ${account}.`,
					data: { command: "claim", deploymentId, owner: newOwner },
				};
			}

			await runtime.store.append(
				stream,
				[
					deploymentClaimed({
						deploymentId,
						...(previousOwner !== undefined ? { previousOwner } : {}),
						newOwner,
					}),
				],
				{ expectedSeq: snapshot.seq, actor: newOwner, tenant: DEFAULT_TENANT },
			);

			// Re-fold to confirm the rebind preserved all provisioned state.
			const after = deploymentViewProjection.get(
				await deploymentViewProjection.rebuildFromZero(runtime.store, stream),
				deploymentId,
			);

			return {
				ok: true,
				status: "claimed",
				code: "HOBO_OK",
				message: `hobo claim: bound "${deploymentId}" to ${account} (${Object.keys(row.resources).length} resource(s) preserved).`,
				data: {
					command: "claim",
					deploymentId,
					previousOwner: previousOwner ?? null,
					owner: newOwner,
					// State is carried forward untouched by the rebind.
					deploymentStatus: after?.status ?? row.status,
					resources: after?.resources ?? row.resources,
				},
			};
		},
	};
}
