import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pactPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"contracts",
	"pacts",
	"code-harness-boundary.pact.json",
);

describe("code harness boundary pact", () => {
	it("documents isolation, cleanup, and squash-only promotion", () => {
		const pact = JSON.parse(readFileSync(pactPath, "utf8")) as {
			consumer: { name: string };
			provider: { name: string };
			interactions: Array<{ description: string; response: { body: unknown } }>;
		};
		expect(pact.consumer.name).toBe("@hobo/code");
		expect(pact.provider.name).toBe("hobo-code-isolation-runtime");
		expect(pact.interactions.length).toBeGreaterThanOrEqual(3);
		const descriptions = pact.interactions.map((i) => i.description);
		expect(descriptions.some((d) => d.includes("worktree"))).toBe(true);
		expect(descriptions.some((d) => d.includes("cleanup"))).toBe(true);
		expect(descriptions.some((d) => d.includes("squash"))).toBe(true);
	});
});
