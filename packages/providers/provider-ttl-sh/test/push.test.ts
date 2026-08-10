import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { isTtlShProviderError, TtlShProviderError } from "../src/errors.js";
import {
	assertArgvSafe,
	assertLeaseLive,
	buildCranePushArgv,
	createCranePushExecutor,
	createInMemoryPushLedger,
	type OciPushExecutor,
	pushArtifact,
} from "../src/push.js";
import {
	createTtlShImageReference,
	parseArtifactDigest,
} from "../src/reference.js";
import {
	createStubRunner,
	FAKE_DIGEST,
	FAKE_UUID_NAME,
	LEAKED_TOKEN,
	NOW_MS,
	OTHER_DIGEST,
} from "./fixtures/index.js";

const REFERENCE = createTtlShImageReference({
	name: FAKE_UUID_NAME,
	ttl: "1h",
});
const DIGEST = parseArtifactDigest(FAKE_DIGEST);
const ARTIFACT = {
	path: "/tmp/app.tar",
	digest: DIGEST,
	sizeBytes: 4096,
} as const;

const failsWith = (code: string) => (error: unknown) =>
	isTtlShProviderError(error) && error.code === code;

function inputFor(
	executor: OciPushExecutor,
	ledger = createInMemoryPushLedger(),
) {
	return {
		executor,
		ledger,
		reference: REFERENCE,
		artifact: ARTIFACT,
		nowMs: NOW_MS,
		definitionId: "ttl-sh.ephemeral-oci-artifact/v1",
		providerId: "ttl-sh",
		resourceRef: "bindle:app/image",
	};
}

