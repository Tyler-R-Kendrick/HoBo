import { createHash } from "node:crypto";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";

const canonicalKey = z
	.string()
	.regex(/^[A-Za-z0-9_-]{43}$/)
	.refine((value) => {
		const bytes = Buffer.from(value, "base64url");
		return bytes.length === 32 && bytes.toString("base64url") === value;
	});
const origin = z
	.string()
	.url()
	.refine((value) => {
		try {
			const url = new URL(value);
			return (
				url.protocol === "https:" &&
				url.origin === value &&
				!url.username &&
				!url.password
			);
		} catch {
			return false;
		}
	});

/** Only configuration owned by HoBo may cross this boundary. Database and
 * platform credentials stay in their native integration environment. */
export const RuntimeBrokerConfig = z
	.object({
		HOBO_CI_PUBLIC_URL: origin,
		HOBO_CI_SESSION_KEY: canonicalKey,
		HOBO_CI_BOOTSTRAP_ACCOUNT_ID: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
		HOBO_CI_BOOTSTRAP_TOKEN_SHA256: z.string().regex(/^[a-f0-9]{64}$/),
		HOBO_CI_INVITATION_EXPIRES_AT: z
			.string()
			.regex(/^\d{13}$/)
			.optional(),
		HOBO_CI_CONTROL_TOKENS_JSON: z.string().min(2).max(24_576),
		HOBO_CI_ONBOARDING_CONTROL_TOKEN: canonicalKey.optional(),
		HOBO_CI_CONFIG_JSON: z.string().min(2).max(24_576),
		CRON_SECRET: z.string().min(32).max(1024),
		HOBO_CI_SANDBOX_ENABLED: z.literal("1").optional(),
		HOBO_CI_SANDBOX_TEAM_ID: z
			.string()
			.regex(/^team_[A-Za-z0-9]{1,100}$/)
			.optional(),
		HOBO_CI_SANDBOX_PROJECT_ID: z
			.string()
			.regex(/^prj_[A-Za-z0-9]{1,100}$/)
			.optional(),
		HOBO_CI_SANDBOX_ISSUER: z.string().url().max(256).optional(),
		HOBO_CI_SANDBOX_PLAN: z.enum(["hobby", "pro", "enterprise"]).optional(),
		HOBO_CI_SANDBOX_DOMAINS_JSON: z.string().min(2).max(16_384).optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (!value.HOBO_CI_ONBOARDING_CONTROL_TOKEN) return;
		const digest = createHash("sha256")
			.update(value.HOBO_CI_ONBOARDING_CONTROL_TOKEN)
			.digest("hex");
		try {
			const parsed = z
				.object({
					tokens: z.array(
						z
							.object({
								accountId: z.string(),
								tokenSha256: z.string(),
								scopes: z.array(z.string()),
							})
							.passthrough(),
					),
				})
				.parse(JSON.parse(value.HOBO_CI_CONTROL_TOKENS_JSON));
			if (
				parsed.tokens.some(
					(credential) =>
						credential.accountId === value.HOBO_CI_BOOTSTRAP_ACCOUNT_ID &&
						credential.tokenSha256 === digest &&
						["policy:read", "policy:write", "repositories:write"].every(
							(scope) => credential.scopes.includes(scope),
						),
				)
			)
				return;
		} catch {
			// Never expose the control-token configuration in a parse error.
		}
		context.addIssue({
			code: "custom",
			message: "invalid onboarding control binding",
		});
	});
export type RuntimeBrokerConfig = z.infer<typeof RuntimeBrokerConfig>;

// Some runtimes represent an empty POST as a stream instead of null. Consume
// only an empty stream, with a fixed deadline and bounded number of chunks.
async function hasEmptyBody(body: ReadableStream<Uint8Array> | null) {
	if (!body) return true;
	const reader = body.getReader();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const timeout = new Promise<false>((resolve) => {
			timer = setTimeout(() => resolve(false), 1000);
		});
		const consume = async () => {
			for (let chunks = 0; chunks < 32; chunks++) {
				const result = await reader.read();
				if (result.done) return true;
				if (result.value.byteLength !== 0) return false;
			}
			return false;
		};
		return await Promise.race([consume(), timeout]);
	} catch {
		return false;
	} finally {
		if (timer) clearTimeout(timer);
		// Cancellation of an adversarial stream must not delay the response.
		void reader.cancel().catch(() => {});
	}
}

/** The trust configuration is supplied by the broker deployment, not requests. */
export function createNeonSecretBroker(options: {
	teamSlug: string;
	teamId: string;
	projectName: string;
	projectId: string;
	audience: string;
	config: RuntimeBrokerConfig;
	/** Injected only by contract tests; production uses Vercel's pinned JWKS. */
	jwks?: JWTVerifyGetKey;
}) {
	const { teamSlug, teamId, projectName, projectId } = options;
	if (
		!/^[a-z0-9][a-z0-9-]{0,99}$/.test(teamSlug) ||
		!/^team_[A-Za-z0-9]{1,100}$/.test(teamId) ||
		!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(projectName) ||
		!/^prj_[A-Za-z0-9]{1,100}$/.test(projectId)
	)
		throw new Error("invalid Vercel broker identity");
	const config = RuntimeBrokerConfig.parse(options.config);
	const audience = new URL(options.audience);
	if (
		audience.protocol !== "https:" ||
		audience.username ||
		audience.password ||
		audience.search ||
		audience.hash ||
		options.audience !== `${config.HOBO_CI_PUBLIC_URL}/internal/runtime-config`
	)
		throw new Error("invalid broker audience");
	const issuer = `https://oidc.vercel.com/${teamSlug}`;
	const subject = `owner:${teamSlug}:project:${projectName}:environment:production`;
	const jwks =
		options.jwks ??
		createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`), {
			timeoutDuration: 3000,
			cooldownDuration: 30_000,
		});
	return async (request: Request): Promise<Response> => {
		const headers = {
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
		};
		if (
			request.method !== "POST" ||
			new URL(request.url).pathname !== "/v1/runtime-config"
		)
			return new Response(null, { status: 404, headers });
		const auth = request.headers.get("authorization") ?? "";
		const match = /^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(auth);
		if (!match?.[1]) return new Response(null, { status: 403, headers });
		try {
			const { payload } = await jwtVerify(match[1], jwks, {
				issuer,
				audience: options.audience,
				subject,
				algorithms: ["RS256"],
				requiredClaims: ["iat", "nbf", "exp", "sub"],
				maxTokenAge: "5m",
				clockTolerance: 5,
			});
			if (
				payload.owner !== teamSlug ||
				payload.owner_id !== teamId ||
				payload.project !== projectName ||
				payload.project_id !== projectId ||
				payload.environment !== "production"
			)
				return new Response(null, { status: 403, headers });
			if (!(await hasEmptyBody(request.body)))
				return new Response(null, { status: 404, headers });
			return Response.json({ config }, { status: 200, headers });
		} catch {
			return new Response(null, { status: 403, headers });
		}
	};
}
