// Compile-time tests: `tsc -p tsconfig.types.json`, which the package's
// `typecheck` script runs, must pass. Under vitest an `expectTypeOf` checks
// nothing; only tsc does.
import { describe, expectTypeOf, it } from "vitest";

import type { VercelFetch } from "../src/vercel-client.js";

type SentInit = Parameters<VercelFetch>[1];

describe("VercelFetch", () => {
	it("is handed a request that may carry no body", () => {
		expectTypeOf<SentInit["body"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<{
			readonly method: string;
			readonly headers: Record<string, string>;
		}>().toExtend<SentInit>();
	});
});
