// The credentialed HTTPS boundary the direct-provider-API deploy path runs
// over. The cases below pin every one of the six refusals, because each is a
// way a single bad config value could send a provider token to an origin
// nobody allowlisted, plus the two normalization decisions that are easy to
// get wrong in the other direction: WHATWG case folding of the request host
// is fine, case folding the policy is not, and a percent-encoded dot segment
// is refused rather than decoded.
import { describe, expect, it } from "vitest";

import {
	guardTransport,
	type HttpTransport,
	TRANSPORT_GUARD_ERROR_CODES,
	TRANSPORT_METHODS,
	TransportGuardError,
	type TransportGuardPolicy,
	type TransportRequest,
	type TransportResponse,
} from "../src/index.js";

const policy: TransportGuardPolicy = {
	allowedHosts: ["api.example.com"],
	allowedPathPrefixes: ["/v1/", "/v9/projects/"],
	maxTimeoutMs: 15_000,
	maxResponseBytes: 1_024,
};

function request(overrides: Partial<TransportRequest> = {}): TransportRequest {
	return {
		method: "GET",
		url: "https://api.example.com/v1/projects",
		headers: { authorization: "Bearer sponsor-token" },
		timeoutMs: 5_000,
		maxResponseBytes: 512,
		...overrides,
	};
}

function reply(overrides: Partial<TransportResponse> = {}): TransportResponse {
	return { status: 200, headers: {}, body: "{}", ...overrides };
}

function stub(response: TransportResponse = reply()): {
	transport: HttpTransport;
	calls: TransportRequest[];
} {
	const calls: TransportRequest[] = [];
	return {
		calls,
		transport: async (sent) => {
			calls.push(sent);
			return response;
		},
	};
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		if (error instanceof TransportGuardError) return error.code;
		throw error;
	}
	throw new Error("expected the guarded transport to refuse");
}

describe("transport vocabularies", () => {
	it("expose the closed method set, frozen", () => {
		expect([...TRANSPORT_METHODS]).toEqual([
			"GET",
			"HEAD",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
		]);
		expect(Object.isFrozen(TRANSPORT_METHODS)).toBe(true);
	});

	it("expose every refusal code, frozen", () => {
		expect([...TRANSPORT_GUARD_ERROR_CODES]).toEqual([
			"TRANSPORT_SCHEME_FORBIDDEN",
			"TRANSPORT_HOST_FORBIDDEN",
			"TRANSPORT_PATH_FORBIDDEN",
			"TRANSPORT_TIMEOUT_EXCEEDED",
			"TRANSPORT_BODY_TOO_LARGE",
			"TRANSPORT_REDIRECT_REFUSED",
		]);
		expect(Object.isFrozen(TRANSPORT_GUARD_ERROR_CODES)).toBe(true);
	});
});

describe("guardTransport happy path", () => {
	it("forwards an allowlisted request unchanged and returns the reply", async () => {
		const { transport, calls } = stub(reply({ body: '{"id":"prj_1"}' }));
		const guarded = guardTransport(transport, policy);

		const response = await guarded(request());

		expect(response.body).toBe('{"id":"prj_1"}');
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.example.com/v1/projects");
		expect(calls[0]?.headers.authorization).toBe("Bearer sponsor-token");
	});

	it("accepts a request host that differs from the policy only by case, because WHATWG parsing normalizes the authority", async () => {
		const { transport, calls } = stub();
		const guarded = guardTransport(transport, policy);

		await guarded(request({ url: "https://API.Example.COM/v1/projects" }));

		expect(calls[0]?.url).toBe("https://api.example.com/v1/projects");
	});

	it("passes a 3xx without a Location through, because a 304 is a cache answer and not a redirect", async () => {
		const { transport } = stub(reply({ status: 304, body: "" }));
		const guarded = guardTransport(transport, policy);

		await expect(guarded(request())).resolves.toMatchObject({ status: 304 });
	});
});

