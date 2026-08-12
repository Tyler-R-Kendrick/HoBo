import { describe, expect, it } from "vitest";

import { rankAtoms, retrieveAtoms } from "../src/atom-index.js";

const EVAL_CASES: ReadonlyArray<{
	readonly intent: string;
	readonly expectTop3: readonly string[];
	readonly emit?: boolean;
}> = [
	{
		intent: "create a hello world app",
		expectTop3: ["hello-world"],
		emit: true,
	},
	{ intent: "hello bindle", expectTop3: ["hello-world"], emit: true },
	{ intent: "barebones app", expectTop3: ["barebones"], emit: true },
	{
		intent: "protobuf and cue",
		expectTop3: ["arch.proto-cue-pair"],
		emit: true,
	},
	{
		intent: "package skeleton",
		expectTop3: ["arch.package-skeleton", "architecture-guard"],
		emit: true,
	},
	{ intent: "konsistent layout", expectTop3: ["arch.konsistent-layout"] },
	{ intent: "pact contract stub", expectTop3: ["arch.pact-stub"] },
	{ intent: "init a station", expectTop3: ["station.init"] },
	{ intent: "firecrawl connector", expectTop3: ["connector.http"] },
	{ intent: "openfeature flag", expectTop3: ["openfeature.flag"] },
	{ intent: "trail step", expectTop3: ["trail.step"] },
	{ intent: "litestream sqlite", expectTop3: ["storage.litestream"] },
];

describe("retrieval evaluation set", () => {
	it("hits expected atoms or compositions in top-3", () => {
		for (const testCase of EVAL_CASES) {
			const ranked = rankAtoms(testCase.intent, 8);
			const ids = ranked.map((hit) => hit.id);
			const hit = testCase.expectTop3.some((id) =>
				ids.slice(0, 3).includes(id),
			);
			expect(hit, `${testCase.intent} → ${ids.join(",")}`).toBe(true);
			if (testCase.emit) {
				const retrieved = retrieveAtoms(testCase.intent);
				expect(retrieved.ok, testCase.intent).toBe(true);
				expect(retrieved.decision).toBe("emit");
			}
		}
	});

	it("refuses a novel intent with no corpus neighbor", () => {
		const hit = retrieveAtoms("compile a rust avionics shader pack");
		expect(hit.ok).toBe(false);
		expect(hit.decision).toBe("refuse");
	});
});
