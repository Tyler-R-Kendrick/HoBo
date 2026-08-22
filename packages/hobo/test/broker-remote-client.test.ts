/**
 * The remote broker client.
 *
 * Three operations — anonymous session, place, claim — each of which crosses the
 * network and comes back as a *parsed* record rather than a response. The
 * parsing is the point: nothing downstream re-checks a broker's payload, so a
 * field this parser lets through is treated as real for the rest of the deploy.
 * A missing `primaryUrl` accepted as an empty string produces a deployment
 * receipt naming an address nobody can open, discovered by whoever tries.
 *
 * Two properties are worth stating up front.
 *
 * **A claim token is bearer authority over a deployment.** Whoever holds it can
 * take ownership. That is why the claim path distinguishes a 401/403 with its
 * own code — an invalid token and a broker that is simply unwell demand opposite
 * responses, and collapsing them would have a caller retry a token that will
 * never work, or discard one that would have.
 *
 * **Discovery is fetched once and cached.** A client that re-discovered per call
 * could be repointed mid-deploy by a changed document, so that place and claim
 * for one deployment went to two different brokers.
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteBrokerClient,
	RemoteBrokerClientError,
} from "../src/broker-remote-client.js";
import type { JsonValue } from "../src/json.js";

const BROKER = "https://broker.example";

const DISCOVERY = {
	brokerId: "broker-1",
	supportsAnonymous: true,
	anonymousSessionEndpoint: "/v1/anonymous-session",
	placeEndpoint: "/v1/place",
	claimEndpoint: "/v1/claim",
} as never;

const CREDENTIAL = {
	scheme: "bearer",
	token: "tok-1",
	principal: { id: "user-1", kind: "user" },
} as never;

/** A discovery client answering with a fixed document. */
function discoveryFor(document: unknown = DISCOVERY) {
	let calls = 0;
	return {
		client: {
			async discover() {
				calls += 1;
				return document as never;
			},
		} as never,
		get calls() {
			return calls;
		},
	};
}

/** A fetch stand-in recording requests and answering from a queue. */
function fetchStub(
	responses: ReadonlyArray<{
		ok?: boolean;
		status?: number;
		json?: unknown;
		jsonThrows?: boolean;
	}>,
) {
	const seen: Array<{ url: string; init: RequestInit }> = [];
	let index = 0;
	const impl = (async (url: string, init: RequestInit) => {
		seen.push({ url, init });
		const next = responses[Math.min(index, responses.length - 1)];
		index += 1;
		return {
			ok: next?.ok ?? true,
			status: next?.status ?? 200,
			json: async () => {
				if (next?.jsonThrows) throw new Error("not json");
				// `Object.hasOwn`, not `?? {}` — a deliberate `null` payload has to
				// reach the parser as null so its own refusal is what fires.
				return next && Object.hasOwn(next, "json") ? next.json : {};
			},
		};
	}) as unknown as typeof fetch;
	return { impl, seen };
}

const SESSION_PAYLOAD = {
	ephemeralPrincipal: { id: "anon-1", kind: "ephemeral" },
	accessToken: "at-1",
	claimToken: "ct-1",
	claimUrl: "https://broker.example/claim/ct-1",
	primaryUrl: "https://app.example",
	expiresAt: "2026-01-01T00:00:00.000Z",
	deploymentId: "dep-1",
};

const PLACE_PAYLOAD = {
	deploymentId: "dep-1",
	primaryUrl: "https://app.example",
	brokerId: "broker-1",
};

const CLAIM_PAYLOAD = {
	deploymentId: "dep-1",
	owner: { id: "user-1", kind: "user" },
	primaryUrl: "https://app.example",
};

function client(
	responses: Parameters<typeof fetchStub>[0] = [],
	document: unknown = DISCOVERY,
) {
	const discovery = discoveryFor(document);
	const fetched = fetchStub(responses);
	return {
		client: createRemoteBrokerClient({
			brokerUri: BROKER,
			discovery: discovery.client,
			fetchImpl: fetched.impl,
		}),
		discovery,
		seen: fetched.seen,
	};
}

