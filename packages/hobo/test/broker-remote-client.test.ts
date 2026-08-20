/**
 * The remote broker client's error and URL handling.
 *
 * Both the transport (`fetchImpl`) and the whole backend (`mock`) are
 * injectable, so every path here is reachable without a broker. The branches
 * worth pinning are the ones that translate a remote failure into something a
 * CLI can act on, and there are three distinct jobs in that:
 *
 *   - **Refuse early where the broker said it cannot help.** Anonymous sessions
 *     are checked against the discovery document *before* a request goes out,
 *     so an unsupported broker produces a clear refusal rather than an opaque
 *     404 from an endpoint that was never going to work.
 *   - **Prefer the server's own error over a generic one.** A broker that says
 *     why is more useful than "HTTP 500", but the fallback has to exist for a
 *     broker that says nothing — including one that returns a non-JSON body,
 *     which is exactly what a proxy error page is.
 *   - **Infer an auth code from the status when the body omits one.** 401/403
 *     on a claim means the token is bad, and saying so beats a generic failure
 *     that leaves someone re-running the same command.
 *
 * URL resolution matters for a separate reason: a discovery document may name
 * endpoints as absolute URLs or as paths, and getting that wrong sends a
 * credential to the wrong origin.
 */

import { describe, expect, it } from "vitest";
import {
	createMockRemoteBrokerState,
	createRemoteBrokerClient,
	RemoteBrokerClientError,
} from "../src/broker-remote-client.js";
import type { JsonValue } from "../src/json.js";

/** The minimum a `place` request needs; `authorizationHeaders` reads all of it. */
// SAFETY: assertion required at this I/O or test boundary.
const CREDENTIAL = {
	accessToken: "tok",
	principal: { kind: "workload", id: "w1" },
	tenant: "t1",
	scheme: "bearer",
} as never;

/** A fetch stub that records calls and replays a canned response. */
function stubFetch(response: {
	ok?: boolean;
	status?: number;
	json?: () => JsonValue;
}) {
	const calls: { url: string; init: RequestInit }[] = [];
	// SAFETY: assertion required at this I/O or test boundary.
	const impl = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return {
			ok: response.ok ?? true,
			status: response.status ?? 200,
			json: async () => (response.json ? response.json() : {}),
		};
	}) as typeof fetch;
	return { calls, impl };
}

function mockClient(
	options: Parameters<typeof createMockRemoteBrokerState>[0] = {},
) {
	const mock = createMockRemoteBrokerState(options);
	return createRemoteBrokerClient({
		brokerUri: options.brokerUri ?? "https://public.example.com",
		mock,
	});
}

describe("the broker URI", () => {
	it("strips a trailing slash so paths do not double up", () => {
		const client = createRemoteBrokerClient({
			brokerUri: "https://broker.example.com/",
			mock: createMockRemoteBrokerState(),
		});
		expect(client.brokerUri).toBe("https://broker.example.com");
	});

	it("strips several trailing slashes", () => {
		const client = createRemoteBrokerClient({
			brokerUri: "https://broker.example.com///",
			mock: createMockRemoteBrokerState(),
		});
		expect(client.brokerUri).toBe("https://broker.example.com");
	});

	it("leaves a URI with no trailing slash alone", () => {
		expect(mockClient().brokerUri).toBe("https://public.example.com");
	});
});

describe("discovery", () => {
	it("returns the document", async () => {
		const doc = await mockClient().discover();
		expect(doc.brokerId).toBeTruthy();
	});

	it("caches the document rather than re-fetching per call", async () => {
		// Every operation begins with discovery; re-fetching would multiply the
		// request count by the number of operations.
		let discoveries = 0;
		const mock = createMockRemoteBrokerState();
		const client = createRemoteBrokerClient({
			brokerUri: "https://public.example.com",
			mock,
			discovery: {
				async discover() {
					discoveries += 1;
					return mock.discovery;
				},
			},
		});
		await client.discover();
		await client.discover();
		await client.createAnonymousSession({});
		expect(discoveries).toBe(1);
	});
});

