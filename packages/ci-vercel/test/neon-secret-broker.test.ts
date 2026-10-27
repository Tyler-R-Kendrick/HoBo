import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createNeonBrokerEntry } from "../src/neon-broker-entry.js";
import {
	RuntimeBrokerConfig as BrokerSchema,
	createNeonSecretBroker,
	type RuntimeBrokerConfig,
} from "../src/neon-secret-broker.js";

const config: RuntimeBrokerConfig = {
	HOBO_CI_PUBLIC_URL: "https://hobo-ci.vercel.app",
	HOBO_CI_SESSION_KEY: Buffer.alloc(32, 3).toString("base64url"),
	HOBO_CI_BOOTSTRAP_ACCOUNT_ID: "account1",
	HOBO_CI_BOOTSTRAP_TOKEN_SHA256: "a".repeat(64),
	HOBO_CI_CONTROL_TOKENS_JSON: "[]",
	HOBO_CI_CONFIG_JSON: "{}",
	CRON_SECRET: "x".repeat(32),
};
const identity = {
	teamSlug: "example-team",
	teamId: "team_123",
	projectName: "hobo-ci",
	projectId: "prj_123",
	audience: "https://hobo-ci.vercel.app/internal/runtime-config",
};
const claims = {
	owner: identity.teamSlug,
	owner_id: identity.teamId,
	project: identity.projectName,
	project_id: identity.projectId,
	environment: "production",
};
const issuer = `https://oidc.vercel.com/${identity.teamSlug}`;
const subject = `owner:${identity.teamSlug}:project:${identity.projectName}:environment:production`;

async function fixture() {
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const jwk = await exportJWK(publicKey);
	jwk.kid = "test-key";
	jwk.alg = "RS256";
	const handler = createNeonSecretBroker({
		...identity,
		config,
		jwks: createLocalJWKSet({ keys: [jwk] }),
	});
	const token = async (
		overrides: Partial<typeof claims> = {},
		metadata: {
			iss?: string;
			aud?: string;
			sub?: string;
			exp?: string;
			nbf?: string;
			iat?: number;
		} = {},
	) =>
		new SignJWT({ ...claims, ...overrides })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(metadata.iss ?? issuer)
			.setAudience(metadata.aud ?? identity.audience)
			.setSubject(metadata.sub ?? subject)
			.setIssuedAt(metadata.iat ?? Math.floor(Date.now() / 1000))
			.setNotBefore(metadata.nbf ?? "-1s")
			.setExpirationTime(metadata.exp ?? "5m")
			.sign(privateKey);
	return { handler, token };
}
const request = (token: string, init: RequestInit & { duplex?: "half" } = {}) =>
	new Request("https://broker.example/v1/runtime-config", {
		method: "POST",
		...init,
		headers: { authorization: `Bearer ${token}`, ...init.headers },
	});

