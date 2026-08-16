import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	applySettingsToSeatCommand,
	cycleEffort,
	defaultHarnessSettings,
	loadHarnessSettings,
	saveHarnessSettings,
} from "../src/harness-settings.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-settings-"));
	dirs.push(dir);
	return dir;
}

describe("harness-settings", () => {
	it("round-trips model and effort under HOBO_HOME", () => {
		const home = tmp();
		const path = saveHarnessSettings(home, {
			...defaultHarnessSettings("codex"),
			model: "gpt-5.3-codex",
			effort: "high",
		});
		expect(readFileSync(path, "utf8")).toMatch(/gpt-5\.3-codex/);
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.model).toBe("gpt-5.3-codex");
		expect(loaded.effort).toBe("high");
	});

	it("round-trips modelPurl when present", () => {
		const home = tmp();
		saveHarnessSettings(home, {
			...defaultHarnessSettings("codex"),
			model: "gpt-5",
			modelPurl: "pkg:openai/gpt-5?via=codex",
			effort: "medium",
		});
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.model).toBe("gpt-5");
		expect(loaded.modelPurl).toBe("pkg:openai/gpt-5?via=codex");
	});

	it("cycles effort levels", () => {
		expect(cycleEffort("medium", 1)).toBe("high");
		expect(cycleEffort("minimal", -1)).toBe("xhigh");
	});

	it("applies Codex model and effort to the seat command", () => {
		const cmd = applySettingsToSeatCommand("codex", "codex", {
			...defaultHarnessSettings("codex"),
			model: "gpt-5.3-codex",
			effort: "high",
		});
		expect(cmd).toContain("-m gpt-5.3-codex");
		expect(cmd).toContain("model_reasoning_effort=high");
	});
});
