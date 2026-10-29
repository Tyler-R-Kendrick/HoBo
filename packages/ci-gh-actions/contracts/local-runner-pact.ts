import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { join } from "node:path";
import {
	MatchersV3 as M,
	PactV3,
	Verifier,
	type VerifierOptions,
} from "@pact-foundation/pact";
import { z } from "zod";
import { claimRunnerJit } from "../src/bootstrap.js";
import { createRelayRequestHandler } from "../src/server.js";
import { harness, queued, reserve, SECRET } from "../test/fixtures.js";

export const consumer = "HoboCiLocalWorkflowAcceptance";
export const provider = "HoboCiLocalRelay";
const exampleLease = "00000000-0000-4000-8000-000000000001";
const claimPath = `/v1/leases/${exampleLease}/jit`;
const responseHeaders = {
	"Content-Type": "application/json",
	"Cache-Control": "no-store",
};
const claimStates = [
	"available",
	"disabled",
	"expired",
	"revoked",
	"wrong-host",
	"claimed",
	"completed",
	"bad-jit",
	"identity-repository",
	"identity-attempt",
	"identity-sha",
	"identity-workflow",
	"host-completed",
	"original-revoked",
] as const;
const admissionStates = [
	"available",
	"busy",
	"duplicate",
	"disabled",
	"expired",
	"public",
	"fork",
	"pull-request",
	"revoked",
] as const;
export const scenarios = [
	...admissionStates.map((state) => `admission:${state}`),
	...claimStates.map((state) => `claim:${state}`),
	"claim:invalid-identity",
	"claim:unknown-lease",
	"webhook:unsigned",
	"webhook:invalid-signature",
	"webhook:malformed",
	"http:health",
	"http:unknown-route",
	"webhook:provider-unavailable",
];
const signature = (body: string) =>
	`sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
type WebhookHeaders = {
	"Content-Type": string;
	"x-github-event": string;
	"x-hub-signature-256"?: string;
};

export async function generateLocalRunnerPact(
	directory: string,
): Promise<string> {
	await mkdir(directory, { recursive: true });
	const pact = new PactV3({
		consumer,
		provider,
		dir: directory,
		logLevel: "error",
	});
	for (const state of admissionStates) {
		const body = queued(state === "busy" ? 2 : 1);
		const expected =
			state === "available" || state === "duplicate"
				? `reserved:${exampleLease}`
				: ["busy", "disabled", "expired"].includes(state)
					? "waiting-for-budget-or-capacity"
					: "ignored";
		const headers = {
			"Content-Type": "application/json",
			"x-github-event": "workflow_job",
			"x-hub-signature-256": signature(JSON.stringify(body)),
		};
		pact
			.given(`admission:${state}`)
			.uponReceiving(`admission:${state}`)
			.withRequest({ method: "POST", path: "/github/webhooks", headers, body })
			.willRespondWith({
				status: 202,
				headers: responseHeaders,
				body: {
					status:
						state === "available" || state === "duplicate"
							? M.regex("^reserved:[a-f0-9-]{36}$", expected)
							: expected,
				},
			});
		await pact.executeTest(async (mock) => {
			const response = await fetch(`${mock.url}/github/webhooks`, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			assert.equal(response.status, 202);
			const actual = z
				.object({ status: z.string() })
				.parse(await response.json());
			if (state === "available" || state === "duplicate")
				assert.match(actual.status, /^reserved:[a-f0-9-]{36}$/);
			else assert.equal(actual.status, expected);
		});
	}
	for (const state of [...claimStates, "invalid-identity", "unknown-lease"]) {
		const status = state === "available" ? 200 : 403;
		const token =
			state === "invalid-identity" || state === "unknown-lease"
				? "invalid"
				: "valid";
		pact
			.given(`claim:${state}`)
			.uponReceiving(`claim:${state}`)
			.withRequest({
				method: "POST",
				path:
					state === "unknown-lease"
						? claimPath
						: M.fromProviderState("/v1/leases/${leaseId}/jit", claimPath),
				headers: { Authorization: `Bearer ${token}` },
			})
			.willRespondWith({
				status,
				headers: responseHeaders,
				body:
					status === 200
						? { encodedJitConfig: "c2VjcmV0" }
						: { error: "claim rejected" },
			});
		await pact.executeTest(async (mock) => {
			if (status === 200)
				assert.equal(
					await claimRunnerJit(new URL(mock.url), exampleLease, token),
					"c2VjcmV0",
				);
			else
				await assert.rejects(
					claimRunnerJit(new URL(mock.url), exampleLease, token),
					/bootstrap request failed \(403\)/,
				);
		});
	}
	for (const name of ["unsigned", "invalid-signature", "malformed"] as const) {
		const body = name === "malformed" ? { invalid: true } : queued();
		const headers: WebhookHeaders = {
			"Content-Type": "application/json",
			"x-github-event": "workflow_job",
		};
		if (name !== "unsigned")
			headers["x-hub-signature-256"] =
				name === "invalid-signature"
					? `sha256=${"0".repeat(64)}`
					: signature(JSON.stringify(body));
		const status = name === "malformed" ? 400 : 401;
		const error =
			name === "unsigned" ? "signature required" : "webhook rejected";
		pact
			.given("admission:available")
			.uponReceiving(`webhook:${name}`)
			.withRequest({ method: "POST", path: "/github/webhooks", headers, body })
			.willRespondWith({ status, headers: responseHeaders, body: { error } });
		await pact.executeTest(async (mock) => {
			const response = await fetch(`${mock.url}/github/webhooks`, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			assert.equal(response.status, status);
			assert.deepEqual(await response.json(), { error });
		});
	}
	for (const [name, route, status, body] of [
		["health", "/healthz", 200, { ok: true }],
		["unknown-route", "/account-secrets", 404, { error: "not found" }],
	] as const) {
		pact
			.given("admission:available")
			.uponReceiving(`http:${name}`)
			.withRequest({ method: "GET", path: route })
			.willRespondWith({ status, headers: responseHeaders, body });
		await pact.executeTest(async (mock) => {
			const response = await fetch(`${mock.url}${route}`);
			assert.equal(response.status, status);
			assert.deepEqual(await response.json(), body);
		});
	}
	const unavailableBody = queued();
	const unavailableHeaders = {
		"Content-Type": "application/json",
		"x-github-event": "workflow_job",
		"x-hub-signature-256": signature(JSON.stringify(unavailableBody)),
	};
	pact
		.given("admission:api-unavailable")
		.uponReceiving("webhook:provider-unavailable")
		.withRequest({
			method: "POST",
			path: "/github/webhooks",
			headers: unavailableHeaders,
			body: unavailableBody,
		})
		.willRespondWith({
			status: 503,
			headers: responseHeaders,
			body: { error: "webhook rejected" },
		});
	await pact.executeTest(async (mock) => {
		const response = await fetch(`${mock.url}/github/webhooks`, {
			method: "POST",
			headers: unavailableHeaders,
			body: JSON.stringify(unavailableBody),
		});
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), { error: "webhook rejected" });
	});
	const file = join(directory, `${consumer}-${provider}.json`);
	const parsed = z
		.object({ interactions: z.array(z.object({ description: z.string() })) })
		.parse(JSON.parse(await readFile(file, "utf8")));
	assert.deepEqual(
		parsed.interactions.map((item) => item.description).sort(),
		[...scenarios].sort(),
		"every scenario must generate exactly one interaction",
	);
	return file;
}

export async function verifyLocalRunnerPact(
	options: Omit<
		VerifierOptions,
		"providerBaseUrl" | "stateHandlers" | "requestFilter"
	>,
	fault = false,
): Promise<void> {
	let current = harness();
	const server = createServer((request, response) => {
		if (fault && request.url === "/healthz") {
			response.setHeader("Content-Type", "application/json");
			response.setHeader("Cache-Control", "no-store");
			response.end('{"ok":false}');
			return;
		}
		createRelayRequestHandler(current.relay)(request, response);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = z.object({ port: z.number() }).parse(server.address());
	const stateHandlers: NonNullable<VerifierOptions["stateHandlers"]> = {};
	const setup = async (name: string) => {
		assert.deepEqual(current.api.violations, []);
		current.store.close();
		current = harness();
		const account = current.configuration.accounts[0];
		const offer = account?.offers[0];
		assert.ok(account && offer);
		account.budgetMicros = 0;
		Object.assign(offer, {
			provider: "local",
			backend: "gh-actions",
			providerAccountId: "owned-dev-machine",
			runsOn: "hobo-local-host",
			freeMinutes: 0,
			priceMicrosPerMinute: 0,
			budgetMicros: 0,
		});
		current.api.hostLabel = "hobo-local-host";
		const [phase, state] = name.split(":");
		let leaseId = exampleLease;
		if (phase === "claim" && state !== "unknown-lease") {
			const lease = await reserve(current);
			leaseId = lease.id;
			await current.relay.dispatchPending();
			if (state === "claimed" || state === "completed") {
				await current.relay.claim(lease.id, "valid");
				if (state === "completed") {
					current.api.host.status = "completed";
					await current.relay.reconcile(lease.id, 22);
				}
			}
		}
		if (state === "busy") await reserve(current);
		if (state === "duplicate") await reserve(current);
		if (state === "api-unavailable")
			current.api.request = async () => {
				throw new Error("fixture GitHub API unavailable");
			};
		if (state === "disabled") offer.enabled = false;
		if (state === "expired") offer.validUntil = "2026-10-25T00:00:00Z";
		if (state === "public") current.api.original.repository.private = false;
		if (state === "fork") current.api.original.head_repository.id = 999;
		if (state === "pull-request") current.api.original.event = "pull_request";
		if (state === "revoked") current.configuration.connections.length = 0;
		if (state === "wrong-host") current.api.hostLabel = "ubuntu-24.04";
		if (state === "bad-jit") current.api.invalidJit = true;
		if (state === "identity-repository")
			current.identityClaims.repository_id = "999";
		if (state === "identity-attempt") current.identityClaims.run_attempt = "2";
		if (state === "identity-sha")
			current.identityClaims.workflow_sha = "b".repeat(40);
		if (state === "identity-workflow")
			current.identityClaims.workflow_ref = `org/repo/.github/workflows/untrusted.yml@${current.identityClaims.workflow_sha}`;
		if (state === "host-completed") current.api.host.status = "completed";
		if (state === "original-revoked")
			current.api.original.event = "pull_request";
		return { leaseId };
	};
	for (const name of [
		...admissionStates.map((state) => `admission:${state}`),
		...claimStates.map((state) => `claim:${state}`),
		"claim:invalid-identity",
		"claim:unknown-lease",
		"admission:api-unavailable",
	])
		stateHandlers[name] = () => setup(name);
	try {
		await new Verifier({
			...options,
			providerBaseUrl: `http://127.0.0.1:${port}`,
			logLevel: "error",
			failIfNoPactsFound: true,
			stateHandlers,
			requestFilter(
				request: IncomingMessage & { path: string; body: object },
				_response: ServerResponse,
				next: () => void,
			) {
				// Pact reserializes JSON. Sign the replay bytes with the fixture secret;
				// missing and deliberately invalid signatures remain untouched.
				const header = request.headers["x-hub-signature-256"];
				if (
					request.path === "/github/webhooks" &&
					header &&
					header !== `sha256=${"0".repeat(64)}`
				)
					request.headers["x-hub-signature-256"] = signature(
						JSON.stringify(request.body),
					);
				next();
			},
		}).verifyProvider();
		assert.deepEqual(current.api.violations, []);
	} finally {
		await new Promise<void>((done, reject) =>
			server.close((error) => (error ? reject(error) : done())),
		);
		current.store.close();
	}
}
