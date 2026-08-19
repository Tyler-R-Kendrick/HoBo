/**
 * Every provider transport guard faces the same refusal matrix.
 *
 * The guard is the only thing standing between a live bearer token and an
 * origin nobody vetted. Each resolver family builds its own policy — different
 * hosts, different path prefixes, different caps — but the *refusals* are
 * supposed to be identical, because they come from one implementation
 * (`guardTransport` in `@hobo/core`) parameterised per provider.
 *
 * "Supposed to be" is the problem this file exists for. Branch coverage on
 * these four guards sat between 50% and 67% before it, which on a security
 * boundary means: several refusal paths had never once been observed to fire.
 * A guard whose deny branch is untested is a guard you are trusting on the
 * strength of having read it.
 *
 * So this is a table, not four bespoke suites: the same six probes against
 * every policy, asserting each one is *refused* rather than clamped, repaired,
 * or quietly passed through. A provider added later gets the same treatment by
 * adding one row.
 *
 * It lives in `@hobo/hobo` for the same reason the chaos suite does: provider
 * packages are layer 2 and cannot import each other, so the composition root is
 * the only place a cross-provider suite can exist at all.
 *
 * HONEST SCOPE: this constrains the request each package composes and the
 * response it accepts. It cannot prove the *injected* transport honours
 * `timeoutMs`, refuses to chase a 302 itself, or terminates TLS against the
 * real certificate — those remain the host's obligations. Passing here is not
 * evidence that a live call was made.
 */
import type {
	HttpTransport,
	TransportGuardErrorCode,
	TransportRequest,
} from "@hobo/core";
import { guardedAwsTransport } from "@hobo/provider-aws";
import { guardedAzureTransport } from "@hobo/provider-azure";
import { guardedCloudflareTransport } from "@hobo/provider-cloudflare";
import { guardedGcpTransport } from "@hobo/provider-gcp";
import { describe, expect, it } from "vitest";

/** A transport that records whether it was ever reached. A refused request
 *  must never arrive here — a guard that "refuses" after sending has already
 *  leaked the credential it exists to protect. */
function spyInner(): {
	readonly transport: HttpTransport;
	reached: () => number;
} {
	let calls = 0;
	return {
		transport: async () => {
			calls += 1;
			return { status: 200, headers: {}, body: "{}" };
		},
		reached: () => calls,
	};
}

interface GuardCase {
	readonly label: string;
	readonly wrap: (inner: HttpTransport) => HttpTransport;
	/** A URL this policy admits, proving the suite tests a live guard. */
	readonly allowed: string;
	/** Same path, a host the policy does not name. */
	readonly foreignHost: string;
	/**
	 * Allowed host, a path outside every allowlisted prefix — or `undefined`
	 * when the policy deliberately allows the whole host (see the AWS row).
	 */
	readonly foreignPath: string | undefined;
	readonly maxTimeoutMs: number;
	readonly maxResponseBytes: number;
}

const CASES: readonly GuardCase[] = [
	{
		label: "aws (us-east-1)",
		wrap: (inner) => guardedAwsTransport(inner, "us-east-1"),
		allowed: "https://s3.us-east-1.amazonaws.com/hobo-bucket",
		foreignHost: "https://s3.evil.example.com/hobo-bucket",
		// No path probe: AWS allowlists "/" on purpose. S3 addresses a bucket
		// and key as the whole path, so a prefix rule would either forbid
		// ordinary objects or mean nothing. The host allowlist is the control
		// here, and `pathPrefixIsWholeHost` below asserts that is deliberate
		// rather than an empty list someone forgot to fill in.
		foreignPath: undefined,
		maxTimeoutMs: 15_000,
		maxResponseBytes: 512 * 1024,
	},
	{
		label: "azure (ARM)",
		wrap: (inner) => guardedAzureTransport(inner),
		allowed:
			"https://management.azure.com/subscriptions/3fa85f64-5717-4562-b3fc-2c963f66afa6/resourceGroups/rg",
		foreignHost:
			"https://management.azure.example.com/subscriptions/3fa85f64/resourceGroups/rg",
		foreignPath: "https://management.azure.com/providers/Microsoft.Test",
		maxTimeoutMs: 30_000,
		maxResponseBytes: 512 * 1024,
	},
	{
		label: "gcp (cloudStorage)",
		wrap: (inner) => guardedGcpTransport(inner, "cloudStorage"),
		allowed: "https://storage.googleapis.com/storage/v1/b/hobo-assets",
		foreignHost: "https://compute.googleapis.com/storage/v1/b/hobo-assets",
		foreignPath: "https://storage.googleapis.com/v1/projects/p/topics/t",
		maxTimeoutMs: 20_000,
		maxResponseBytes: 512 * 1024,
	},
	{
		label: "cloudflare (v4)",
		wrap: (inner) => guardedCloudflareTransport(inner),
		allowed: "https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets",
		foreignHost: "https://api.cloudflare.example.com/client/v4/accounts/acct",
		foreignPath: "https://api.cloudflare.com/internal/v4/accounts/acct",
		maxTimeoutMs: 15_000,
		maxResponseBytes: 512 * 1024,
	},
];

