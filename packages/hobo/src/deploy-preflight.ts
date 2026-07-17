// Operator preflight for the deploy path: report which REAL cloud backend the
// current environment selects (mirroring `selectIacProvider`'s precedence) and,
// when on the in-memory fallback, exactly what to set to go live. Pure and
// env-injected — it inspects the PRESENCE of credential env vars, never their
// values, so it is safe to run and fully testable without any real secret.

export type DeployBackend = "cloudflare" | "vercel" | "in-memory";

export interface DeployTargetDescription {
	/** The backend `hobo up` would use with this environment. */
	readonly backend: DeployBackend;
	/** True when a real cloud backend is selected (a live deploy will be attempted). */
	readonly live: boolean;
	/** Human-readable one-line status. */
	readonly summary: string;
	/**
	 * When not live, the env vars that would activate each real backend — each
	 * entry lists the vars still missing for that option. Empty when already live.
	 */
	readonly activate: readonly { readonly backend: DeployBackend; readonly missing: readonly string[] }[];
}

const has = (env: Record<string, string | undefined>, key: string): boolean =>
	typeof env[key] === "string" && env[key]!.length > 0;

/**
 * Describe the deploy target selected by `env` (defaults to `process.env`),
 * using the same precedence as {@link selectIacProvider}: Cloudflare (token +
 * account id) → Vercel (token) → in-memory fallback.
 */
export function describeDeployTarget(
	env: Record<string, string | undefined> = process.env,
): DeployTargetDescription {
	const cloudflareToken = has(env, "CLOUDFLARE_API_TOKEN");
	const cloudflareAccount = has(env, "CLOUDFLARE_ACCOUNT_ID");
	const vercelToken = has(env, "VERCEL_TOKEN");

	if (cloudflareToken && cloudflareAccount) {
		return {
			backend: "cloudflare",
			live: true,
			summary:
				"Live target: Cloudflare Workers (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set). `hobo up` will deploy a real Worker.",
			activate: [],
		};
	}
	if (vercelToken) {
		return {
			backend: "vercel",
			live: true,
			summary:
				"Live target: Vercel (VERCEL_TOKEN set). `hobo up` will deploy to real Vercel.",
			activate: [],
		};
	}

	// In-memory fallback: report what's missing to activate each real backend.
	const cloudflareMissing: string[] = [];
	if (!cloudflareToken) cloudflareMissing.push("CLOUDFLARE_API_TOKEN");
	if (!cloudflareAccount) cloudflareMissing.push("CLOUDFLARE_ACCOUNT_ID");

	return {
		backend: "in-memory",
		live: false,
		summary:
			"No cloud credential present — `hobo up` runs the in-memory lane. Set one of the options below to deploy for real.",
		activate: [
			{ backend: "vercel", missing: ["VERCEL_TOKEN"] },
			{ backend: "cloudflare", missing: cloudflareMissing },
		],
	};
}
