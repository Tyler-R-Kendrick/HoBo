import { describe, expect, it } from "vitest";

import {
	assertAllowedEndpoint,
	createGuardedTransport,
	DEFAULT_TRANSPORT_POLICY,
	NETLIFY_ALLOWED_PATH_PREFIXES,
	NETLIFY_API_ALLOWED_HOSTS,
} from "../src/transport.js";

/**
 * The outbound guard had no tests of its own before this file, which is how it
 * kept a hole: the local copy checked `pathname.startsWith(prefix)` and nothing
 * else, so a path could enter through `/api/v1/sites/` and climb straight back
 * out. The guard now delegates to `@hobo/core`; these pin the behaviour at the
 * boundary that needs it, so the package does not silently depend on an
 * upstream check with nothing local to notice if it goes away.
 */
describe("netlify outbound guard", () => {
	it("pins the documented host and prefix", () => {
		expect(NETLIFY_API_ALLOWED_HOSTS).toEqual(["api.netlify.com"]);
		expect(NETLIFY_ALLOWED_PATH_PREFIXES).toEqual(["/api/v1/sites/"]);
		expect(
			assertAllowedEndpoint(
				"https://api.netlify.com/api/v1/sites/site_1",
				DEFAULT_TRANSPORT_POLICY,
			).pathname,
		).toBe("/api/v1/sites/site_1");
	});

	it("refuses percent-encoded traversal out of the allowlisted prefix", () => {
		for (const url of [
			"https://api.netlify.com/api/v1/sites/%2e%2e/user",
			"https://api.netlify.com/api/v1/sites/%2f%2e%2e%2faccounts",
			"https://api.netlify.com/api/v1/sites/..%5cadmin",
		]) {
			expect(() =>
				assertAllowedEndpoint(url, DEFAULT_TRANSPORT_POLICY),
			).toThrow(/PROVIDER_CONTRACT_CHANGED|path/iu);
		}
	});

	it("refuses plain http, a lookalike host, userinfo, and an off-prefix path", () => {
		for (const url of [
			"http://api.netlify.com/api/v1/sites/site_1",
			"https://api.netlify.com.attacker.example/api/v1/sites/site_1",
			"https://user:pass@api.netlify.com/api/v1/sites/site_1",
			"https://api.netlify.com/api/v1/undocumented/thing",
			"not a url",
		]) {
			expect(() =>
				assertAllowedEndpoint(url, DEFAULT_TRANSPORT_POLICY),
			).toThrow(/PROVIDER|https|host|path|url/iu);
		}
	});

	it("refuses a redirect rather than following it with the credential", async () => {
		const redirecting = createGuardedTransport({
			async request() {
				return {
					status: 302,
					headers: { location: "https://attacker.example/steal" },
					body: "",
				};
			},
		});
		await expect(
			redirecting.request({
				method: "GET",
				url: "https://api.netlify.com/api/v1/sites/site_1",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrow(/redirect/u);
	});
});
