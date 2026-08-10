import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
	isProviderError,
	providerErrorForStatus,
	redactProviderText,
} from "../src/errors.js";
import {
	assertAllowedEndpoint,
	createGuardedTransport,
	UPSTASH_CONTROL_PLANE_POLICY,
	UPSTASH_DATA_PLANE_POLICY,
} from "../src/transport.js";
import {
	createStubTransport,
	FAKE_REST_TOKEN,
	VALID_PAYLOAD,
} from "./fixtures/index.js";

const CONTROL_REQUEST = {
	method: "POST",
	url: "https://upstash.com/start-redis",
	headers: {},
	timeoutMs: 5_000,
	maxResponseBytes: 64 * 1024,
} as const;

describe("assertAllowedEndpoint", () => {
	it("accepts the documented control-plane URL", () => {
		const url = assertAllowedEndpoint(
			"https://upstash.com/start-redis",
			UPSTASH_CONTROL_PLANE_POLICY,
		);
		assert.equal(url.hostname, "upstash.com");
	});

	it("accepts a per-database data-plane origin", () => {
		const url = assertAllowedEndpoint(
			"https://fake-mallard-000000.upstash.io",
			UPSTASH_DATA_PLANE_POLICY,
		);
		assert.equal(url.hostname, "fake-mallard-000000.upstash.io");
	});

	for (const [reason, url] of [
		["plaintext http", "http://upstash.com/start-redis"],
		["another host entirely", "https://evil.example.com/start-redis"],
		// The control-plane call is unauthenticated, so a lookalike host costs
		// nothing to reach and hands back an attacker's token.
		["a lookalike host", "https://upstash.com.evil.example.com/start-redis"],
		["embedded userinfo", "https://user:pass@upstash.com/start-redis"],
		["an off-policy path", "https://upstash.com/admin"],
		["a non-default port", "https://upstash.com:8443/start-redis"],
	] as const) {
		it(`refuses ${reason}`, () => {
			assert.throws(
				() => assertAllowedEndpoint(url, UPSTASH_CONTROL_PLANE_POLICY),
				(error: unknown) =>
					isProviderError(error) && error.code === "PROVIDER_CONTRACT_CHANGED",
			);
		});
	}

	it("refuses the bare data-plane suffix with no database label in front", () => {
		assert.throws(
			() =>
				assertAllowedEndpoint("https://upstash.io", UPSTASH_DATA_PLANE_POLICY),
			(error: unknown) => isProviderError(error),
		);
	});
});

describe("createGuardedTransport", () => {
	it("passes an allowlisted request through", async () => {
		const stub = createStubTransport({
			script: [{ status: 200, body: VALID_PAYLOAD }],
		});
		const guarded = createGuardedTransport(stub, UPSTASH_CONTROL_PLANE_POLICY);

		const response = await guarded.request(CONTROL_REQUEST);

		assert.equal(response.status, 200);
		assert.equal(stub.requests.length, 1);
	});

	it("refuses to follow a redirect", async () => {
		const stub = createStubTransport({
			script: [
				{
					status: 302,
					headers: { location: "https://evil.example.com/start-redis" },
					body: "",
				},
			],
		});
		const guarded = createGuardedTransport(stub, UPSTASH_CONTROL_PLANE_POLICY);

		await assert.rejects(
			guarded.request(CONTROL_REQUEST),
			(error: unknown) =>
				isProviderError(error) &&
				error.code === "PROVIDER_CONTRACT_CHANGED" &&
				/never follows/u.test(error.message),
		);
	});

	it("refuses a response past the byte cap", async () => {
		const stub = createStubTransport({
			script: [
				{
					status: 200,
					body: "x".repeat(UPSTASH_CONTROL_PLANE_POLICY.maxResponseBytes + 1),
				},
			],
		});
		const guarded = createGuardedTransport(stub, UPSTASH_CONTROL_PLANE_POLICY);

		await assert.rejects(guarded.request(CONTROL_REQUEST), (error: unknown) =>
			isProviderError(error),
		);
	});

	it("clamps a caller's timeout and byte budget down to the policy", async () => {
		const stub = createStubTransport({});
		const guarded = createGuardedTransport(stub, UPSTASH_CONTROL_PLANE_POLICY);

		await guarded.request({
			...CONTROL_REQUEST,
			timeoutMs: 10 * 60_000,
			maxResponseBytes: 100 * 1024 * 1024,
		});

		const sent = stub.requests[0];
		assert.ok(sent !== undefined);
		assert.equal(sent.timeoutMs, UPSTASH_CONTROL_PLANE_POLICY.timeoutMs);
		assert.equal(
			sent.maxResponseBytes,
			UPSTASH_CONTROL_PLANE_POLICY.maxResponseBytes,
		);
	});
});

describe("redactProviderText", () => {
	it("removes a markdown token field", () => {
		const redacted = redactProviderText(`**Token:** ${FAKE_REST_TOKEN}`);
		assert.ok(!redacted.includes(FAKE_REST_TOKEN));
		assert.match(redacted, /\[redacted\]/u);
	});

	it("removes a bearer header value", () => {
		const redacted = redactProviderText(
			`authorization: Bearer ${FAKE_REST_TOKEN}`,
		);
		assert.ok(!redacted.includes(FAKE_REST_TOKEN));
	});

	it("removes a long opaque blob with no recognizable prefix", () => {
		const blob = "A".repeat(64);
		assert.ok(!redactProviderText(`value ${blob}`).includes(blob));
	});

	it("flattens control characters so provider text cannot forge a log line", () => {
		const redacted = redactProviderText("first\n\rINFO fake second");
		assert.ok(!redacted.includes("\n"));
	});

	it("keeps a hostname, which is not a credential", () => {
		assert.match(
			redactProviderText("endpoint fake-mallard-000000.upstash.io"),
			/fake-mallard-000000\.upstash\.io/u,
		);
	});
});

describe("providerErrorForStatus", () => {
	it("maps 429 to a retryable rate limit", () => {
		const error = providerErrorForStatus(429, {
			method: "POST",
			retryAfterMs: 30_000,
		});
		assert.equal(error.code, "PROVIDER_RATE_LIMITED");
		assert.equal(error.retryable, true);
		assert.equal(error.retryAfterMs, 30_000);
	});

	it("maps 401 to an auth failure", () => {
		assert.equal(
			providerErrorForStatus(401, { method: "POST" }).code,
			"PROVIDER_AUTH_FAILED",
		);
	});

	it("maps a 5xx on a create to ambiguous, never retryable", () => {
		const error = providerErrorForStatus(503, { method: "POST" });
		assert.equal(error.code, "PROVIDER_OPERATION_AMBIGUOUS");
		// "Unknown" must not be presented as "safe to redo blindly".
		assert.equal(error.retryable, false);
	});

	it("redacts a credential-bearing error body", () => {
		const error = providerErrorForStatus(400, {
			method: "POST",
			body: `**Token:** ${FAKE_REST_TOKEN}`,
		});
		assert.ok(!JSON.stringify(error.toJSON()).includes(FAKE_REST_TOKEN));
	});
});
