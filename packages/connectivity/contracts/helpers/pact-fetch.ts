/**
 * Test-only: ProviderStub → Fetch for HTTP clients under PACT mocks.
 */
import {
	createMockProviderFromPact,
	type PactDocument,
	type PactRequest,
	type ProviderStub,
} from "@hobo/contract-harness";

export function createPactFetch(pact: PactDocument): typeof fetch {
	return createFetchFromProvider(createMockProviderFromPact(pact));
}

export function createFetchFromProvider(provider: ProviderStub): typeof fetch {
	return async (input, init) => {
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url,
		);
		const method = (
			init?.method ??
			(typeof input !== "string" && !(input instanceof URL)
				? (input as Request).method
				: "GET")
		).toUpperCase() as PactRequest["method"];

		let body: unknown;
		const rawBody = init?.body;
		if (typeof rawBody === "string" && rawBody.length > 0) {
			const ct =
				headerValue(init?.headers, "content-type") ??
				headerValue(init?.headers, "Content-Type") ??
				"";
			if (
				ct.includes("application/json") ||
				rawBody.trimStart().startsWith("{")
			) {
				try {
					body = JSON.parse(rawBody);
				} catch {
					body = rawBody;
				}
			} else if (ct.includes("application/x-www-form-urlencoded")) {
				body = Object.fromEntries(new URLSearchParams(rawBody).entries());
			} else {
				body = undefined;
			}
		}

		const path = `${url.pathname}${url.search}`;
		const request: PactRequest = {
			method,
			path,
			...(body !== undefined ? { body } : {}),
		};
		const response = await Promise.resolve(provider.handle(request));
		const headers = new Headers(response.headers as HeadersInit | undefined);
		if (!headers.has("content-type") && response.body !== undefined) {
			headers.set(
				"content-type",
				typeof response.body === "string" &&
					response.body.trimStart().startsWith("<")
					? "text/xml; charset=utf-8"
					: "application/json",
			);
		}
		const payload =
			response.body === undefined
				? ""
				: typeof response.body === "string"
					? response.body
					: JSON.stringify(response.body);
		return new Response(payload, {
			status: response.status,
			headers,
		});
	};
}

function headerValue(
	headers: HeadersInit | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	if (Array.isArray(headers)) {
		const hit = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
		return hit?.[1];
	}
	const rec = headers as Record<string, string>;
	for (const [k, v] of Object.entries(rec)) {
		if (k.toLowerCase() === name.toLowerCase()) return v;
	}
	return undefined;
}