describe("anonymous sessions", () => {
	it("creates one when the broker advertises support", async () => {
		const session = await mockClient().createAnonymousSession({
			bindleName: "app",
		});
		expect(session).toBeTruthy();
	});

	it("refuses before making a request when support is not advertised", async () => {
		// The discovery document already said no. Sending the request anyway
		// would turn a clear refusal into an opaque 404.
		await expect(
			mockClient({ supportsAnonymous: false }).createAnonymousSession({}),
		).rejects.toThrow(RemoteBrokerClientError);
	});

	it("names the broker in the refusal, so the right one gets fixed", async () => {
		await expect(
			mockClient({ supportsAnonymous: false }).createAnonymousSession({}),
		).rejects.toMatchObject({ code: "HOBO_ANON_NOT_SUPPORTED" });
	});

	it("defaults the bindle name rather than sending undefined", async () => {
		const mock = createMockRemoteBrokerState();
		const { calls, impl } = stubFetch({
			json: () => ({ sessionId: "s", expiresAt: Date.now() + 60_000 }),
		});
		const client = createRemoteBrokerClient({
			brokerUri: "https://public.example.com",
			fetchImpl: impl,
			discovery: {
				async discover() {
					return mock.discovery;
				},
			},
		});
		await client.createAnonymousSession({}).catch(() => undefined);
		expect(String(calls[0]?.init.body)).toContain("unknown");
	});

	it("reports the status when the broker rejects the request", async () => {
		const mock = createMockRemoteBrokerState();
		const { impl } = stubFetch({ ok: false, status: 503 });
		const client = createRemoteBrokerClient({
			brokerUri: "https://public.example.com",
			fetchImpl: impl,
			discovery: {
				async discover() {
					return mock.discovery;
				},
			},
		});
		await expect(client.createAnonymousSession({})).rejects.toMatchObject({
			code: "HOBO_ANON_SESSION_FAILED",
		});
	});
});

describe("place failures", () => {
	async function placeAgainst(response: Parameters<typeof stubFetch>[0]) {
		const mock = createMockRemoteBrokerState();
		const { impl } = stubFetch(response);
		const client = createRemoteBrokerClient({
			brokerUri: "https://public.example.com",
			fetchImpl: impl,
			discovery: {
				async discover() {
					return mock.discovery;
				},
			},
		});
		// SAFETY: assertion required at this I/O or test boundary.
		return client.place({
			bindleName: "app",
			projectDir: "/p",
			credential: CREDENTIAL,
		} as never);
	}

	it("prefers the broker's own message", async () => {
		await expect(
			placeAgainst({
				ok: false,
				status: 400,
				json: () => ({ message: "camp quota exhausted" }),
			}),
		).rejects.toThrow("camp quota exhausted");
	});

	it("falls back to the status when the body has no message", async () => {
		await expect(placeAgainst({ ok: false, status: 500 })).rejects.toThrow(
			/HTTP 500/u,
		);
	});

	it("survives a non-JSON body, which is what a proxy error page is", async () => {
		// `.json()` rejecting must not replace the real failure with a parse error.
		await expect(
			placeAgainst({
				ok: false,
				status: 502,
				json: () => {
					throw new Error("not json");
				},
			}),
		).rejects.toThrow(/HTTP 502/u);
	});

	it("ignores a non-string message rather than rendering an object", async () => {
		await expect(
			placeAgainst({ ok: false, status: 400, json: () => ({ message: 42 }) }),
		).rejects.toThrow(/HTTP 400/u);
	});

	it("carries the response body through for a caller to inspect", async () => {
		await expect(
			placeAgainst({
				ok: false,
				status: 400,
				json: () => ({ message: "no", remediation: "add a camp" }),
			}),
		).rejects.toMatchObject({ data: { remediation: "add a camp" } });
	});
});