describe("Neon runtime secret broker", () => {
	it("fails closed without logging malformed secret environment", async () => {
		const entry = createNeonBrokerEntry({
			HOBO_BROKER_RUNTIME_CONFIG: "super-secret-invalid-json",
		});
		const response = await entry.fetch(request("invalid"));
		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe("");
	});
	it("returns only the strict configuration to the signed production project", async () => {
		const { handler, token } = await fixture();
		const response = await handler(request(await token()));
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ config });
	});
	it("accepts an empty streamed body and rejects nonempty or stalled streams", async () => {
		const { handler, token } = await fixture();
		const valid = await token();
		const streamRequest = (stream: ReadableStream<Uint8Array>) =>
			request(valid, { body: stream, duplex: "half" });
		const empty = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close();
			},
		});
		expect((await handler(streamRequest(empty))).status).toBe(200);
		const nonempty = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1]));
				controller.close();
			},
		});
		expect((await handler(streamRequest(nonempty))).status).toBe(404);
		const stalled = new ReadableStream<Uint8Array>({ start() {} });
		expect((await handler(streamRequest(stalled))).status).toBe(404);
	});
	it("authenticates before reading an untrusted stalled stream", async () => {
		const { handler } = await fixture();
		const stalled = new ReadableStream<Uint8Array>({ start() {} });
		const response = await handler(
			request("invalid", { body: stalled, duplex: "half" }),
		);
		expect(response.status).toBe(403);
		expect(stalled.locked).toBe(false);
	});
	it("rejects validly signed tokens for other identities, environments or audiences", async () => {
		const { handler, token } = await fixture();
		const tokens = await Promise.all([
			token({ owner_id: "team_other" }),
			token({ project_id: "prj_other" }),
			token({ environment: "preview" }),
			token({ owner: "other" }),
			token({ project: "other" }),
			token(
				{},
				{ sub: "owner:example-team:project:hobo-ci:environment:preview" },
			),
			token({}, { aud: "https://other.example" }),
			token({}, { iss: "https://oidc.vercel.com/other" }),
			token({}, { exp: "-1h" }),
			token({}, { nbf: "1h" }),
			token({}, { iat: Math.floor(Date.now() / 1000) - 360 }),
		]);
		for (const candidate of tokens)
			expect((await handler(request(candidate))).status).toBe(403);
	});
	it("rejects a forged signature, absent bearer, large bearer and unexpected requests", async () => {
		const { handler, token } = await fixture();
		const valid = await token();
		const pieces = valid.split(".");
		const { privateKey } = await generateKeyPair("RS256");
		const forged = await new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(issuer)
			.setAudience(identity.audience)
			.setSubject(subject)
			.setIssuedAt()
			.setNotBefore("-1s")
			.setExpirationTime("5m")
			.sign(privateKey);
		expect(pieces).toHaveLength(3);
		expect((await handler(request(forged))).status).toBe(403);
		expect(
			(
				await handler(
					new Request("https://broker.example/v1/runtime-config", {
						method: "POST",
					}),
				)
			).status,
		).toBe(403);
		expect((await handler(request("a".repeat(16385)))).status).toBe(403);
		expect((await handler(request(valid, { method: "GET" }))).status).toBe(404);
		expect((await handler(request(valid, { body: "x" }))).status).toBe(404);
	});
	it("rejects untrusted secret keys and a broker audience outside the configured origin", async () => {
		const { publicKey } = await generateKeyPair("RS256");
		const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
		expect(() =>
			createNeonSecretBroker({
				...identity,
				config: { ...config, DATABASE_URL: "secret" },
				jwks,
			}),
		).toThrow();
		expect(() =>
			createNeonSecretBroker({
				...identity,
				audience: "https://attacker.example/",
				config,
				jwks,
			}),
		).toThrow();
	});
	it("requires the onboarding bearer to match an account-bound repository-write credential", () => {
		const bearer = Buffer.alloc(32, 4).toString("base64url");
		const tokenSha256 = createHash("sha256").update(bearer).digest("hex");
		const entry = {
			accountId: "account1",
			tokenSha256,
			scopes: ["policy:read", "policy:write", "repositories:write"],
		};
		const credentials = (item: typeof entry) =>
			JSON.stringify({ tokens: [item] });
		const withToken = { ...config, HOBO_CI_ONBOARDING_CONTROL_TOKEN: bearer };
		expect(
			BrokerSchema.safeParse({
				...withToken,
				HOBO_CI_CONTROL_TOKENS_JSON: credentials(entry),
			}).success,
		).toBe(true);
		for (const item of [
			{ ...entry, accountId: "other" },
			{ ...entry, tokenSha256: "b".repeat(64) },
			{ ...entry, scopes: ["policy:read", "policy:write"] },
			{ ...entry, scopes: ["policy:write", "repositories:write"] },
			{ ...entry, scopes: ["policy:read", "repositories:write"] },
		])
			expect(
				BrokerSchema.safeParse({
					...withToken,
					HOBO_CI_CONTROL_TOKENS_JSON: credentials(item),
				}).success,
			).toBe(false);
		expect(
			BrokerSchema.safeParse({
				...withToken,
				HOBO_CI_CONTROL_TOKENS_JSON: "not-json",
			}).success,
		).toBe(false);
	});
	it("permits only a millisecond Unix timestamp for an invitation expiry", () => {
		expect(
			BrokerSchema.safeParse({
				...config,
				HOBO_CI_INVITATION_EXPIRES_AT: "1793116800000",
			}).success,
		).toBe(true);
		for (const expiry of ["1793116800", "17931168000000", "invalid"])
			expect(
				BrokerSchema.safeParse({
					...config,
					HOBO_CI_INVITATION_EXPIRES_AT: expiry,
				}).success,
			).toBe(false);
	});
});