describe("construction", () => {
	it("strips trailing slashes from the broker URI", () => {
		// Endpoints are joined onto this. Without the strip the URL would contain
		// `//`, which some gateways normalise and others route differently — a
		// difference that shows up in one environment only.
		expect(
			createRemoteBrokerClient({
				brokerUri: `${BROKER}///`,
				discovery: discoveryFor().client,
			}).brokerUri,
		).toBe(BROKER);
	});

	it("reports the broker it was built for", () => {
		expect(client().client.brokerUri).toBe(BROKER);
	});

	it("caches discovery across calls", async () => {
		// A client that re-discovered per call could be repointed mid-deploy, so
		// that place and claim for one deployment reached two different brokers.
		const { client: remote, discovery } = client([
			{ json: SESSION_PAYLOAD },
			{ json: PLACE_PAYLOAD },
		]);
		await remote.discover();
		await remote.discover();
		await remote.createAnonymousSession();
		expect(discovery.calls).toBe(1);
	});
});

describe("createAnonymousSession", () => {
	it("returns the parsed session", async () => {
		const { client: remote } = client([{ json: SESSION_PAYLOAD }]);
		const session = await remote.createAnonymousSession();
		expect(session.deploymentId).toBe("dep-1");
		expect(session.ephemeralPrincipal.id).toBe("anon-1");
		expect(session.claimToken).toBe("ct-1");
	});

	it("refuses when the broker does not advertise anonymous support", async () => {
		// Checked before the request, not after. Posting to an endpoint the
		// broker never advertised would produce a 404 that reads as an outage.
		const { client: remote, seen } = client([], {
			...DISCOVERY,
			supportsAnonymous: false,
		});
		try {
			await remote.createAnonymousSession();
			expect.unreachable("an unsupported broker must be refused");
		} catch (error) {
			expect((error as RemoteBrokerClientError).code).toBe(
				"HOBO_ANON_NOT_SUPPORTED",
			);
			expect(
				(error as RemoteBrokerClientError).data as Record<string, unknown>,
			).toMatchObject({ brokerId: "broker-1" });
		}
		expect(seen).toEqual([]);
	});

	it("posts the bindle name, defaulting it rather than omitting it", async () => {
		// The broker records what was deployed. An absent name would produce a
		// session attributed to nothing; `"unknown"` at least says so honestly.
		const { client: remote, seen } = client([{ json: SESSION_PAYLOAD }]);
		await remote.createAnonymousSession();
		expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
			bindleName: "unknown",
		});
	});

	it("carries a stated bindle name", async () => {
		const { client: remote, seen } = client([{ json: SESSION_PAYLOAD }]);
		await remote.createAnonymousSession({ bindleName: "shop" });
		expect(JSON.parse(String(seen[0]?.init.body)).bindleName).toBe("shop");
	});

	it("resolves a relative endpoint against the broker URI", async () => {
		const { client: remote, seen } = client([{ json: SESSION_PAYLOAD }]);
		await remote.createAnonymousSession();
		expect(seen[0]?.url).toBe(`${BROKER}/v1/anonymous-session`);
	});

	it("honours an absolute endpoint the broker advertised", async () => {
		// A broker may serve its session endpoint on a different host. Prefixing
		// the broker URI onto an absolute URL would produce nonsense.
		const { client: remote, seen } = client([{ json: SESSION_PAYLOAD }], {
			...DISCOVERY,
			anonymousSessionEndpoint: "https://auth.example/session",
		});
		await remote.createAnonymousSession();
		expect(seen[0]?.url).toBe("https://auth.example/session");
	});

	it("joins an endpoint that omits its leading slash", async () => {
		const { client: remote, seen } = client([{ json: SESSION_PAYLOAD }], {
			...DISCOVERY,
			anonymousSessionEndpoint: "v1/session",
		});
		await remote.createAnonymousSession();
		expect(seen[0]?.url).toBe(`${BROKER}/v1/session`);
	});

	it("reports a failed request with the status", async () => {
		const { client: remote } = client([{ ok: false, status: 503 }]);
		try {
			await remote.createAnonymousSession();
			expect.unreachable("a 503 must be reported");
		} catch (error) {
			expect((error as RemoteBrokerClientError).code).toBe(
				"HOBO_ANON_SESSION_FAILED",
			);
			expect((error as Error).message).toContain("503");
		}
	});

	it("defaults the TTL rather than reporting an unbounded session", async () => {
		// A session with no TTL would be treated as permanent by whatever
		// reclaims them, and an anonymous deployment would outlive its lane.
		const { client: remote } = client([{ json: SESSION_PAYLOAD }]);
		expect((await remote.createAnonymousSession()).ttlSeconds).toBe(3600);
	});

	it("honours a TTL the broker stated", async () => {
		const { client: remote } = client([
			{ json: { ...SESSION_PAYLOAD, ttlSeconds: 900 } },
		]);
		expect((await remote.createAnonymousSession()).ttlSeconds).toBe(900);
	});

	it("defaults restrictions to an empty list", async () => {
		// Not undefined: every consumer iterates restrictions, and one would
		// forget the nullish guard.
		const { client: remote } = client([{ json: SESSION_PAYLOAD }]);
		expect((await remote.createAnonymousSession()).restrictions).toEqual([]);
	});

	it("keeps only string restrictions from a mixed list", async () => {
		// A restriction that is not a string cannot be matched against anything,
		// and carrying it would put an unenforceable entry in a policy list that
		// reads as enforced.
		const { client: remote } = client([
			{ json: { ...SESSION_PAYLOAD, restrictions: ["no-egress", 7, null] } },
		]);
		expect((await remote.createAnonymousSession()).restrictions).toEqual([
			"no-egress",
		]);
	});

	it("refuses a payload that is not an object", async () => {
		for (const json of [null, "session", 7, undefined]) {
			const { client: remote } = client([{ json }]);
			await expect(remote.createAnonymousSession()).rejects.toMatchObject({
				code: "HOBO_ANON_SESSION_INVALID",
			});
		}
	});

	it("refuses a payload with no usable ephemeral principal", async () => {
		// The principal is who the deployment is attributed to. An absent or
		// malformed one produces a deployment belonging to nobody.
		for (const ephemeralPrincipal of [
			undefined,
			null,
			{},
			{ id: "anon-1" },
			{ kind: "ephemeral" },
			{ id: 7, kind: "ephemeral" },
		]) {
			const { client: remote } = client([
				{ json: { ...SESSION_PAYLOAD, ephemeralPrincipal } },
			]);
			await expect(remote.createAnonymousSession()).rejects.toMatchObject({
				code: "HOBO_ANON_SESSION_INVALID",
			});
		}
	});

	it("refuses a payload missing any required string field", async () => {
		// Each of these is a locator or a credential. An empty one accepted here
		// becomes a receipt naming an address nobody can open, or a claim URL
		// that leads nowhere.
		for (const field of [
			"accessToken",
			"claimToken",
			"claimUrl",
			"primaryUrl",
			"expiresAt",
			"deploymentId",
		]) {
			const { client: remote } = client([
				{ json: { ...SESSION_PAYLOAD, [field]: undefined } },
			]);
			await expect(remote.createAnonymousSession()).rejects.toMatchObject({
				code: "HOBO_REMOTE_PAYLOAD_INVALID",
			});
		}
	});

	it("treats an empty string as missing", async () => {
		// `value.length === 0`. An empty primaryUrl is not a shorter address, it
		// is no address.
		const { client: remote } = client([
			{ json: { ...SESSION_PAYLOAD, primaryUrl: "" } },
		]);
		await expect(remote.createAnonymousSession()).rejects.toMatchObject({
			code: "HOBO_REMOTE_PAYLOAD_INVALID",
		});
	});

	it("names the missing field in the message", async () => {
		// So the operator knows which of six fields the broker omitted rather
		// than that one of them was.
		const { client: remote } = client([
			{ json: { ...SESSION_PAYLOAD, claimUrl: undefined } },
		]);
		await expect(remote.createAnonymousSession()).rejects.toThrow(
			/missing field claimUrl/u,
		);
	});
});

