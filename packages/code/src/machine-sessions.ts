/**
 * Remote panes go through the Station, not straight to ssh.
 *
 * `hobo-code mux --host box` used to hand tmux a raw `ssh -t box <agent>`,
 * which works only because a long-lived key happens to sit in `~/.ssh`. That
 * key is ambient authority: it is not scoped to the agent, not time-bounded,
 * and its use leaves no trace in the Station's audit log even though every
 * other privileged path in HoBo is brokered.
 *
 * A pane now asks the Station's privileged-access gateway for a session
 * against a *declared* machine (see `dev-machines.ts`). The gateway applies the
 * target's isolation-class policy and writes `pam.SessionStarted` /
 * `pam.SessionDenied`. A pane the Station did not authorise is refused rather
 * than quietly falling back to the ambient key — a fallback that silently
 * downgrades governance is worse than a clear failure.
 *
 * **Read this before trusting the name of this module.** What is finished is
 * the *decision*: policy applied per isolation class, a session recorded, an
 * audit event written, and an unauthorised pane refused. What is not finished
 * is the credential path — see `brokeredSshCommand` — so a remote pane still
 * authenticates with its own key today.
 */

import { createNativePamGateway } from "@hobo/stations";

import type { DevMachine } from "./dev-machines.js";
import { pamTarget, sshDestination } from "./dev-machines.js";

/** The slice of `@hobo/stations`' gateway a pane actually needs. */
export interface PaneSessionBroker {
	registerTarget(target: {
		readonly id: string;
		readonly kind: "ssh";
		readonly isolationClass: string;
		readonly address: string;
	}): void;
	brokerSession(request: {
		readonly subject: string;
		readonly target: string;
		readonly preferSecretless: true;
		readonly ttlSeconds?: number;
		readonly reason?: string;
	}): Promise<{
		readonly sessionId: string;
		readonly expiresAt: string;
		readonly credentialRef: string;
		readonly protocol: string;
	}>;
}

export interface BrokeredPane {
	readonly machine: DevMachine;
	readonly agentId: string;
	readonly sessionId: string;
	readonly expiresAt: string;
	readonly credentialRef: string;
	readonly protocol: string;
	readonly destination: string;
}

export interface BrokerFailure {
	readonly machine: DevMachine;
	readonly agentId: string;
	readonly reason: string;
}

export type BrokerOutcome =
	| { readonly ok: true; readonly pane: BrokeredPane }
	| { readonly ok: false; readonly failure: BrokerFailure };

export interface BrokerOptions {
	readonly broker: PaneSessionBroker;
	readonly subject: string;
	/** Session lifetime; a pane that outlives it must renew, not linger. */
	readonly ttlSeconds?: number;
}

/**
 * Broker one pane's session.
 *
 * Registering the target every time is deliberate: the declared registry is
 * the source of truth for address and isolation class, and a gateway that
 * learned a stale address at start-up would broker against the wrong host.
 */
export async function brokerPaneSession(
	machine: DevMachine,
	agentId: string,
	options: BrokerOptions,
): Promise<BrokerOutcome> {
	const target = pamTarget(machine);
	try {
		options.broker.registerTarget(target);
		const handle = await options.broker.brokerSession({
			subject: options.subject,
			target: target.id,
			preferSecretless: true,
			...(options.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
			reason: `hobo-code pane for agent ${agentId}`,
		});
		return {
			ok: true,
			pane: {
				machine,
				agentId,
				sessionId: handle.sessionId,
				expiresAt: handle.expiresAt,
				credentialRef: handle.credentialRef,
				protocol: handle.protocol,
				destination: sshDestination(machine),
			},
		};
	} catch (error) {
		// A denial is an answer, not an error to paper over: the operator needs
		// to see which machine refused and why.
		return {
			ok: false,
			failure: {
				machine,
				agentId,
				reason: error instanceof Error ? error.message : String(error),
			},
		};
	}
}

/**
 * The ssh invocation for a brokered pane.
 *
 * The credential *reference* is passed, never the session token: the token is
 * short-lived material that must not reach a process table, a tmux pane title,
 * or a shell history file.
 *
 * **Resolution is not implemented yet.** `IdentityAgent=tokenref://…` names an
 * agent socket that nothing currently serves, and `openStationGateway` stops
 * the in-process gateway as soon as brokering finishes, so a pane cannot
 * redeem the reference. What works today is the *decision* — policy applied per
 * isolation class, a session recorded, an audit event written — and the fact
 * that a pane without one is refused. What does not work is authenticating the
 * ssh connection from it; that needs a resident agent serving `tokenref://`,
 * and until then a remote pane still needs its own key to actually connect.
 * Said here rather than left implied, because "brokered, not ambient" reads as
 * a completed claim.
 */
export function brokeredSshCommand(
	pane: BrokeredPane,
	command: string,
): string {
	const quote = (v: string) => `'${v.replace(/'/gu, `'\\''`)}'`;
	// -o so the reference travels as configuration rather than as an argument
	// that shows up in `ps` on the remote.
	return [
		"ssh",
		"-t",
		"-o",
		quote(`IdentityAgent=${pane.credentialRef}`),
		quote(pane.destination),
		quote(command),
	].join(" ");
}

/** Human line for the mux panel — never includes session material. */
export function describePane(pane: BrokeredPane): string {
	return `${pane.agentId} · ${pane.machine.id} (${pane.machine.isolationClass}) · session ${pane.sessionId} until ${pane.expiresAt}`;
}

export interface StationBrokerContext {
	readonly stationId: string;
	readonly tenant: string;
	readonly isolationClass: string;
	readonly trustDomain?: string;
}

export interface OpenedGateway {
	readonly broker: PaneSessionBroker;
	/** Audit events produced so far — session refs only, never material. */
	auditTypes(): readonly string[];
	close(): Promise<void>;
}

/**
 * Start the Station's native gateway for the life of a mux invocation.
 *
 * Native rather than a remote control plane: a local Station is the normal
 * dogfooding case, and requiring Teleport/Boundary to be reachable before an
 * agent pane can open would push people straight back to the ambient key this
 * replaces.
 */
export async function openStationGateway(
	context: StationBrokerContext,
): Promise<OpenedGateway> {
	const gateway = createNativePamGateway({
		isolationClass: context.isolationClass as never,
	});
	await gateway.start({
		stationId: context.stationId,
		tenant: context.tenant,
		isolationClass: context.isolationClass as never,
		trustDomain: context.trustDomain ?? "local",
	});
	return {
		broker: gateway as unknown as PaneSessionBroker,
		auditTypes: () => gateway.auditEvents.map((e) => e.type),
		close: () => gateway.stop(),
	};
}

/** Broker one session per pane, keeping failures alongside successes. */
export async function brokerPanes(
	placements: readonly { machine: DevMachine; agentId: string }[],
	options: BrokerOptions,
): Promise<{
	readonly panes: readonly BrokeredPane[];
	readonly failures: readonly BrokerFailure[];
}> {
	const panes: BrokeredPane[] = [];
	const failures: BrokerFailure[] = [];
	for (const { machine, agentId } of placements) {
		const outcome = await brokerPaneSession(machine, agentId, options);
		if (outcome.ok) panes.push(outcome.pane);
		else failures.push(outcome.failure);
	}
	return { panes, failures };
}