describe("guardTransport refusals", () => {
	it.each([
		["http://api.example.com/v1/x", "plain http is never a provider origin"],
		["ftp://api.example.com/v1/x", "a non-web scheme"],
		["/v1/relative", "a relative url has no verified origin"],
		["", "an empty url"],
	])("refuses %s on the scheme (%s)", async (url) => {
		const guarded = guardTransport(stub().transport, policy);
		await expect(codeOf(() => guarded(request({ url })))).resolves.toBe(
			"TRANSPORT_SCHEME_FORBIDDEN",
		);
	});

	it.each([
		["https://evil.example.com/v1/x", "a host outside the allowlist"],
		["https://api.example.com.evil.test/v1/x", "a suffix-extended lookalike"],
		["https://api.example.com./v1/x", "a trailing-dot absolute name"],
		["https://api.example.com@evil.test/v1/x", "userinfo hiding the real host"],
		["https://api.example.com:8443/v1/x", "a non-default port"],
	])("refuses %s on the host (%s)", async (url) => {
		const guarded = guardTransport(stub().transport, policy);
		await expect(codeOf(() => guarded(request({ url })))).resolves.toBe(
			"TRANSPORT_HOST_FORBIDDEN",
		);
	});

	it("refuses a policy host that differs only by case, rather than repairing the config", async () => {
		const guarded = guardTransport(stub().transport, {
			...policy,
			allowedHosts: ["API.Example.com"],
		});

		await expect(codeOf(() => guarded(request()))).resolves.toBe(
			"TRANSPORT_HOST_FORBIDDEN",
		);
	});

	it.each([
		["https://api.example.com/admin", "a path outside every prefix"],
		["https://api.example.com/v1/../admin", "a resolved .. escape"],
		["https://api.example.com/v1/%2e%2e/admin", "an encoded .. escape"],
		["https://api.example.com/v1/a%2fb/../../admin", "an encoded separator"],
	])("refuses %s on the path (%s)", async (url) => {
		const guarded = guardTransport(stub().transport, policy);
		await expect(codeOf(() => guarded(request({ url })))).resolves.toBe(
			"TRANSPORT_PATH_FORBIDDEN",
		);
	});

	it.each([
		[15_001, "one millisecond over the cap"],
		[Number.POSITIVE_INFINITY, "an infinite timeout"],
		[0, "a zero timeout"],
		[-1, "a negative timeout"],
	])("refuses timeoutMs %s (%s)", async (timeoutMs) => {
		const guarded = guardTransport(stub().transport, policy);
		await expect(codeOf(() => guarded(request({ timeoutMs })))).resolves.toBe(
			"TRANSPORT_TIMEOUT_EXCEEDED",
		);
	});

	it("never reaches the inner transport when the timeout is over cap", async () => {
		const { transport, calls } = stub();
		const guarded = guardTransport(transport, policy);

		await expect(
			guarded(request({ timeoutMs: 60_000 })),
		).rejects.toBeInstanceOf(TransportGuardError);
		expect(calls).toHaveLength(0);
	});

	it("refuses a request asking for a larger body than the policy cap", async () => {
		const guarded = guardTransport(stub().transport, policy);
		await expect(
			codeOf(() => guarded(request({ maxResponseBytes: 4_096 }))),
		).resolves.toBe("TRANSPORT_BODY_TOO_LARGE");
	});

	it("refuses an oversize response body", async () => {
		const guarded = guardTransport(
			stub(reply({ body: "x".repeat(513) })).transport,
			policy,
		);
		await expect(codeOf(() => guarded(request()))).resolves.toBe(
			"TRANSPORT_BODY_TOO_LARGE",
		);
	});

	it("counts utf-8 bytes rather than code units, so a multibyte body cannot slip under the cap", async () => {
		// 200 four-byte code points = 800 bytes, but only 400 UTF-16 units.
		const guarded = guardTransport(
			stub(reply({ body: "\u{1f600}".repeat(200) })).transport,
			policy,
		);
		await expect(
			codeOf(() => guarded(request({ maxResponseBytes: 512 }))),
		).resolves.toBe("TRANSPORT_BODY_TOO_LARGE");
	});

	it("refuses a declared content-length over the cap before reading the body", async () => {
		const guarded = guardTransport(
			stub(reply({ headers: { "Content-Length": "99999" } })).transport,
			policy,
		);
		await expect(codeOf(() => guarded(request()))).resolves.toBe(
			"TRANSPORT_BODY_TOO_LARGE",
		);
	});

	it.each([
		301, 302, 307, 308,
	])("refuses a %s carrying a Location instead of following it", async (status) => {
		const guarded = guardTransport(
			stub(reply({ status, headers: { Location: "https://evil.test/steal" } }))
				.transport,
			policy,
		);
		await expect(codeOf(() => guarded(request()))).resolves.toBe(
			"TRANSPORT_REDIRECT_REFUSED",
		);
	});

	it("never echoes the redirect target, which is attacker-controlled text", async () => {
		const guarded = guardTransport(
			stub(
				reply({
					status: 302,
					headers: { location: "https://evil.test/steal" },
				}),
			).transport,
			policy,
		);
		const error = await guarded(request()).catch((cause: unknown) => cause);

		expect((error as TransportGuardError).message).toMatch(/never follows/u);
		expect((error as TransportGuardError).message).not.toMatch(/evil\.test/u);
	});

	it("carries the code on a TransportGuardError, named for a caller that branches on it", async () => {
		const guarded = guardTransport(stub().transport, policy);
		const error = await guarded(
			request({ url: "http://api.example.com/v1/x" }),
		).catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(TransportGuardError);
		expect(error).toBeInstanceOf(Error);
		expect((error as TransportGuardError).name).toBe("TransportGuardError");
		expect((error as TransportGuardError).code).toBe(
			"TRANSPORT_SCHEME_FORBIDDEN",
		);
	});

	it("refuses everything when the allowlists are empty, rather than reading empty as permissive", async () => {
		const guarded = guardTransport(stub().transport, {
			...policy,
			allowedHosts: [],
			allowedPathPrefixes: [],
		});

		await expect(codeOf(() => guarded(request()))).resolves.toBe(
			"TRANSPORT_HOST_FORBIDDEN",
		);
	});

	it("calls the injected transport exactly once and never a second origin", async () => {
		const { transport, calls } = stub();
		const guarded = guardTransport(transport, policy);

		await guarded(request());

		expect(calls).toHaveLength(1);
	});
});
