/**
 * Publishing a review to GitHub, and the receipt that records it.
 *
 * Submitting a review is an outward-facing effect: once `gh` returns, a comment
 * exists on someone else's pull request and cannot be un-sent. That shapes what
 * is worth testing here.
 *
 * **The decision maps to an event, and the mapping is not symmetric.** Approve
 * and request-changes are explicit codes; everything else — including a
 * decision this build does not recognise — becomes a plain COMMENT. That
 * default is deliberately the harmless one: a review published as APPROVE
 * because an unknown decision code fell through would be an approval nobody
 * gave.
 *
 * **A missing target is refused before the effect, not after.** Without a pull
 * request number there is nothing to publish to, and finding that out from
 * `gh`'s own error would mean the failure arrives as provider drift rather than
 * as the caller's mistake.
 *
 * **The fake is idempotent by command id.** A retry of the same submission has
 * to return the original receipt rather than publish twice — the fake models
 * that because it is the property the real lane's callers rely on, and a fake
 * that published twice would let a retry bug pass every test that uses it.
 *
 * The digest is what makes a receipt checkable, so it gets its own tests:
 * stable for the same input, different for different ones, and able to carry a
 * bigint, which `JSON.stringify` throws on by default.
 */
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
	PendingReviewSchema,
	ReviewSnapshotSchema,
} from "../src/_generated/code_review_pb.js";
import {
	createFakeGithubProvider,
	createGithubCliProvider,
	type ReviewProviderSubmitInput,
	type ReviewProviderSubmitResult,
	reviewEffectDigest,
} from "../src/review/github-review-provider.js";
import type { SessionProcessRunner } from "../src/session-orchestrator.js";

/** A runner that records its invocations and answers from a script. */
function recordingRunner(
	result: { code?: number; stdout?: string; stderr?: string } = {},
) {
	const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
	const runner: SessionProcessRunner = {
		async run(command, args, cwd) {
			calls.push({ command, args: [...args], cwd });
			return {
				code: result.code ?? 0,
				stdout: result.stdout ?? "{}",
				stderr: result.stderr ?? "",
			};
		},
	};
	return { runner, calls };
}

type SnapshotInit = NonNullable<
	Parameters<typeof create<typeof ReviewSnapshotSchema>>[1]
>;
type PendingInit = NonNullable<
	Parameters<typeof create<typeof PendingReviewSchema>>[1]
>;

/** What a test changes: the snapshot is replaced whole, pending is merged. */
type InputOverrides = {
	readonly commandId?: string;
	readonly snapshot?: SnapshotInit;
	readonly pending?: PendingInit;
};

function input(over: InputOverrides = {}): ReviewProviderSubmitInput {
	return {
		commandId: over.commandId ?? "cmd-1",
		snapshot: create(
			ReviewSnapshotSchema,
			over.snapshot ?? {
				target: {
					number: 42,
					repository: "acme/widgets",
					repositoryRoot: "/repo",
				},
			},
		),
		pending: create(PendingReviewSchema, {
			summaryBody: "looks good",
			decision: 1,
			effectDigest: "digest-1",
			expectedProviderHeadOid: "head-oid",
			...over.pending,
		}),
	};
}

/** The value of a `-f key=value` pair in the gh argv. */
function field(args: readonly string[], key: string): string | undefined {
	return args.find((arg) => arg.startsWith(`${key}=`))?.slice(key.length + 1);
}