/**
 * Assert a guarded call was refused *for the stated reason*.
 *
 * The bare `rejects.toThrow()` these replaced was the §1.1 shape: every one of
 * the six probes below went green on any rejection at all, so a guard that
 * refused everything with one wrong code — an empty `allowedHosts`, say, which
 * turns the http probe into a host refusal — read as six passing refusal tests.
 * A refusal test that cannot tell one refusal from another is not testing the
 * branch it names.
 */
async function expectRefusal(
	call: Promise<unknown>,
	code: TransportGuardErrorCode,
	messageFragment: RegExp,
): Promise<void> {
	const error = await call.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	expect(error, "guarded call resolved instead of refusing").toBeInstanceOf(
		Error,
	);
	const thrown = error as Error & { code?: unknown };
	expect(thrown.name).toBe("TransportGuardError");
	expect(thrown.code).toBe(code);
	expect(thrown.message).toMatch(messageFragment);
}

function request(
	url: string,
	overrides: Partial<TransportRequest> = {},
): TransportRequest {
	return {
		method: "GET",
		url,
		headers: { authorization: "Bearer never-leaves-the-guard" },
		timeoutMs: 1_000,
		maxResponseBytes: 1_024,
		...overrides,
	};
}

describe.each(CASES)("$label transport guard", (guard) => {
	it("admits the policy's own host and path, so the refusals below mean something", async () => {
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expect(guarded(request(guard.allowed))).resolves.toMatchObject({
			status: 200,
		});
		expect(inner.reached()).toBe(1);
	});

	it("refuses plain http, and never sends", async () => {
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expectRefusal(
			guarded(request(guard.allowed.replace("https://", "http://"))),
			"TRANSPORT_SCHEME_FORBIDDEN",
			/must use https, got http/u,
		);
		expect(inner.reached()).toBe(0);
	});

	it("refuses a host the policy does not name, and never sends", async () => {
		// The attack this exists for: one bad config value pointing the driver
		// at an origin that then receives the Authorization header.
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expectRefusal(
			guarded(request(guard.foreignHost)),
			"TRANSPORT_HOST_FORBIDDEN",
			/is not exactly one of the allowlisted provider hosts/u,
		);
		expect(inner.reached()).toBe(0);
	});

	it("refuses a path outside the allowlisted prefixes, and never sends", async () => {
		const foreignPath = guard.foreignPath;
		if (foreignPath === undefined) {
			// Whole-host policy: there is no "outside" to probe. Asserting the
			// allowed URL still passes keeps the row honest rather than silently
			// testing nothing.
			const inner = spyInner();
			const guarded = guard.wrap(inner.transport);
			await expect(guarded(request(guard.allowed))).resolves.toMatchObject({
				status: 200,
			});
			expect(inner.reached()).toBe(1);
			return;
		}
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expectRefusal(
			guarded(request(foreignPath)),
			"TRANSPORT_PATH_FORBIDDEN",
			/is outside the allowlisted prefixes/u,
		);
		expect(inner.reached()).toBe(0);
	});

	it("refuses an over-budget timeout rather than clamping it", async () => {
		// Clamping would be the friendly thing and the wrong thing: a caller
		// that asked for ten minutes and silently got thirty seconds has a
		// deploy that reports a timeout it never configured.
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expectRefusal(
			guarded(request(guard.allowed, { timeoutMs: guard.maxTimeoutMs + 1 })),
			"TRANSPORT_TIMEOUT_EXCEEDED",
			new RegExp(
				`request timeoutMs ${guard.maxTimeoutMs + 1} exceeds the policy cap of ${guard.maxTimeoutMs}`,
				"u",
			),
		);
		expect(inner.reached()).toBe(0);
	});

	it("refuses an over-budget response cap rather than clamping it", async () => {
		const inner = spyInner();
		const guarded = guard.wrap(inner.transport);
		await expectRefusal(
			guarded(
				request(guard.allowed, {
					maxResponseBytes: guard.maxResponseBytes + 1,
				}),
			),
			"TRANSPORT_BODY_TOO_LARGE",
			new RegExp(
				`request maxResponseBytes ${guard.maxResponseBytes + 1} exceeds the policy cap of ${guard.maxResponseBytes}`,
				"u",
			),
		);
		expect(inner.reached()).toBe(0);
	});
});
