/**
 * The trajectory shapes the parse boundary lets through but the engine cannot
 * use — and a record of the ones it cannot let through at all.
 *
 * `derivation-edges` and `engine-degradation` cover requests the engine
 * refuses; `metric-scoring-edges` covers ones it accepts and has to work hard
 * on. The gap this closes is narrower: a request that satisfies every
 * invariant `parseOptimizeRequest` asserts and is *still* unusable, because
 * usability depends on something the parser does not check.
 *
 * **The parser guarantees more than the engine assumes.** `optimize` reads its
 * request through optional chaining — `parsed.rubric?.objective ?? ""`,
 * `parsed.contract?.method ?? ""`, `trajectory.reward?.score ?? 0` — but
 * `parseOptimizeRequest` has already refused a request missing any of the
 * three, and refused a rubric whose id is empty. Those fallback arms are
 * therefore unreachable through the port; tests asserting on them were written
 * for this file and deleted once the parser refused every one of them. They
 * are recorded here rather than in a test because a test that cannot fail is
 * worse than a comment that can be read: the engine is re-hedging a guarantee
 * the boundary already makes, and the honest fix is in the return type of
 * `parseOptimizeRequest`, not in this package.
 *
 * What the parser genuinely does not check is whether the span graph has a
 * root. It checks that every `parentId` names a span in the same trajectory —
 * which a cycle satisfies.
 */
import { describe, expect, it } from "vitest";

import { createAxTrainingEngine } from "../src/index.js";
import { mockModel, optimizeRequest, trajectory } from "./helpers.js";

const engine = () =>
	createAxTrainingEngine({ ai: mockModel("access"), maxMetricCalls: 4 });

describe("a trajectory whose spans have no root", () => {
	/**
	 * Two spans naming each other as parent. Every `parentId` references a span
	 * that exists, so the referential check passes; no span has an empty
	 * `parentId`, so there is no root.
	 */
	function cyclicSpans() {
		const base = trajectory("t1", "cannot log in", "access", 0.95);
		const root = base.spans[0];
		return {
			...base,
			spans: [
				{ ...root, id: "span-a", parentId: "span-b" },
				{ ...root, id: "span-b", parentId: "span-a" },
			],
		};
	}

	it("passes the parse boundary", async () => {
		// Stated first because the rest of this test is only interesting if the
		// shape actually reaches the engine. A cycle satisfies "every parentId
		// references another span" — the parser has no reachability check.
		const { parseOptimizeRequest } = await import("@hobo/core");
		expect(() =>
			parseOptimizeRequest(
				JSON.parse(
					JSON.stringify(optimizeRequest([cyclicSpans()] as never)),
				) as never,
			),
		).not.toThrow();
	});

	it("is refused as unusable rather than read for whichever span came first", async () => {
		// The root span's recorded I/O is what the signature is derived from. A
		// trajectory with no root carries no I/O the engine can read; falling back
		// to `spans[0]` would derive a signature from an arbitrary inner step and
		// train against it as though it were the method's own contract.
		await expect(
			engine().optimize(optimizeRequest([cyclicSpans()] as never) as never),
		).rejects.toThrow();
	});

	it("does not poison a request that also carries a usable trajectory", async () => {
		// Unusable trajectories are filtered, not fatal: one bad recording in a
		// batch must not cost the whole optimization run.
		const candidate = await engine().optimize(
			optimizeRequest([
				cyclicSpans(),
				trajectory("t2", "cannot log in again", "access", 0.95),
			] as never) as never,
		);
		expect(candidate.body.case).toBe("artifact");
	});
});
