import { describe, expect, it, vi } from "vitest";
import { loadBrokerRuntimeConfig } from "../src/runtime-config-client.js";

const config = {
	HOBO_CI_PUBLIC_URL: "https://hobo-ci.example",
	HOBO_CI_SESSION_KEY: "A".repeat(43),
	HOBO_CI_BOOTSTRAP_ACCOUNT_ID: "account",
	HOBO_CI_BOOTSTRAP_TOKEN_SHA256: "a".repeat(64),
	HOBO_CI_CONTROL_TOKENS_JSON: "{}",
	HOBO_CI_CONFIG_JSON: "{}",
	CRON_SECRET: "test-cron-secret".repeat(2),
};
const origin = "https://example.compute.neon.tech";
const audience = "https://hobo-ci.example/internal/runtime-config";
const token = "test.identity.signature";

describe("runtime configuration broker client", () => {
	it("uses an audience-bound identity and rejects redirects", async () => {
		const getToken = vi.fn(async () => token);
		const send = vi.fn(async () => Response.json({ config }));
		await expect(
			loadBrokerRuntimeConfig({ origin, audience, getToken, fetch: send }),
		).resolves.toEqual(config);
		expect(getToken).toHaveBeenCalledWith(audience);
		const [url, request] = send.mock.calls[0] ?? [];
		expect(url).toBe(`${origin}/v1/runtime-config`);
		expect(request).toMatchObject({
			method: "POST",
			redirect: "error",
			headers: { authorization: `Bearer ${token}` },
		});
	});

	it("rejects an untrusted origin before obtaining or sending a token", async () => {
		const getToken = vi.fn(async () => token);
		for (const value of [
			"http://example.compute.neon.tech",
			"https://user@example.compute.neon.tech",
			"https://example.compute.neon.tech/path",
			"https://example.compute.neon.tech/?x=1",
		])
			await expect(
				loadBrokerRuntimeConfig({ origin: value, audience, getToken }),
			).rejects.toThrow();
		expect(getToken).not.toHaveBeenCalled();
	});

	it("does not allow the broker to replace database credentials", async () => {
		const send = vi.fn(async () =>
			Response.json({ config: { ...config, DATABASE_URL: "malicious" } }),
		);
		await expect(
			loadBrokerRuntimeConfig({
				origin,
				audience,
				getToken: async () => token,
				fetch: send,
			}),
		).rejects.toThrow();
	});

	it("rejects failures, non-JSON and oversized responses", async () => {
		for (const response of [
			new Response(null, { status: 403 }),
			new Response("not JSON", { status: 200 }),
			new Response("x".repeat(65_537), {
				headers: { "content-type": "application/json" },
			}),
		])
			await expect(
				loadBrokerRuntimeConfig({
					origin,
					audience,
					getToken: async () => token,
					fetch: async () => response,
				}),
			).rejects.toThrow();
	});
});
