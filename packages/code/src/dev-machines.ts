/**
 * Dev machines, declared in devenv and reached through the Station.
 *
 * A remote pane used to be `ssh -t <whatever the user typed>`: an arbitrary
 * host, an ambient key on disk, and no record that the session happened. That
 * is the opposite of how the rest of HoBo treats privileged access, and it
 * means a remote agent pane is the least governed thing in the product.
 *
 * A dev machine is instead *declared* — in `devenv.machines.json` beside the
 * devenv files, so the set of hosts an agent can reach is reviewable in the
 * same place as the toolchain — resolved on the tailnet by its named endpoint,
 * and brokered through the Station's privileged-access gateway, which applies
 * the target's isolation-class policy, serves a lease-bound SSH-agent proxy,
 * and writes each authorization, redemption, and terminal event to Yard audit.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// public-contract: declared dev-machine registry file.
export const DEV_MACHINES_FILE = "devenv.machines.json";

// public-contract: registry schema.
export const DEV_MACHINES_SCHEMA = "hobo.code.dev-machines/v1" as const;

/** Isolation classes a dev machine may declare, mirroring @hobo/connectivity. */
export const DEV_MACHINE_CLASSES = [
	"local-dev",
	"development",
	"staging",
	"production",
	"ephemeral",
] as const;

export type DevMachineClass = (typeof DEV_MACHINE_CLASSES)[number];

// domain-view: wire form is hobo.code.v1.DevMachine; src/dev-machines-wire.ts converts.
export interface DevMachine {
	/** Stable id used as the tmux window name and the PAM target id. */
	readonly id: string;
	/** Tailnet hostname (MagicDNS) or a HoBo named endpoint. */
	readonly host: string;
	/** SSH user, when it differs from the local one. */
	readonly user?: string;
	readonly isolationClass: DevMachineClass;
	/** Which agents may be placed here; empty means any. */
	readonly agents?: readonly string[];
	/** Free-text note shown in `hobo-code machines`. */
	readonly note?: string;
}

export interface DevMachineRegistry {
	readonly schemaVersion: typeof DEV_MACHINES_SCHEMA;
	readonly machines: readonly DevMachine[];
}

export interface DevMachineProblem {
	readonly machine: string;
	readonly problem: string;
}

export interface LoadedDevMachines {
	readonly path: string;
	readonly declared: boolean;
	readonly machines: readonly DevMachine[];
	/** Entries that were rejected, and why — never silently dropped. */
	readonly rejected: readonly DevMachineProblem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse one entry into a `DevMachine`, or say why it cannot be one.
 *
 * Parse, don't validate: everything downstream — the tmux window name, the PAM
 * target id, the ssh destination — takes a `DevMachine`, so a malformed entry
 * cannot reach any of them. The id and host are the security-relevant fields:
 * both end up in a command line, so both are allowlisted rather than merely
 * checked for emptiness.
 */
export function parseDevMachine(
	value: unknown,
	index: number,
): { machine: DevMachine } | { problem: DevMachineProblem } {
	const where = `machines[${index}]`;
	if (!isRecord(value)) {
		return { problem: { machine: where, problem: "entry is not an object" } };
	}
	const id = typeof value.id === "string" ? value.id.trim() : "";
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) {
		return {
			problem: {
				machine: id || where,
				problem:
					"id must start with a letter or digit and contain only letters, digits, '.', '_' or '-'",
			},
		};
	}
	const host = typeof value.host === "string" ? value.host.trim() : "";
	// Hostnames only: an ssh destination is a command-line argument, and a
	// host containing a space, quote or `$` is a way to smuggle one.
	if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(host)) {
		return {
			problem: { machine: id, problem: `host "${host}" is not a hostname` },
		};
	}
	const user = typeof value.user === "string" ? value.user.trim() : undefined;
	if (user !== undefined && !/^[A-Za-z0-9._-]+$/u.test(user)) {
		return {
			problem: { machine: id, problem: `user "${user}" is not a username` },
		};
	}
	const isolationClass = value.isolationClass;
	if (
		typeof isolationClass !== "string" ||
		!(DEV_MACHINE_CLASSES as readonly string[]).includes(isolationClass)
	) {
		return {
			problem: {
				machine: id,
				problem: `isolationClass must be one of ${DEV_MACHINE_CLASSES.join(", ")}`,
			},
		};
	}
	const agents = Array.isArray(value.agents)
		? value.agents.filter((a): a is string => typeof a === "string")
		: undefined;
	const note = typeof value.note === "string" ? value.note : undefined;
	return {
		machine: {
			id,
			host,
			isolationClass: isolationClass as DevMachineClass,
			...(user !== undefined ? { user } : {}),
			...(agents !== undefined ? { agents } : {}),
			...(note !== undefined ? { note } : {}),
		},
	};
}

