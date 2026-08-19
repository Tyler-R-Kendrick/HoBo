import { must } from "@hobo/core/total-access";
// Operator preflight for the deploy path: report which REAL cloud backend the
// current environment selects (mirroring `selectIacProvider`'s precedence) and,
// when on the in-memory fallback, exactly what to set to go live. Pure and
// env-injected — it inspects the PRESENCE of credential env vars, never their
// values, so it is safe to run and fully testable without any real secret.

export type DeployBackend = "cloudflare" | "vercel" | "in-memory";

/**
 * Which driver carries the deploy, independent of which cloud it targets.
 *
 * `deploy-provider` is the pre-existing bespoke client per cloud;
 * `resolver` is the direct-HTTP ResourceResolver plane, opt-in behind
 * `HOBO_DEPLOY_RESOLVERS=1`. An operator needs to know which one runs,
 * because they converge differently: the resolver plane is read-or-create
 * per product, so a re-run adopts rather than re-creating.
 */
export type DeployLane = "deploy-provider" | "resolver" | "in-memory";

// public-contract: the env var that opts a deploy into the resolver plane; renaming it silently returns every deploy to the bespoke clients.
export const RESOLVER_LANE_ENV = "HOBO_DEPLOY_RESOLVERS";

export interface DeployTargetDescription {
	/** The backend `hobo up` would use with this environment. */
	readonly backend: DeployBackend;
	/** True when a real cloud backend is selected (a live deploy will be attempted). */
	readonly live: boolean;
	/** Which driver carries the deploy. */
	readonly lane: DeployLane;
	/** Human-readable one-line status. */
	readonly summary: string;
	/**
	 * When not live, the env vars that would activate each real backend — each
	 * entry lists the vars still missing for that option. Empty when already live.
	 */
	readonly activate: readonly {
		readonly backend: DeployBackend;
		readonly missing: readonly string[];
	}[];
}

const has = (env: Record<string, string | undefined>, key: string): boolean =>
	typeof env[key] === "string" && must(env[key]).length > 0;

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

	// Mirrors selectIacProvider: the resolver lane sits INSIDE the
	// credential-gated bracket, so it can only replace the bespoke clients and
	// never the credential-free default.
	const resolvers = has(env, RESOLVER_LANE_ENV);

	if (cloudflareToken && cloudflareAccount) {
		return {
			backend: "cloudflare",
			lane: resolvers ? "resolver" : "deploy-provider",
			live: true,
			summary: resolvers
				? "Live target: Cloudflare via the direct-HTTP resolver plane (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set, HOBO_DEPLOY_RESOLVERS=1). Each product reconciles read-or-create, so a re-run adopts rather than re-creating."
				: "Live target: Cloudflare Workers (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set). `hobo up` will deploy a real Worker. Set HOBO_DEPLOY_RESOLVERS=1 to use the resolver plane instead.",
			activate: [],
		};
	}
	if (vercelToken) {
		return {
			backend: "vercel",
			lane: resolvers ? "resolver" : "deploy-provider",
			live: true,
			summary: resolvers
				? "Live target: Vercel via the direct-HTTP resolver plane (VERCEL_TOKEN set, HOBO_DEPLOY_RESOLVERS=1). Each product reconciles read-or-create, so a re-run adopts rather than re-creating."
				: "Live target: Vercel (VERCEL_TOKEN set). `hobo up` will deploy to real Vercel. Set HOBO_DEPLOY_RESOLVERS=1 to use the resolver plane instead.",
			activate: [],
		};
	}

	// In-memory fallback: report what's missing to activate each real backend.
	const cloudflareMissing: string[] = [];
	if (!cloudflareToken) cloudflareMissing.push("CLOUDFLARE_API_TOKEN");
	if (!cloudflareAccount) cloudflareMissing.push("CLOUDFLARE_ACCOUNT_ID");

	return {
		backend: "in-memory",
		lane: "in-memory",
		live: false,
		summary:
			"No cloud credential present — `hobo up` runs the in-memory lane. Set one of the options below to deploy for real.",
		activate: [
			{ backend: "vercel", missing: ["VERCEL_TOKEN"] },
			{ backend: "cloudflare", missing: cloudflareMissing },
		],
	};
}
