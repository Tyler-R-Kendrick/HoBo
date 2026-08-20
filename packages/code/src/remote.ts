import { getNamedEndpoint, getNamedEndpointHost } from "@hobo/core";

/**
 * hobo-code registers on the dev tailnet at a deterministic named endpoint.
 * mosh is exploratory for resilient remote sessions (documented, not required).
 *
 * Dev-terminal attach (tmux / cmux / mosh / Tailscale mental model):
 * `hobo-code attach` is the discoverable surface — not a control-plane admin verb.
 */

export type CodeRemoteMode = "local" | "overlay";

export interface CodeRemoteRegistration {
	readonly resource: string;
	readonly app: string;
	readonly host: string;
	readonly url: string;
	readonly mode: CodeRemoteMode;
	readonly mosh: {
		readonly explored: true;
		readonly recommendedWhen: string;
		readonly notes: string;
	};
}

/** How this maps to a power-user's preferred remote-terminal stack. */
export interface DevTerminalCompare {
	readonly tmux: string;
	readonly cmux: string;
	readonly mosh: string;
	readonly tailscale: string;
}

export interface DevTerminalAttach {
	readonly verb: "attach";
	readonly detachable: true;
	readonly reattach: string;
	readonly steps: readonly string[];
	readonly sshHint: string;
	readonly moshHint: string;
	readonly sessionLink: string;
}

export interface DevTerminalAttachSurface {
	readonly registration: CodeRemoteRegistration;
	readonly attach: DevTerminalAttach;
	readonly compare: DevTerminalCompare;
	/** Ultra-short human legend for panels. */
	readonly legend: string;
}

export function registerCodeNamedEndpoint(options: {
	readonly tenant?: string;
	readonly project?: string;
	readonly branch?: string;
	readonly env?: string;
	readonly mode?: CodeRemoteMode;
}): CodeRemoteRegistration {
	const mode = options.mode ?? "local";
	const params = {
		resource: "code",
		app: "mux",
		mode,
		...(options.tenant !== undefined ? { tenant: options.tenant } : undefined),
		...(options.project !== undefined
			? { project: options.project }
			: undefined),
		...(options.branch !== undefined ? { branch: options.branch } : undefined),
		...(options.env !== undefined ? { env: options.env } : undefined),
	} as const;

	const host = getNamedEndpointHost(params);
	const url = getNamedEndpoint(params);

	return {
		resource: "code",
		app: "mux",
		host,
		url,
		mode,
		mosh: {
			explored: true,
			recommendedWhen:
				"lossy mobile / SSH-from-phone sessions that need UDP roaming",
			notes:
				"mosh is optional resilience on top of the named endpoint; primary remote path remains tailnet + deterministic DNS (ADR-0130). Prefer mosh only when TCP SSH detach/reattach is insufficient.",
		},
	};
}

/**
 * Full attach surface for CLI human + JSON (tmux-like reattach story).
 */
export function describeDevTerminalAttach(options: {
	readonly tenant?: string;
	readonly project?: string;
	readonly branch?: string;
	readonly env?: string;
	readonly mode?: CodeRemoteMode;
	readonly stationId?: string;
}): DevTerminalAttachSurface {
	const registration = registerCodeNamedEndpoint({
		mode: options.mode ?? "local",
		...(options.tenant !== undefined ? { tenant: options.tenant } : undefined),
		...(options.project !== undefined
			? { project: options.project }
			: undefined),
		...(options.branch !== undefined ? { branch: options.branch } : undefined),
		...(options.env !== undefined ? { env: options.env } : undefined),
	});
	const host = registration.host;
	const mode = registration.mode;
	const attach: DevTerminalAttach = {
		verb: "attach",
		detachable: true,
		reattach:
			"Re-run hobo-code attach (or hobo-code session) after SSH drop; durable handback lives under $HOBO_HOME.",
		steps: [
			mode === "overlay"
				? "Ensure Tailscale/overlay is up so the named host resolves"
				: "Local mode: host resolves on this machine (.hobo.localhost)",
			`Reach named endpoint · ${host}`,
			"On the box: hobo-code session (or keep prior isolate run open)",
			"After disconnect: hobo-code attach again (tmux-style reattach)",
			"Lossy link: mosh user@host when TCP SSH thrash is painful",
		],
		sshHint: `ssh <user>@${host.replace(/\.hobo\.localhost$/, "").replace(/\.hobo\.test$/, "")}`,
		moshHint: registration.mosh.recommendedWhen,
		sessionLink: "hobo-code session --json → remote + persistence",
	};
	const compare: DevTerminalCompare = {
		tmux: "in-session ≈ hobo-code chat first, Agents hold claimed tasks under each subagent; attach ≈ optional tmux attach after disconnect; handback under $HOBO_HOME",
		cmux: "status/session panes ≈ concurrent mux focus; Herdr theme is the in-process mux",
		mosh: "optional UDP roaming on lossy mobile; not required for local or stable TCP",
		tailscale:
			"mode=overlay uses named endpoint on the tailnet (ADR-0130); local mode needs no overlay",
	};
	return {
		registration,
		attach,
		compare,
		legend:
			mode === "overlay"
				? "attach · overlay · mosh?"
				: "attach · local · detach",
	};
}

/** Short host for human scan lines (drop product DNS suffix). */
export function shortNamedHost(host: string): string {
	return host.replace(/\.hobo\.localhost$/, "").replace(/\.hobo\.test$/, "");
}