describe("place", () => {
	const REQUEST = {
		bindleName: "shop",
		projectDir: "/work/shop",
		credential: CREDENTIAL,
	} as never;

	it("returns the parsed placement", async () => {
		const { client: remote } = client([{ json: PLACE_PAYLOAD }]);
		const result = await remote.place(REQUEST);
		expect(result.deploymentId).toBe("dep-1");
		expect(result.primaryUrl).toBe("https://app.example");
		expect(result.brokerId).toBe("broker-1");
	});

	it("sends the credential as an authorization header", async () => {
		// The credential is what the broker authorises the placement against.
		// Sending it in the body instead would put it in request logs.
		const { client: remote, seen } = client([{ json: PLACE_PAYLOAD }]);
		await remote.place(REQUEST);
		const headers = seen[0]?.init.headers as Record<string, string>;
		expect(Object.keys(headers).map((k) => k.toLowerCase())).toContain(
			"authorization",
		);
	});

	it("does not put the credential in the request body", async () => {
		const { client: remote, seen } = client([{ json: PLACE_PAYLOAD }]);
		await remote.place(REQUEST);
		expect(String(seen[0]?.init.body)).not.toContain("tok-1");
	});

	it("sends an explicit null camp rather than omitting it", async () => {
		// Absent and null mean different things to a broker that treats a missing
		// key as "use my default". Being explicit says the caller expressed no
		// preference.
		const { client: remote, seen } = client([{ json: PLACE_PAYLOAD }]);
		await remote.place(REQUEST);
		expect(JSON.parse(String(seen[0]?.init.body)).camp).toBeNull();
	});

	it("normalizes anonymous to a strict boolean", async () => {
		// `=== true`. A truthy-but-not-true value from a caller would otherwise
		// reach the broker as something other than a boolean, and a strict broker
		// would reject the whole request.
		const { client: remote, seen } = client([{ json: PLACE_PAYLOAD }]);
		await remote.place({ ...REQUEST, anonymous: "yes" } as never);
		expect(JSON.parse(String(seen[0]?.init.body)).anonymous).toBe(false);
	});

	it("carries anonymous through when it is genuinely true", async () => {
		const { client: remote, seen } = client([{ json: PLACE_PAYLOAD }]);
		await remote.place({ ...REQUEST, anonymous: true } as never);
		expect(JSON.parse(String(seen[0]?.init.body)).anonymous).toBe(true);
	});

	it("attributes the placement to the presented principal", async () => {
		// Taken from the credential rather than the response. A broker echoing a
		// different principal must not be able to reattribute a deployment to
		// somebody who did not make it.
		const { client: remote } = client([
			{ json: { ...PLACE_PAYLOAD, principal: { id: "other", kind: "user" } } },
		]);
		const result = await remote.place(REQUEST);
		expect(result.principal).toEqual({ id: "user-1", kind: "user" });
		expect(result.credentialScheme).toBe("bearer");
	});

	it("carries a human principal only when the credential had one", async () => {
		// The on-behalf-of case. An empty humanPrincipal key would read as a
		// human having authorised something no human touched.
		const { client: plain } = client([{ json: PLACE_PAYLOAD }]);
		expect(Object.hasOwn(await plain.place(REQUEST), "humanPrincipal")).toBe(
			false,
		);

		const { client: onBehalf } = client([{ json: PLACE_PAYLOAD }]);
		const result = await onBehalf.place({
			...REQUEST,
			credential: {
				...CREDENTIAL,
				humanPrincipal: { id: "human-1", kind: "user" },
			},
		} as never);
		expect(result.humanPrincipal).toEqual({ id: "human-1", kind: "user" });
	});

	it("defaults the status to deployed", async () => {
		const { client: remote } = client([{ json: PLACE_PAYLOAD }]);
		expect((await remote.place(REQUEST)).status).toBe("deployed");
	});

	it("honours a status the broker reported", async () => {
		const { client: remote } = client([
			{ json: { ...PLACE_PAYLOAD, status: "pending" } },
		]);
		expect((await remote.place(REQUEST)).status).toBe("pending");
	});

	it("defaults resources to an empty map", async () => {
		const { client: remote } = client([{ json: PLACE_PAYLOAD }]);
		expect((await remote.place(REQUEST)).resources).toEqual({});
	});

	it("ignores a resources value that is not an object", async () => {
		// A string here would otherwise be indexed character by character by
		// whatever read it.
		const { client: remote } = client([
			{ json: { ...PLACE_PAYLOAD, resources: "db" } },
		]);
		expect((await remote.place(REQUEST)).resources).toEqual({});
	});

	it("omits the optional claim fields when the broker sent none", async () => {
		// Conditional spread. A `claimToken: undefined` key would read to a
		// receipt writer as a claim token that exists and is blank.
		const result = await client([{ json: PLACE_PAYLOAD }]).client.place(
			REQUEST,
		);
		for (const field of ["claimToken", "claimUrl", "expiresAt", "ttlSeconds"]) {
			expect(Object.hasOwn(result, field)).toBe(false);
		}
	});

	it("carries the optional claim fields when the broker sent them", async () => {
		const { client: remote } = client([
			{
				json: {
					...PLACE_PAYLOAD,
					claimToken: "ct-1",
					claimUrl: "https://broker.example/claim/ct-1",
					expiresAt: "2026-01-01T00:00:00.000Z",
					ttlSeconds: 900,
				},
			},
		]);
		const result = await remote.place(REQUEST);
		expect(result.claimToken).toBe("ct-1");
		expect(result.ttlSeconds).toBe(900);
	});

	it("ignores an optional field of the wrong type rather than carrying it", async () => {
		// A numeric ttlSeconds is required; a string one is a contract drift that
		// would otherwise be arithmetic'd on somewhere downstream.
		const { client: remote } = client([
			{ json: { ...PLACE_PAYLOAD, ttlSeconds: "900", claimToken: 7 } },
		]);
		const result = await remote.place(REQUEST);
		expect(Object.hasOwn(result, "ttlSeconds")).toBe(false);
		expect(Object.hasOwn(result, "claimToken")).toBe(false);
	});

	it("reports the broker's own message on a failure", async () => {
		// The broker knows why it refused. Replacing its message with a generic
		// one would send an operator to the wrong place.
		const { client: remote } = client([
			{ ok: false, status: 400, json: { message: "camp is at capacity" } },
		]);
		try {
			await remote.place(REQUEST);
			expect.unreachable("a 400 must be reported");
		} catch (error) {
			expect((error as Error).message).toBe("camp is at capacity");
			expect((error as RemoteBrokerClientError).code).toBe(
				"HOBO_REMOTE_PLACE_FAILED",
			);
		}
	});

	it("falls back to the status when the broker sent no message", async () => {
		const { client: remote } = client([{ ok: false, status: 502, json: {} }]);
		await expect(remote.place(REQUEST)).rejects.toThrow(/HTTP 502/u);
	});

	it("survives an error body that is not JSON at all", async () => {
		// `.catch(() => ({}))`. A gateway's HTML error page must not turn a
		// reportable failure into an unrelated parse error.
		const { client: remote } = client([
			{ ok: false, status: 502, jsonThrows: true },
		]);
		await expect(remote.place(REQUEST)).rejects.toThrow(/HTTP 502/u);
	});

	it("carries the broker's error body as structured data", async () => {
		// So a caller can branch on what the broker said rather than on its
		// prose.
		const { client: remote } = client([
			{ ok: false, status: 400, json: { message: "no", retryAfter: 30 } },
		]);
		try {
			await remote.place(REQUEST);
			expect.unreachable("a 400 must be reported");
		} catch (error) {
			expect(
				(error as RemoteBrokerClientError).data as Record<string, unknown>,
			).toMatchObject({ retryAfter: 30 });
		}
	});

	it("refuses a success payload that is not an object", async () => {
		for (const json of [null, "ok", 7]) {
			const { client: remote } = client([{ json }]);
			await expect(remote.place(REQUEST)).rejects.toMatchObject({
				code: "HOBO_REMOTE_PLACE_INVALID",
			});
		}
	});

	it("refuses a success payload missing a required locator", async () => {
		for (const field of ["deploymentId", "primaryUrl", "brokerId"]) {
			const { client: remote } = client([
				{ json: { ...PLACE_PAYLOAD, [field]: undefined } },
			]);
			await expect(remote.place(REQUEST)).rejects.toMatchObject({
				code: "HOBO_REMOTE_PAYLOAD_INVALID",
			});
		}
	});
});