/** Read the declared registry beside the devenv files. */
export function loadDevMachines(
	packageRoot: string,
	read: (path: string) => string = (p) => readFileSync(p, "utf8"),
	exists: (path: string) => boolean = existsSync,
): LoadedDevMachines {
	const path = join(packageRoot, DEV_MACHINES_FILE);
	if (!exists(path)) {
		return { path, declared: false, machines: [], rejected: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(read(path));
	} catch (error) {
		return {
			path,
			declared: true,
			machines: [],
			rejected: [
				{ machine: DEV_MACHINES_FILE, problem: `unreadable: ${String(error)}` },
			],
		};
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.machines)) {
		return {
			path,
			declared: true,
			machines: [],
			rejected: [{ machine: DEV_MACHINES_FILE, problem: "no machines array" }],
		};
	}
	const machines: DevMachine[] = [];
	const rejected: DevMachineProblem[] = [];
	const seen = new Set<string>();
	for (const [index, entry] of parsed.machines.entries()) {
		const result = parseDevMachine(entry, index);
		if ("problem" in result) {
			rejected.push(result.problem);
			continue;
		}
		if (seen.has(result.machine.id)) {
			rejected.push({
				machine: result.machine.id,
				problem: "duplicate id — a pane name must identify one machine",
			});
			continue;
		}
		seen.add(result.machine.id);
		machines.push(result.machine);
	}
	return { path, declared: true, machines, rejected };
}

/**
 * Resolve a `--host` argument to exactly one declared machine.
 *
 * Ids win over hosts, and unambiguously. Matching `id === x || host === x` in a
 * single pass let an *earlier* entry's host beat a *later* entry's exact id:
 * with `[{id:"jump", host:"dev-box"}, {id:"dev-box", …}]`, `--host dev-box`
 * selected `jump` — the operator named one machine and got another, as another
 * user, under another isolation class. Duplicate ids were already rejected;
 * this closes the same hole across the two namespaces.
 */
export function resolveMachine(
	machines: readonly DevMachine[],
	requested: string,
):
	| { readonly machine: DevMachine }
	| { readonly ambiguous: readonly DevMachine[] }
	| null {
	const byId = machines.find((m) => m.id === requested);
	if (byId) return { machine: byId };
	const byHost = machines.filter((m) => m.host === requested);
	if (byHost.length === 1) return { machine: byHost[0] as DevMachine };
	// Two machines sharing a host is a declaration the operator has to settle;
	// picking one silently is how the wrong session gets brokered.
	if (byHost.length > 1) return { ambiguous: byHost };
	return null;
}

/** Machines that may host a given agent. */
export function machinesForAgent(
	machines: readonly DevMachine[],
	agentId: string,
): readonly DevMachine[] {
	return machines.filter(
		(m) =>
			m.agents === undefined ||
			m.agents.length === 0 ||
			m.agents.includes(agentId),
	);
}

/** The ssh destination for a machine — user@host, or bare host. */
export function sshDestination(machine: DevMachine): string {
	return machine.user ? `${machine.user}@${machine.host}` : machine.host;
}

/**
 * The PAM target a machine registers as.
 *
 * Shaped for `@hobo/stations`' `registerTarget`, so a declared machine and a
 * brokered session are the same object rather than two parallel notions of
 * "which host".
 */
export function pamTarget(machine: DevMachine): {
	readonly id: string;
	readonly kind: "ssh";
	readonly isolationClass: DevMachineClass;
	readonly address: string;
} {
	return {
		id: `ssh:${machine.id}`,
		kind: "ssh",
		isolationClass: machine.isolationClass,
		address: sshDestination(machine),
	};
}
