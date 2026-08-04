// Credential-gated Convex Management API client. Honesty rules
// (docs/design/live-provider-matrix.md): the live path activates only when a
// broker-supplied deploy key is present, requests are formed against an
// injected fetch so tests never need the network, and a missing credential
// FAILS CLOSED with a remediation naming the broker path — never a silent
// no-op. Env inspection is presence-only; values are never logged or echoed.

// public-contract: default Management API base consumers may override.
export const CONVEX_MANAGEMENT_API_BASE = "https://api.convex.dev/v1";

export interface ConvexManagementClientOptions {
	/** Broker-minted deploy key; absence gates the client closed. */
	readonly deployKey?: string;
	readonly apiBase?: string;
	readonly fetchImpl?: typeof fetch;
}

export interface ConvexDeploymentInfo {
	readonly name: string;
	readonly url: string;
	readonly state: string;
}

export class ConvexCredentialsError extends Error {
	constructor() {
		super(
			"convex management API is credential-gated: no deploy key present. " +
				"Route a broker-minted key via secretRef / the Yard token broker " +
				"(deploy keys are never stored in Bindles or Camps).",
		);
		this.name = "ConvexCredentialsError";
	}
}

export interface ConvexManagementClient {
	/** True when a credential is present (presence-only; value never exposed). */
	readonly live: boolean;
	listDeployments(): Promise<readonly ConvexDeploymentInfo[]>;
	createDeployment(slug: string): Promise<ConvexDeploymentInfo>;
}

export function createConvexManagementClient(
	options: ConvexManagementClientOptions = {},
): ConvexManagementClient {
	const deployKey = options.deployKey?.trim();
	const base = (options.apiBase ?? CONVEX_MANAGEMENT_API_BASE).replace(
		/\/+$/u,
		"",
	);
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;

	async function request(path: string, init?: RequestInit): Promise<unknown> {
		if (!deployKey) {
			throw new ConvexCredentialsError();
		}
		const response = await fetchImpl(`${base}${path}`, {
			...init,
			headers: {
				accept: "application/json",
				authorization: `Bearer ${deployKey}`,
				...(init?.body === undefined
					? {}
					: { "content-type": "application/json" }),
			},
		});
		if (!response.ok) {
			throw new Error(
				`convex management API ${path} failed with ${response.status}`,
			);
		}
		return response.json();
	}

	function parseDeployment(value: unknown): ConvexDeploymentInfo {
		// Parse-don't-validate: untrusted API payloads become parsed derived
		// types or throw — nothing downstream re-checks broad DTOs.
		if (typeof value !== "object" || value === null) {
			throw new Error("convex deployment payload must be an object");
		}
		const record = value as Record<string, unknown>;
		for (const field of ["name", "url", "state"] as const) {
			if (typeof record[field] !== "string" || record[field] === "") {
				throw new Error(`convex deployment payload missing ${field}`);
			}
		}
		return Object.freeze({
			name: record.name as string,
			url: record.url as string,
			state: record.state as string,
		});
	}

	return {
		live: Boolean(deployKey),
		async listDeployments() {
			const payload = await request("/deployments");
			if (!Array.isArray(payload)) {
				throw new Error("convex deployments payload must be an array");
			}
			return Object.freeze(payload.map(parseDeployment));
		},
		async createDeployment(slug: string) {
			if (!slug.trim()) {
				throw new Error("deployment slug must be non-empty");
			}
			const payload = await request("/deployments", {
				method: "POST",
				body: JSON.stringify({ name: slug.trim() }),
			});
			return parseDeployment(payload);
		},
	};
}

/**
 * Presence-only preflight (deploy-preflight pattern): report whether the
 * Convex lane could go live and what is missing — inspects env-var PRESENCE,
 * never values.
 */
export function describeConvexTarget(env: Record<string, string | undefined>): {
	live: boolean;
	missing: readonly string[];
} {
	const missing = ["CONVEX_DEPLOY_KEY"].filter((name) => !env[name]?.trim());
	return Object.freeze({ live: missing.length === 0, missing });
}
