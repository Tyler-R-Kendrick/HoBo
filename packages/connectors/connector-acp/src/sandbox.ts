// The Executor sandbox posture every spawned agent subprocess must run
// under (s3-07 guardrails): NO ambient credentials, workspace-scoped
// filesystem, allowlisted network. Vendor adapters pass this record to the
// spawn; the parse boundary fails closed on anything looser.

// public-contract: the sandbox posture document schema id.
export const SANDBOX_POSTURE_SCHEMA = "hobo.agent-sandbox-posture/v1";

export interface AgentSandboxPosture {
	readonly schema: typeof SANDBOX_POSTURE_SCHEMA;
	readonly ambientCredentials: false;
	readonly filesystem: { readonly scope: "workspace"; readonly root: string };
	readonly network: {
		readonly scope: "allowlist";
		readonly allowlist: readonly string[];
	};
	// Environment variables allowed through to the subprocess (everything
	// else is scrubbed — no inherited cloud credentials).
	readonly envAllowlist: readonly string[];
}

/**
 * Parse-don't-validate boundary for sandbox postures: an untrusted posture
 * document becomes a frozen derived posture or throws. `ambientCredentials`
 * must be exactly `false`; open network scopes are rejected.
 */
export function parseSandboxPosture(input: unknown): AgentSandboxPosture {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("sandbox posture must be an object");
	}
	const source = input as Record<string, unknown>;
	if (source.schema !== SANDBOX_POSTURE_SCHEMA) {
		throw new Error(`sandbox posture schema must be ${SANDBOX_POSTURE_SCHEMA}`);
	}
	if (source.ambientCredentials !== false) {
		throw new Error(
			"sandbox posture must set ambientCredentials: false — agents never inherit ambient credentials",
		);
	}
	const filesystem = source.filesystem as
		| { scope?: unknown; root?: unknown }
		| undefined;
	if (
		filesystem?.scope !== "workspace" ||
		typeof filesystem.root !== "string" ||
		filesystem.root.length === 0
	) {
		throw new Error(
			"sandbox posture filesystem must be workspace-scoped with a root",
		);
	}
	const network = source.network as
		| { scope?: unknown; allowlist?: unknown }
		| undefined;
	if (network?.scope !== "allowlist" || !Array.isArray(network.allowlist)) {
		throw new Error(
			"sandbox posture network must be allowlist-scoped (no open egress)",
		);
	}
	const envAllowlist = Array.isArray(source.envAllowlist)
		? source.envAllowlist.filter(
				(value): value is string => typeof value === "string",
			)
		: [];

	return Object.freeze({
		schema: SANDBOX_POSTURE_SCHEMA,
		ambientCredentials: false,
		filesystem: Object.freeze({
			scope: "workspace",
			root: filesystem.root,
		}),
		network: Object.freeze({
			scope: "allowlist",
			allowlist: Object.freeze(
				network.allowlist.filter(
					(value): value is string => typeof value === "string",
				),
			),
		}),
		envAllowlist: Object.freeze(envAllowlist),
	});
}

// Scrub a process environment down to the posture's allowlist — the spawn
// helper applies this so cloud credentials in the parent env never leak
// into the agent subprocess.
export function scrubEnvironment(
	posture: AgentSandboxPosture,
	env: Record<string, string | undefined> = process.env,
): Record<string, string> {
	const scrubbed: Record<string, string> = {};
	for (const key of posture.envAllowlist) {
		const value = env[key];
		if (value !== undefined) {
			scrubbed[key] = value;
		}
	}
	return scrubbed;
}
