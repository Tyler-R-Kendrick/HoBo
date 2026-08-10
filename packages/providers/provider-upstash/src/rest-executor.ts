/**
 * The data plane: a `KvRedisExecutor` over the Upstash REST API.
 *
 * This is what makes the conformance claim in the definition mean something.
 * The provider-neutral suite in `@hobo/kv-redis-compatible` emits Redis
 * commands and expects Redis replies; this adapter is the only place that
 * knows those travel as a JSON array in a POST body with a bearer token, and
 * come back as `{"result": …}` or `{"error": "…"}`.
 *
 * `advanceTime` is deliberately not implemented. A real endpoint has a real
 * clock, so the suite's expiry cases are skipped rather than faked, and a
 * skipped case does not substantiate a capability.
 *
 * Source, checked 2026-08-08:
 * https://upstash.com/docs/redis/sdks/ts/getstarted
 */
import type {
	KvRedisExecutor,
	RedisCommand,
	RedisReply,
	RedisValue,
} from "@hobo/kv-redis-compatible";

import { providerErrorForStatus, UpstashProviderError } from "./errors.js";
import {
	createGuardedTransport,
	type TransportPolicy,
	UPSTASH_DATA_PLANE_POLICY,
	type UpstashTransport,
} from "./transport.js";

export type UpstashRestExecutorOptions = {
	readonly transport: UpstashTransport;
	/** `https://<name>-<id>.upstash.io`, from the parsed create response. */
	readonly restEndpointUrl: string;
	/**
	 * Resolved lazily and never stored.
	 *
	 * The executor holds a *function* rather than a token so that custody
	 * decides when material exists, and so a long-lived executor does not keep
	 * a plaintext credential alive in a closure any longer than a request.
	 */
	readonly resolveToken: () => Promise<string>;
	readonly policy?: TransportPolicy;
	readonly userAgent?: string;
};

/**
 * Narrow the decoded JSON into a reply.
 *
 * Redis replies nest arbitrarily, so this walks the structure instead of
 * asserting a cast. Anything outside the RESP value space — an object, a
 * boolean, a non-finite number — is a contract change, not a value to coerce.
 */
function parseRedisValue(value: unknown, depth = 0): RedisValue {
	if (depth > 16) {
		throw new UpstashProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"redis reply nested deeper than the 16 level cap",
		);
	}
	if (value === null) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new UpstashProviderError(
				"PROVIDER_CONTRACT_CHANGED",
				"redis reply contained a non-finite number",
			);
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => parseRedisValue(entry, depth + 1));
	}
	throw new UpstashProviderError(
		"PROVIDER_CONTRACT_CHANGED",
		`redis reply contained an unsupported ${typeof value} value`,
	);
}

export function parseRestReply(body: string): RedisReply {
	let decoded: unknown;
	try {
		decoded = JSON.parse(body) as unknown;
	} catch (cause) {
		throw new UpstashProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"the REST endpoint returned a body that is not JSON",
			{ cause },
		);
	}
	if (
		typeof decoded !== "object" ||
		decoded === null ||
		Array.isArray(decoded)
	) {
		throw new UpstashProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"the REST endpoint returned something other than a result envelope",
		);
	}
	const envelope = decoded as {
		readonly result?: unknown;
		readonly error?: unknown;
	};
	if (typeof envelope.error === "string") {
		// A command-level error (WRONGTYPE, "value is not an integer") is a
		// legitimate Redis reply, not a driver failure. The suite asserts on
		// several of them.
		return { kind: "error", message: envelope.error };
	}
	if (!("result" in envelope)) {
		throw new UpstashProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"the REST envelope carried neither a result nor an error",
		);
	}
	return { kind: "value", value: parseRedisValue(envelope.result) };
}

const COMMAND_VERB = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/u;

export function createUpstashRestExecutor(
	options: UpstashRestExecutorOptions,
): KvRedisExecutor {
	const policy = options.policy ?? UPSTASH_DATA_PLANE_POLICY;
	const transport = createGuardedTransport(options.transport, policy);
	const userAgent = options.userAgent ?? "hobo-provider-upstash/0.0.1";

	return {
		async execute(command: RedisCommand): Promise<RedisReply> {
			const [verb] = command;
			if (!COMMAND_VERB.test(verb)) {
				// Not a safety boundary — the body is JSON, so there is no
				// injection to prevent — but a malformed verb is a bug worth
				// catching before it becomes a confusing provider error.
				throw new UpstashProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					"redis command verb must be a plain identifier",
				);
			}

			const token = await options.resolveToken();
			const response = await transport.request({
				method: "POST",
				url: options.restEndpointUrl,
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
					accept: "application/json",
					"user-agent": userAgent,
				},
				body: JSON.stringify(command),
				timeoutMs: policy.timeoutMs,
				maxResponseBytes: policy.maxResponseBytes,
			});

			if (response.status === 200) return parseRestReply(response.body);
			if (response.status === 401 || response.status === 403) {
				throw new UpstashProviderError(
					"PROVIDER_AUTH_FAILED",
					"the REST token was rejected; it may have been rotated after a claim, or the database may have been reaped",
					{ detail: { status: response.status, verb } },
				);
			}
			if (response.status === 404) {
				throw new UpstashProviderError(
					"LEASE_EXPIRED",
					"the REST endpoint no longer exists; an unclaimed temporary database is reaped at expiry",
					{ detail: { status: 404, verb } },
				);
			}
			throw providerErrorForStatus(response.status, {
				method: "POST",
				body: response.body,
			});
		},
	};
}