describe("claim", () => {
	const REQUEST = { claimToken: "ct-1", account: "acme" } as never;

	it("returns the parsed claim", async () => {
		const { client: remote } = client([{ json: CLAIM_PAYLOAD }]);
		const result = await remote.claim(REQUEST);
		expect(result.deploymentId).toBe("dep-1");
		expect(result.owner).toEqual({ id: "user-1", kind: "user" });
	});

	it("posts the claim token and the account", async () => {
		const { client: remote, seen } = client([{ json: CLAIM_PAYLOAD }]);
		await remote.claim(REQUEST);
		expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
			claimToken: "ct-1",
			account: "acme",
		});
	});

	it("claims without a credential, because the token is the authority", async () => {
		// The whole point of a claim token: an anonymous deployment is claimed by
		// whoever holds it, before any account credential exists. Requiring one
		// would make the anonymous lane unclaimable.
		const { client: remote, seen } = client([{ json: CLAIM_PAYLOAD }]);
		await remote.claim(REQUEST);
		const headers = seen[0]?.init.headers as Record<string, string>;
		expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
			"authorization",
		);
	});

	it("adds an authorization header when a credential was supplied", async () => {
		const { client: remote, seen } = client([{ json: CLAIM_PAYLOAD }]);
		await remote.claim({ ...REQUEST, credential: CREDENTIAL } as never);
		const headers = seen[0]?.init.headers as Record<string, string>;
		expect(Object.keys(headers).map((k) => k.toLowerCase())).toContain(
			"authorization",
		);
	});

	it("distinguishes an invalid token from a broker failure", async () => {
		// The consequential branch. An invalid token will never work and a caller
		// should stop; a 500 is worth retrying. One code for both would have a
		// caller do the wrong thing in one of the two cases.
		for (const status of [401, 403]) {
			const { client: remote } = client([{ ok: false, status, json: {} }]);
			await expect(remote.claim(REQUEST)).rejects.toMatchObject({
				code: "HOBO_CLAIM_TOKEN_INVALID",
			});
		}
		const { client: remote } = client([{ ok: false, status: 500, json: {} }]);
		await expect(remote.claim(REQUEST)).rejects.toMatchObject({
			code: "HOBO_REMOTE_CLAIM_FAILED",
		});
	});

	it("prefers a code the broker supplied over the status heuristic", async () => {
		// The broker knows more than the status does. A 403 carrying
		// `HOBO_CLAIM_EXPIRED` means issue a new token, not fix this one.
		const { client: remote } = client([
			{ ok: false, status: 403, json: { code: "HOBO_CLAIM_EXPIRED" } },
		]);
		await expect(remote.claim(REQUEST)).rejects.toMatchObject({
			code: "HOBO_CLAIM_EXPIRED",
		});
	});

	it("survives a non-JSON error body", async () => {
		const { client: remote } = client([
			{ ok: false, status: 500, jsonThrows: true },
		]);
		await expect(remote.claim(REQUEST)).rejects.toThrow(/HTTP 500/u);
	});

	it("refuses a payload with no owner", async () => {
		// A claim result is a statement about who now owns a deployment. Without
		// an owner it states nothing, and accepting it would report a successful
		// claim by nobody.
		for (const owner of [undefined, null, {}, { kind: "user" }, { id: 7 }]) {
			const { client: remote } = client([
				{ json: { ...CLAIM_PAYLOAD, owner } },
			]);
			await expect(remote.claim(REQUEST)).rejects.toMatchObject({
				code: "HOBO_REMOTE_CLAIM_INVALID",
			});
		}
	});

	it("refuses a payload that is not an object", async () => {
		for (const json of [null, "claimed", 7]) {
			const { client: remote } = client([{ json }]);
			await expect(remote.claim(REQUEST)).rejects.toMatchObject({
				code: "HOBO_REMOTE_CLAIM_INVALID",
			});
		}
	});

	it("reports a null previous owner for a first claim", async () => {
		// Null rather than absent: a first claim is a distinct fact from a
		// transfer, and a receipt has to be able to say which happened.
		const { client: remote } = client([{ json: CLAIM_PAYLOAD }]);
		expect((await remote.claim(REQUEST)).previousOwner).toBeNull();
	});

	it("carries a previous owner on a transfer", async () => {
		const { client: remote } = client([
			{
				json: {
					...CLAIM_PAYLOAD,
					previousOwner: { id: "user-0", kind: "user" },
				},
			},
		]);
		expect((await remote.claim(REQUEST)).previousOwner).toEqual({
			id: "user-0",
			kind: "user",
		});
	});

	it("normalizes alreadyClaimed to a strict boolean", async () => {
		// `=== true`. Whether a claim was a no-op decides what the CLI tells the
		// user, and a truthy string would report a re-claim as a fresh one.
		const { client: yes } = client([
			{ json: { ...CLAIM_PAYLOAD, alreadyClaimed: true } },
		]);
		expect((await yes.claim(REQUEST)).alreadyClaimed).toBe(true);
		for (const alreadyClaimed of ["true", 1, undefined, null]) {
			const { client: no } = client([
				{ json: { ...CLAIM_PAYLOAD, alreadyClaimed } },
			]);
			expect((await no.claim(REQUEST)).alreadyClaimed).toBe(false);
		}
	});

	it("defaults the status to claimed", async () => {
		const { client: remote } = client([{ json: CLAIM_PAYLOAD }]);
		expect((await remote.claim(REQUEST)).status).toBe("claimed");
	});

	it("refuses a payload missing a required locator", async () => {
		for (const field of ["deploymentId", "primaryUrl"]) {
			const { client: remote } = client([
				{ json: { ...CLAIM_PAYLOAD, [field]: undefined } },
			]);
			await expect(remote.claim(REQUEST)).rejects.toMatchObject({
				code: "HOBO_REMOTE_PAYLOAD_INVALID",
			});
		}
	});
});

describe("RemoteBrokerClientError", () => {
	it("carries a code callers branch on", () => {
		const error = new RemoteBrokerClientError("boom", "HOBO_X");
		expect(error.code).toBe("HOBO_X");
		expect(error.name).toBe("RemoteBrokerClientError");
	});

	it("omits data entirely when there is none", () => {
		// Absent rather than an empty object, so a reader can tell "the broker
		// said nothing" from "the broker sent an empty body".
		expect(new RemoteBrokerClientError("boom", "HOBO_X").data).toBeUndefined();
	});

	it("carries structured data when given", () => {
		expect(
			new RemoteBrokerClientError("boom", "HOBO_X", { retryAfter: 30 }).data,
		).toEqual({ retryAfter: 30 });
	});
});
