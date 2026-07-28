import { getNamedEndpoint, getNamedEndpointHost } from "@hobo/core";

/**
 * hobo-code registers on the dev tailnet at a deterministic named endpoint.
 * mosh is exploratory for resilient remote sessions (documented, not required).
 */

export interface CodeRemoteRegistration {
	readonly resource: string;
	readonly app: string;
	readonly host: string;
	readonly url: string;
	readonly mode: "local" | "overlay";
	readonly mosh: {
		readonly explored: true;
		readonly recommendedWhen: string;
		readonly notes: string;
	};
}

export function registerCodeNamedEndpoint(options: {
	readonly tenant?: string;
	readonly project?: string;
	readonly branch?: string;
	readonly env?: string;
	readonly mode?: "local" | "overlay";
}): CodeRemoteRegistration {
	const mode = options.mode ?? "local";
	const params = {
		resource: "code",
		app: "mux",
		mode,
		...(options.tenant !== undefined ? { tenant: options.tenant } : {}),
		...(options.project !== undefined ? { project: options.project } : {}),
		...(options.branch !== undefined ? { branch: options.branch } : {}),
		...(options.env !== undefined ? { env: options.env } : {}),
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
