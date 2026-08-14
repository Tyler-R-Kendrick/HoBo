import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TUI_FORBIDDEN_HEX, TUI_TOKENS } from "../src/tui-tokens.js";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("TUI components follow DESIGN.md tokens", () => {
	it("does not invent off-system colours in React-style chrome", () => {
		const source = readFileSync(join(srcRoot, "tui-components.tsx"), "utf8");
		for (const hex of TUI_FORBIDDEN_HEX) {
			expect(source).not.toContain(hex);
		}
		expect(source).toContain("TUI_TOKENS.ink");
		expect(source).toContain("TUI_TOKENS.paper");
		expect(TUI_TOKENS.spark).toBe("#c5301c");
		expect(TUI_TOKENS.go).toBe("#14672c");
	});
});
