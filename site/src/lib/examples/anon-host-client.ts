/**
 * Same-origin agent anonymous host client for providers without Temporary Accounts.
 * Never uses blob: URLs.
 */

export type AnonProviderId =
	| "railway"
	| "netlify"
	| "vercel"
	| "webernetes"
	| "lakebed"
	| "kubernetes"
	| "browser-wasm";

export const ANON_SAME_ORIGIN_PROVIDERS: ReadonlySet<string> = new Set([
	"railway",
	"netlify",
	"vercel",
	"webernetes",
	"lakebed",
	"kubernetes",
	"browser-wasm",
]);

export type AnonStationProvision = {
	readonly ok: true;
	readonly stationId: string;
	readonly stationUrl: string;
	readonly endpointUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
	readonly hostKind: "same-origin-agent";
	readonly providerId: string;
};

export type AnonOpenSaasShip = {
	readonly ok: true;
	readonly exampleId: string;
	readonly clientUrl: string;
	readonly serverUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
	readonly hostKind: "same-origin-agent";
	readonly providerId: string;
};

export type AnonHostError = {
	readonly ok: false;
	readonly error: string;
	readonly remediation?: string;
};

function sameOriginAnonApiBase(
	pageUrl: string | URL,
	basePath = "/HoBo/",
): string {
	const page = typeof pageUrl === "string" ? new URL(pageUrl) : pageUrl;
	const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
	const prefix = base.length === 0 || base === "/" ? "" : base;
	return `${page.origin}${prefix}/api/anon`;
}

export function isAnonSameOriginProvider(id: string): id is AnonProviderId {
	return ANON_SAME_ORIGIN_PROVIDERS.has(id);
}

export function isHttpStationUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

export function isBlobUrl(url: string): boolean {
	return url.startsWith("blob:");
}

const REMEDIATION =
	"Same-origin anon host unreachable. Local: `pnpm --filter hobo-site run dev` (serves /api/anon). Blob URLs are not remote providers.";

export async function provisionAnonStationViaSameOrigin(input: {
	readonly providerId: AnonProviderId;
	readonly stationId: string;
	readonly pageUrl?: string | URL;
	readonly basePath?: string;
	readonly fetchImpl?: typeof fetch;
}): Promise<AnonStationProvision> {
	const pageUrl =
		input.pageUrl ??
		(typeof globalThis.location?.href === "string"
			? globalThis.location.href
			: undefined);
	if (!pageUrl) {
		throw new Error(
			"Anon same-origin station needs a page URL (astro dev).",
		);
	}
	const base = sameOriginAnonApiBase(pageUrl, input.basePath ?? "/HoBo/");
	const fetchImpl = input.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(`${base}/${input.providerId}/station`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ stationId: input.stationId }),
			signal: AbortSignal.timeout(60_000),
		});
	} catch (error) {
		throw new Error(
			`${REMEDIATION} (${error instanceof Error ? error.message : String(error)})`,
		);
	}
	const body = (await response.json()) as AnonStationProvision | AnonHostError;
	if (!response.ok || !body.ok) {
		const fail = body as AnonHostError;
		throw new Error(
			fail.remediation ??
				fail.error ??
				`Anon host HTTP ${response.status} at ${base}/${input.providerId}/station`,
		);
	}
	const url = body.stationUrl || body.endpointUrl;
	if (isBlobUrl(url)) {
		throw new Error(
			`Anon host returned blob: URL for ${input.providerId} — refusing`,
		);
	}
	if (!isHttpStationUrl(url)) {
		throw new Error(
			`Anon host returned non-HTTP stationUrl (${url}) for ${input.providerId}`,
		);
	}
	if (!body.claimUrl) {
		throw new Error("Anon host response missing claimUrl");
	}
	return { ...body, stationUrl: url, endpointUrl: url };
}

export async function shipOpenSaasViaSameOriginAnon(input: {
	readonly providerId: AnonProviderId;
	readonly stationId: string;
	readonly pageUrl?: string | URL;
	readonly basePath?: string;
	readonly fetchImpl?: typeof fetch;
}): Promise<AnonOpenSaasShip> {
	const pageUrl =
		input.pageUrl ??
		(typeof globalThis.location?.href === "string"
			? globalThis.location.href
			: undefined);
	if (!pageUrl) {
		throw new Error("OpenSaaS same-origin ship needs a page URL (astro dev).");
	}
	const base = sameOriginAnonApiBase(pageUrl, input.basePath ?? "/HoBo/");
	const fetchImpl = input.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(`${base}/${input.providerId}/opensaas`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ stationId: input.stationId }),
			signal: AbortSignal.timeout(180_000),
		});
	} catch (error) {
		throw new Error(
			`OpenSaaS same-origin ship unreachable at ${base}/${input.providerId}/opensaas (${error instanceof Error ? error.message : String(error)}).`,
		);
	}
	const body = (await response.json()) as AnonOpenSaasShip | AnonHostError;
	if (!response.ok || !body.ok) {
		const fail = body as AnonHostError;
		throw new Error(
			fail.remediation ??
				fail.error ??
				`OpenSaaS same-origin HTTP ${response.status}`,
		);
	}
	if (isBlobUrl(body.clientUrl)) {
		throw new Error(
			`OpenSaaS same-origin returned blob: clientUrl for ${input.providerId}`,
		);
	}
	if (!isHttpStationUrl(body.clientUrl)) {
		throw new Error(
			`OpenSaaS same-origin returned non-HTTP clientUrl (${body.clientUrl})`,
		);
	}
	if (!body.claimUrl || !body.serverUrl || !body.expiresAt) {
		throw new Error("OpenSaaS same-origin response missing claimUrl/serverUrl");
	}
	return body;
}
