/** Same-origin OpenSaaS Temporary Accounts ship for Examples console. */

export type OpenSaasTemporaryShipResult = {
	readonly exampleId: string;
	readonly stationId: string;
	readonly clientUrl: string;
	readonly serverUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
};

function sameOriginCfTempBase(pageUrl?: string | URL, basePath = "/HoBo/"): string {
	const page =
		typeof pageUrl === "string"
			? new URL(pageUrl)
			: (pageUrl ??
				(typeof globalThis.location?.href === "string"
					? new URL(globalThis.location.href)
					: null));
	if (!page) {
		throw new Error(
			"OpenSaaS Cloudflare Temporary Accounts ship needs a page URL (astro dev).",
		);
	}
	const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
	const prefix = base.length === 0 || base === "/" ? "" : base;
	return `${page.origin}${prefix}/api/cf-temp`;
}

/**
 * Ship real Wasp OpenSaaS client via same-origin Temporary Accounts API.
 * Does not use local-bridge / wrangler login / permanent API tokens.
 */
export async function shipOpenSaasViaTemporaryAccounts(input: {
	readonly stationId: string;
	readonly pageUrl?: string | URL;
	readonly basePath?: string;
	readonly fetchImpl?: typeof fetch;
}): Promise<OpenSaasTemporaryShipResult> {
	const base = sameOriginCfTempBase(input.pageUrl, input.basePath);
	const fetchImpl = input.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(`${base}/opensaas`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ stationId: input.stationId }),
			signal: AbortSignal.timeout(600_000),
		});
	} catch (error) {
		throw new Error(
			`OpenSaaS Temporary Accounts ship unreachable at ${base}/opensaas (${error instanceof Error ? error.message : String(error)}). Run pnpm --filter hobo-site run dev.`,
		);
	}
	const body = (await response.json()) as {
		ok?: boolean;
		error?: string;
		remediation?: string;
		exampleId?: string;
		clientUrl?: string;
		serverUrl?: string;
		claimUrl?: string;
		expiresAt?: string;
	};
	if (!response.ok || !body.ok) {
		throw new Error(
			body.remediation ??
				body.error ??
				`OpenSaaS Temporary Accounts HTTP ${response.status}`,
		);
	}
	if (!body.clientUrl?.includes(".workers.dev")) {
		throw new Error(
			`OpenSaaS ship returned non-workers.dev clientUrl (${body.clientUrl ?? ""})`,
		);
	}
	if (!body.claimUrl || !body.serverUrl || !body.expiresAt) {
		throw new Error("OpenSaaS Temporary Accounts response missing claimUrl/serverUrl");
	}
	return {
		exampleId: body.exampleId ?? "opensaas",
		stationId: input.stationId,
		clientUrl: body.clientUrl,
		serverUrl: body.serverUrl,
		claimUrl: body.claimUrl,
		expiresAt: body.expiresAt,
		anonymous: true,
		temporary: true,
	};
}
