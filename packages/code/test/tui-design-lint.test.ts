import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TUI_FORBIDDEN_HEX, TUI_TOKEN_VALUES } from "../src/tui-tokens.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(pkgRoot, "src");
const designMd = readFileSync(join(pkgRoot, "DESIGN.md"), "utf8");

function tuiChromeFiles(): string[] {
	return readdirSync(srcRoot)
		.filter((name) => /^tui-.*\.(ts|tsx)$/u.test(name))
		.sort();
}

function exportedComponents(source: string): string[] {
	const names: string[] = [];
	const re = /^export function ([A-Z][A-Za-z0-9]+)\(/gmu;
	let match = re.exec(source);
	while (match) {
		const name = match[1];
		if (name !== undefined) names.push(name);
		match = re.exec(source);
	}
	return names;
}

function hexLiterals(source: string): string[] {
	return source.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/gu) ?? [];
}

describe("TUI components follow DESIGN.md tokens", () => {
	it("lints every tui-* chrome file, not a hardcoded allow-list", () => {
		const files = tuiChromeFiles();
		expect(files).toEqual(
			expect.arrayContaining([
				"tui-broadcast.ts",
				"tui-components.tsx",
				"tui-render.ts",
				"tui-layout.ts",
				"tui-tokens.ts",
			]),
		);
		for (const file of files) {
			const source = readFileSync(join(srcRoot, file), "utf8");
			if (file !== "tui-tokens.ts") {
				for (const hex of TUI_FORBIDDEN_HEX) {
					expect(source, `${file} must not use ${hex}`).not.toContain(hex);
				}
				for (const hex of hexLiterals(source)) {
					expect(
						TUI_TOKEN_VALUES.has(hex.toLowerCase()) ||
							TUI_TOKEN_VALUES.has(hex),
						`${file} hex ${hex} must be a TUI_TOKENS value`,
					).toBe(true);
				}
			}
			expect(source, `${file} must not use hairline rules`).not.toContain(
				"───",
			);
		}
	});

	it("keeps every exported TUI component named in DESIGN.md", () => {
		const source = readFileSync(join(srcRoot, "tui-components.tsx"), "utf8");
		const components = exportedComponents(source);
		expect(components).toEqual(
			expect.arrayContaining([
				"BroadcastFrame",
				"ShellChrome",
				"ChatTranscript",
				"SlashPalette",
				"ApprovalDialog",
			]),
		);
		for (const name of components) {
			expect(
				designMd.includes(name),
				`DESIGN.md must mention ${name} so lint stays in scope`,
			).toBe(true);
		}
		expect(designMd).toContain("BroadcastFrame");
		expect(designMd).toContain("broadcast-frame");
	});
});