describe("the effect digest", () => {
	it("is stable for the same input", () => {
		// A receipt hash that changed between runs could never be checked against
		// a stored one.
		expect(reviewEffectDigest({ a: 1 })).toBe(reviewEffectDigest({ a: 1 }));
	});

	it("differs when the input differs", () => {
		expect(reviewEffectDigest({ a: 1 })).not.toBe(reviewEffectDigest({ a: 2 }));
	});

	it("is a hex sha256", () => {
		expect(reviewEffectDigest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("carries a bigint instead of throwing on it", () => {
		// `JSON.stringify` throws outright on a bigint. Proto number fields
		// deserialise to bigints, so without the replacer every digest over a
		// real pending review would fail rather than differ.
		// SAFETY: deliberately outside JsonObject; the replacer exists for a
		// bigint that reaches the digest untyped, and this pins how it is read.
		const withBigint = { n: 10n } as never;
		expect(() => reviewEffectDigest(withBigint)).not.toThrow();
		expect(reviewEffectDigest(withBigint)).toBe(
			reviewEffectDigest({ n: "10" }),
		);
	});
});

describe("the fake provider", () => {
	it("advertises the thread capabilities the CLI lane lacks", () => {
		// The difference is the point: a test written against the fake can
		// exercise thread replies that the real lane cannot do yet.
		const capabilities = createFakeGithubProvider().capabilities();
		expect(capabilities).toContain("thread-reply");
		expect(capabilities).toContain("thread-resolve");
		expect(capabilities).toContain("review-submit");
	});

	it("records the submission it accepted", async () => {
		const submissions: ReviewProviderSubmitResult[] = [];
		await createFakeGithubProvider({ submissions }).submitReview(input());
		expect(submissions).toHaveLength(1);
	});

	it("returns the original receipt when the same command is retried", async () => {
		// Idempotent by command id. A fake that published twice would let a retry
		// bug pass every test written against it.
		const provider = createFakeGithubProvider();
		const first = await provider.submitReview(input());
		const second = await provider.submitReview(input());
		expect(second).toBe(first);
	});

	it("treats a different command id as a different submission", async () => {
		const provider = createFakeGithubProvider();
		const first = await provider.submitReview(input());
		const second = await provider.submitReview(input({ commandId: "cmd-2" }));
		expect(second.submissionId).not.toBe(first.submissionId);
	});

	it("derives the receipt hash from the command, digest and head", async () => {
		// Two submissions differing only in the head they were computed against
		// must not share a receipt hash, or a receipt would verify against the
		// wrong commit.
		const a = await createFakeGithubProvider().submitReview(input());
		const b = await createFakeGithubProvider().submitReview(
			input({ pending: { expectedProviderHeadOid: "other-head" } }),
		);
		expect(a.receiptHash).not.toBe(b.receiptHash);
	});

	it("keeps an empty default store per provider", async () => {
		// The default parameter must not be shared across calls, or one test's
		// submissions would satisfy another's idempotency check.
		await createFakeGithubProvider().submitReview(input());
		const fresh = createFakeGithubProvider();
		const receipt = await fresh.submitReview(input());
		expect(receipt.providerReviewId).toMatch(/^PRR_/u);
	});
});

describe("publishing through the gh CLI", () => {
	it("refuses when the snapshot names no pull request", async () => {
		// Before the effect, not after: without a number there is nothing to
		// publish to, and letting gh report it would surface the caller's mistake
		// as provider drift.
		const { runner, calls } = recordingRunner();
		await expect(
			createGithubCliProvider(runner).submitReview(input({ snapshot: {} })),
		).rejects.toThrow(/pull-request target/u);
		expect(calls).toHaveLength(0);
	});

	it("refuses a target whose number is zero", async () => {
		// `!target?.number` — zero is not a pull request, and it is what an
		// unset proto number field deserialises to.
		const { runner } = recordingRunner();
		await expect(
			createGithubCliProvider(runner).submitReview(
				input({ snapshot: { target: { number: 0, repository: "a/b" } } }),
			),
		).rejects.toThrow(/pull-request target/u);
	});

	it("posts to the pull request's reviews endpoint", async () => {
		const { runner, calls } = recordingRunner();
		await createGithubCliProvider(runner).submitReview(input());
		expect(calls[0]?.command).toBe("gh");
		expect(calls[0]?.args).toContain("repos/acme/widgets/pulls/42/reviews");
		expect(calls[0]?.args).toContain("POST");
	});

	it("sends the summary body and the head it reviewed", async () => {
		// The commit id is what pins the review to the code it was written
		// against; without it GitHub attaches it to whatever is newest.
		const { runner, calls } = recordingRunner();
		await createGithubCliProvider(runner).submitReview(input());
		expect(field(calls[0]?.args ?? [], "body")).toBe("looks good");
		expect(field(calls[0]?.args ?? [], "commit_id")).toBe("head-oid");
	});

	it("runs in the repository root", async () => {
		const { runner, calls } = recordingRunner();
		await createGithubCliProvider(runner).submitReview(input());
		expect(calls[0]?.cwd).toBe("/repo");
	});

	it("falls back to the working directory when no root is recorded", async () => {
		// An empty string, not just undefined: `||`, because a recorded root of
		// "" would otherwise run gh in the filesystem root.
		const { runner, calls } = recordingRunner();
		await createGithubCliProvider(runner).submitReview(
			input({
				snapshot: {
					target: {
						number: 42,
						repository: "acme/widgets",
						repositoryRoot: "",
					},
				},
			}),
		);
		expect(calls[0]?.cwd).toBe(process.cwd());
	});
});

describe("the decision it publishes", () => {
	async function eventFor(decision: number): Promise<string | undefined> {
		const { runner, calls } = recordingRunner();
		await createGithubCliProvider(runner).submitReview(
			input({ pending: { decision } }),
		);
		return field(calls[0]?.args ?? [], "event");
	}

	it("approves on the approve decision", async () => {
		expect(await eventFor(2)).toBe("APPROVE");
	});

	it("requests changes on the request-changes decision", async () => {
		expect(await eventFor(3)).toBe("REQUEST_CHANGES");
	});

	it("comments on anything else", async () => {
		// Including an unset decision and a code this build does not know. The
		// default has to be the harmless one -- an unknown code falling through
		// to APPROVE would publish an approval nobody gave.
		for (const decision of [0, 1, 4, 99]) {
			expect(await eventFor(decision)).toBe("COMMENT");
		}
	});
});

describe("when gh fails", () => {
	it("reports provider drift carrying gh's own error", async () => {
		// The operator needs gh's message: it distinguishes an expired token from
		// a protected branch from a stale head.
		const { runner } = recordingRunner({
			code: 1,
			stderr: "HTTP 422: head sha is out of date",
		});
		await expect(
			createGithubCliProvider(runner).submitReview(input()),
		).rejects.toThrow(/head sha is out of date/u);
	});

	it("supplies a message when gh said nothing", async () => {
		// A thrown error with an empty message is indistinguishable from a crash.
		const { runner } = recordingRunner({ code: 1, stderr: "" });
		await expect(
			createGithubCliProvider(runner).submitReview(input()),
		).rejects.toThrow(/gh review submit failed/u);
	});

	it("does not report a receipt for a failed submission", async () => {
		const { runner } = recordingRunner({ code: 1 });
		const outcome = await createGithubCliProvider(runner)
			.submitReview(input())
			.then(() => "resolved")
			.catch(() => "refused");
		expect(outcome).toBe("refused");
	});
});

describe("the receipt a successful publish returns", () => {
	it("identifies itself by the command that produced it", async () => {
		// So a retry can be recognised as the same submission rather than
		// published again.
		const { runner } = recordingRunner();
		const receipt = await createGithubCliProvider(runner).submitReview(input());
		expect(receipt.submissionId).toBe("cmd-1");
		expect(receipt.providerReviewId).toBe("cmd-1");
	});

	it("hashes what gh actually returned", async () => {
		// The receipt attests to the provider's response, not to the request --
		// hashing the request would produce the same receipt whether or not the
		// review landed.
		const { runner } = recordingRunner({ stdout: '{"id":7}' });
		const receipt = await createGithubCliProvider(runner).submitReview(input());
		expect(receipt.receiptHash).toBe(
			reviewEffectDigest({ stdout: '{"id":7}' }),
		);
	});

	it("advertises fewer capabilities than the fake", async () => {
		// The CLI lane cannot reply to or resolve threads; claiming it could
		// would let a caller route thread work to a provider that drops it.
		const { runner } = recordingRunner();
		const capabilities = createGithubCliProvider(runner).capabilities();
		expect(capabilities).not.toContain("thread-reply");
		expect(capabilities).not.toContain("thread-resolve");
		expect(capabilities).toContain("review-submit");
	});
});