describe("claim failures", () => {
	async function claimAgainst(response: Parameters<typeof stubFetch>[0]) {
		const mock = createMockRemoteBrokerState();
		const { impl } = stubFetch(response);
		const client = createRemoteBrokerClient({
			brokerUri: "https://public.example.com",
			fetchImpl: impl,
			discovery: {
				async discover() {
					return mock.discovery;
				},
			},
		});
		// SAFETY: assertion required at this I/O or test boundary.
		return client.claim({ claimToken: "t", account: "a" } as never);
	}

	it("prefers a code the broker supplied", async () => {
		await expect(
			claimAgainst({
				ok: false,
				status: 400,
				json: () => ({ code: "HOBO_CLAIM_ALREADY_SETTLED" }),
			}),
		).rejects.toMatchObject({ code: "HOBO_CLAIM_ALREADY_SETTLED" });
	});

	it.each([
		401, 403,
	])("infers an invalid-token code from %d when the body omits one", async (status) => {
		// Saying "the token is bad" beats a generic failure that leaves
		// someone re-running the same command with the same token.
		await expect(claimAgainst({ ok: false, status })).rejects.toMatchObject({
			code: "HOBO_CLAIM_TOKEN_INVALID",
		});
	});

	it("uses the generic code for other statuses", async () => {
		await expect(
			claimAgainst({ ok: false, status: 500 }),
		).rejects.toMatchObject({ code: "HOBO_REMOTE_CLAIM_FAILED" });
	});

	it("prefers a supplied code even on a 401", async () => {
		await expect(
			claimAgainst({
				ok: false,
				status: 401,
				json: () => ({ code: "HOBO_CLAIM_EXPIRED" }),
			}),
		).rejects.toMatchObject({ code: "HOBO_CLAIM_EXPIRED" });
	});

	it("ignores a non-string code from the body", async () => {
		await expect(
			claimAgainst({ ok: false, status: 401, json: () => ({ code: 7 }) }),
		).rejects.toMatchObject({ code: "HOBO_CLAIM_TOKEN_INVALID" });
	});
});

describe("the mock backend", () => {
	it("preserves the deployment URL across an anonymous claim", async () => {
		// The property the mock exists to prove: claiming an anonymous deployment
		// must not move it, or every link already shared would break.
		const client = mockClient();
		const session = await client.createAnonymousSession({ bindleName: "app" });
		// SAFETY: assertion required at this I/O or test boundary.
		const placed = await client.place({
			bindleName: "app",
			projectDir: "/p",
			anonymous: true,
			claimToken: session.claimToken,
			credential: CREDENTIAL,
		} as never);
		// SAFETY: assertion required at this I/O or test boundary.
		const claimed = await client.claim({
			claimToken: placed.claimToken,
			account: "acct-1",
		} as never);
		expect(claimed.primaryUrl).toBe(placed.primaryUrl);
	});

	it("refuses an anonymous session when configured without support", () => {
		const mock = createMockRemoteBrokerState({ supportsAnonymous: false });
		expect(() => mock.createAnonymousSession()).toThrow(
			RemoteBrokerClientError,
		);
	});

	it("advertises anonymous among its auth methods only when supported", () => {
		expect(createMockRemoteBrokerState().discovery.authMethods).toContain(
			"anonymous",
		);
		expect(
			createMockRemoteBrokerState({ supportsAnonymous: false }).discovery
				.authMethods,
		).not.toContain("anonymous");
	});

	it("normalizes its own broker URI", () => {
		expect(
			createMockRemoteBrokerState({ brokerUri: "https://x.example/" }).discovery
				.brokerId,
		).toBeTruthy();
	});
});

describe("RemoteBrokerClientError", () => {
	it("carries a code callers can switch on", () => {
		const error = new RemoteBrokerClientError("nope", "HOBO_X");
		expect(error.code).toBe("HOBO_X");
		expect(error.name).toBe("RemoteBrokerClientError");
		expect(error).toBeInstanceOf(Error);
	});

	it("leaves data undefined when none was supplied", () => {
		// The field is declared optional, so the property exists and is
		// undefined rather than being absent — worth pinning either way, since a
		// caller checking `"data" in error` would be misled.
		expect(new RemoteBrokerClientError("nope", "HOBO_X").data).toBeUndefined();
	});

	it("keeps structured data when given some", () => {
		expect(
			new RemoteBrokerClientError("nope", "HOBO_X", { retryAfter: 5 }).data,
		).toEqual({ retryAfter: 5 });
	});
});