describe("buildCranePushArgv", () => {
	it("builds a fused argv with no shell and no interpolation", () => {
		assert.deepEqual(
			buildCranePushArgv({
				reference: REFERENCE,
				artifactPath: "/tmp/app.tar",
			}),
			["crane", "push", "/tmp/app.tar", `ttl.sh/${FAKE_UUID_NAME}:1h`],
		);
	});

	it("passes an allowlisted flag and nothing else", () => {
		assert.ok(
			buildCranePushArgv({
				reference: REFERENCE,
				artifactPath: "/tmp/app.tar",
				allArchitectures: true,
			}).includes("--platform=all"),
		);
	});

	it("refuses a binary outside the allowlist", () => {
		assert.throws(
			() =>
				buildCranePushArgv({
					reference: REFERENCE,
					artifactPath: "/tmp/app.tar",
					binary: "curl",
				}),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});
});

describe("assertArgvSafe", () => {
	it("refuses an empty argv", () => {
		assert.throws(
			() => assertArgvSafe([]),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});

	it("refuses a NUL, which truncates the argument the child receives", () => {
		assert.throws(
			() =>
				assertArgvSafe(["crane", "push", "/tmp/app\u0000.tar", "ttl.sh/x:1h"]),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});

	it("refuses a newline, which forges a log line", () => {
		assert.throws(
			() => assertArgvSafe(["crane", "push", "/tmp/app\ntar", "ttl.sh/x:1h"]),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});

	for (const [reason, element] of [
		["a password flag", "--password=hunter2"],
		["a username flag", "--username=hobo"],
		["userinfo in a URL", "https://user:secret@ttl.sh/v2/"],
		["a bearer header", "Bearer abc"],
	] as const) {
		it(`refuses ${reason}`, () => {
			assert.throws(
				() => assertArgvSafe(["crane", "push", element, "ttl.sh/x:1h"]),
				failsWith("CREDENTIAL_REFUSED"),
			);
		});
	}

	it("refuses an unallowlisted flag rather than forwarding it", () => {
		// --insecure would drop TLS to a registry that already has no
		// authentication, which is the one combination worth refusing loudly.
		assert.throws(
			() => assertArgvSafe(["crane", "push", "--insecure", "/tmp/app.tar"]),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});

	it("refuses an over-long argv element", () => {
		assert.throws(
			() => assertArgvSafe(["crane", "push", "x".repeat(1025)]),
			failsWith("UNSAFE_TOOL_INVOCATION"),
		);
	});
});

describe("createCranePushExecutor", () => {
	it("spawns the allowlisted argv with an empty environment", async () => {
		const runner = createStubRunner({});

		await createCranePushExecutor({ runner }).push({
			reference: REFERENCE,
			artifact: ARTIFACT,
			timeoutMs: 30_000,
		});

		const invocation = runner.invocations[0];
		assert.ok(invocation !== undefined);
		assert.deepEqual(invocation.argv, [
			"crane",
			"push",
			"/tmp/app.tar",
			`ttl.sh/${FAKE_UUID_NAME}:1h`,
		]);
		// An inherited DOCKER_CONFIG is how a credential reaches an anonymous
		// registry, so nothing is inherited.
		assert.deepEqual(invocation.env, {});
	});

	it("refuses a digest the registry did not confirm", async () => {
		const runner = createStubRunner({
			results: [{ code: 0, stdout: `${OTHER_DIGEST}\n`, stderr: "" }],
		});

		await assert.rejects(
			createCranePushExecutor({ runner }).push({
				reference: REFERENCE,
				artifact: ARTIFACT,
				timeoutMs: 30_000,
			}),
			failsWith("PROVIDER_CONTRACT_CHANGED"),
		);
	});

	it("refuses a success with no digest to pin the artifact to", async () => {
		const runner = createStubRunner({
			results: [{ code: 0, stdout: "done\n", stderr: "" }],
		});

		await assert.rejects(
			createCranePushExecutor({ runner }).push({
				reference: REFERENCE,
				artifact: ARTIFACT,
				timeoutMs: 30_000,
			}),
			failsWith("PROVIDER_CONTRACT_CHANGED"),
		);
	});

	it("maps a rate-limited push to a retryable failure", async () => {
		const runner = createStubRunner({
			results: [
				{
					code: 1,
					stdout: "",
					stderr: "unexpected status: 429 Too Many Requests",
				},
			],
		});

		await assert.rejects(
			createCranePushExecutor({ runner }).push({
				reference: REFERENCE,
				artifact: ARTIFACT,
				timeoutMs: 30_000,
			}),
			(error: unknown) =>
				isTtlShProviderError(error) &&
				error.code === "PROVIDER_RATE_LIMITED" &&
				error.retryable,
		);
	});

	it("maps a dropped connection to ambiguity rather than to failure", async () => {
		const runner = createStubRunner({ throws: [new Error("spawn timed out")] });

		await assert.rejects(
			createCranePushExecutor({ runner }).push({
				reference: REFERENCE,
				artifact: ARTIFACT,
				timeoutMs: 30_000,
			}),
			(error: unknown) =>
				isTtlShProviderError(error) &&
				error.code === "PROVIDER_OPERATION_AMBIGUOUS" &&
				// Unknown is never presented as safe to redo blindly.
				error.retryable === false,
		);
	});

	it("maps a definite tool failure to ARTIFACT_PUSH_FAILED and redacts its stderr", async () => {
		const runner = createStubRunner({
			results: [
				{
					code: 1,
					stdout: "",
					stderr: `MANIFEST_INVALID token=${LEAKED_TOKEN}`,
				},
			],
		});

		await assert.rejects(
			createCranePushExecutor({ runner }).push({
				reference: REFERENCE,
				artifact: ARTIFACT,
				timeoutMs: 30_000,
			}),
			(error: unknown) =>
				isTtlShProviderError(error) &&
				error.code === "ARTIFACT_PUSH_FAILED" &&
				!JSON.stringify(error.toJSON()).includes(LEAKED_TOKEN),
		);
	});
});

describe("pushArtifact", () => {
	const okExecutor = (calls: { count: number }): OciPushExecutor => ({
		async push() {
			calls.count += 1;
			return { digest: DIGEST };
		},
	});

	it("records a push with a locally computed expiry", async () => {
		const calls = { count: 0 };
		const record = await pushArtifact(inputFor(okExecutor(calls)));

		assert.equal(record.adopted, false);
		assert.equal(record.digest, DIGEST);
		assert.equal(record.expiresAtMs, NOW_MS + 60 * 60_000);
		// The registry states no expiry, so the receipt must not claim it did.
		assert.equal(record.expirySource, "computed-from-ttl");
		assert.equal(calls.count, 1);
	});

	it("adopts an identical digest instead of spending a second lease", async () => {
		const calls = { count: 0 };
		const ledger = createInMemoryPushLedger();

		await pushArtifact(inputFor(okExecutor(calls), ledger));
		const second = await pushArtifact(inputFor(okExecutor(calls), ledger));

		assert.equal(second.adopted, true);
		assert.equal(second.digest, DIGEST);
		// The second call never reached the registry.
		assert.equal(calls.count, 1);
	});

	it("refuses to overwrite a live reference with different content", async () => {
		const ledger = createInMemoryPushLedger();
		await pushArtifact(inputFor(okExecutor({ count: 0 }), ledger));

		await assert.rejects(
			pushArtifact({
				...inputFor(okExecutor({ count: 0 }), ledger),
				artifact: {
					path: "/tmp/other.tar",
					digest: parseArtifactDigest(OTHER_DIGEST),
					sizeBytes: 8192,
				},
			}),
			failsWith("REFERENCE_REUSED"),
		);
	});

	it("re-pushes once the recorded lease has expired, because the registry deleted it", async () => {
		const calls = { count: 0 };
		const ledger = createInMemoryPushLedger();
		await pushArtifact(inputFor(okExecutor(calls), ledger));

		const later = await pushArtifact({
			...inputFor(okExecutor(calls), ledger),
			nowMs: NOW_MS + 2 * 60 * 60_000,
		});

		assert.equal(later.adopted, false);
		assert.equal(calls.count, 2);
	});

	it("leaves the ledger in flight after an ambiguous push", async () => {
		const ledger = createInMemoryPushLedger();
		const ambiguous: OciPushExecutor = {
			push() {
				throw new TtlShProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					"socket hang up",
				);
			},
		};

		await assert.rejects(
			pushArtifact(inputFor(ambiguous, ledger)),
			failsWith("PROVIDER_OPERATION_AMBIGUOUS"),
		);
		assert.equal(
			(await ledger.get(REFERENCE.pullReference))?.state,
			"in-flight",
		);
	});

	it("releases the reference after a definite failure", async () => {
		const ledger = createInMemoryPushLedger();
		const failing: OciPushExecutor = {
			push() {
				throw new TtlShProviderError(
					"ARTIFACT_PUSH_FAILED",
					"manifest invalid",
				);
			},
		};

		await assert.rejects(
			pushArtifact(inputFor(failing, ledger)),
			failsWith("ARTIFACT_PUSH_FAILED"),
		);
		assert.equal((await ledger.get(REFERENCE.pullReference))?.state, "failed");
	});
});

describe("assertLeaseLive", () => {
	it("refuses to hand out a reference whose TTL has elapsed", async () => {
		const record = await pushArtifact(
			inputFor({
				async push() {
					return { digest: DIGEST };
				},
			}),
		);

		assert.doesNotThrow(() => assertLeaseLive(record, NOW_MS + 60_000));
		assert.throws(
			() => assertLeaseLive(record, NOW_MS + 60 * 60_000),
			failsWith("LEASE_EXPIRED"),
		);
	});
});
