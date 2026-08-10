import { describe, expect, it } from "vitest";

import type { NeonProviderError } from "../src/errors.js";
import {
	assertAllowedEndpoint,
	createFetchTransport,
	createGuardedTransport,
	DEFAULT_TRANSPORT_POLICY,
} from "../src/transport.js";
import { createStubTransport } from "./harness.js";

const OK = { status: 200, body: "{}" };

describe("assertAllowedEndpoint", () => {
	it("accepts the documented official endpoint", () => {
		const url = assertAllowedEndpoint(
			"https://neon.new/api/v1/database",
			DEFAULT_TRANSPORT_POLICY,
		);
		expect(url.hostname).toBe("neon.new");
	});

	it.each([
		["http://neon.new/api/v1/database", /https/u],
		["https://neon.new.attacker.example/api/v1/database", /allowlisted/u],
		["https://user:pass@neon.new/api/v1/database", /userinfo/u],
		["https://neon.new:8443/api/v1/database", /default https port/u],
		["https://neon.new/internal/debug", /allowlisted/u],
	])("rejects %s", (url, message) => {
		expect(() =>
			assertAllowedEndpoint(url, DEFAULT_TRANSPORT_POLICY),
		).toThrowError(message);
	});
});

describe("createGuardedTransport", () => {
	it("refuses to follow a redirect to another host", async () => {
		const transport = createGuardedTransport(
			createStubTransport([
				{
					status: 302,
					body: "",
					headers: { location: "https://attacker.example/api/v1/database" },
				},
			]),
		);
		await expect(
			transport.request({
				method: "POST",
				url: "https://neon.new/api/v1/database",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrowError(/never follows/u);
	});

	it("caps the response body", async () => {
		const transport = createGuardedTransport(
			createStubTransport([{ status: 200, body: "x".repeat(4096) }]),
			{ ...DEFAULT_TRANSPORT_POLICY, maxResponseBytes: 512 },
		);
		await expect(
			transport.request({
				method: "GET",
				url: "https://neon.new/api/v1/database/x",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 4096,
			}),
		).rejects.toThrowError(/exceeded the 512 byte cap/u);
	});

	it("rejects an over-large declared content-length before reading further", async () => {
		const transport = createGuardedTransport(
			createStubTransport([
				{ status: 200, body: "{}", headers: { "content-length": "1048576" } },
			]),
		);
		await expect(
			transport.request({
				method: "GET",
				url: "https://neon.new/api/v1/database/x",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrowError(/over the/u);
	});

	it("clamps the caller timeout to the policy ceiling", async () => {
		const inner = createStubTransport([OK]);
		const transport = createGuardedTransport(inner, {
			...DEFAULT_TRANSPORT_POLICY,
			timeoutMs: 2000,
		});
		await transport.request({
			method: "GET",
			url: "https://neon.new/api/v1/database/x",
			headers: {},
			timeoutMs: 10 * 60 * 1000,
			maxResponseBytes: 1024,
		});
		expect(inner.requests[0]?.timeoutMs).toBe(2000);
	});
});

describe("createFetchTransport", () => {
	it("uses only the injected fetch and never follows redirects", async () => {
		const calls: RequestInit[] = [];
		const transport = createFetchTransport({
			fetchImpl: (async (_url: string, init: RequestInit) => {
				calls.push(init);
				return new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as unknown as typeof globalThis.fetch,
		});
		const response = await transport.request({
			method: "GET",
			url: "https://neon.new/api/v1/database/x",
			headers: { accept: "application/json" },
			timeoutMs: 1000,
			maxResponseBytes: 1024,
		});
		expect(response.status).toBe(200);
		expect(calls[0]?.redirect).toBe("manual");
	});

	it("reports a dropped request as ambiguous, never as a failure to create", async () => {
		const transport = createFetchTransport({
			fetchImpl: (async () => {
				throw new Error("socket hang up");
			}) as unknown as typeof globalThis.fetch,
		});
		try {
			await transport.request({
				method: "POST",
				url: "https://neon.new/api/v1/database",
				headers: {},
				body: "{}",
				timeoutMs: 50,
				maxResponseBytes: 1024,
			});
			expect.unreachable("a dropped request must throw");
		} catch (error) {
			expect((error as NeonProviderError).code).toBe(
				"PROVIDER_OPERATION_AMBIGUOUS",
			);
		}
	});
});
