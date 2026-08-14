import { describe, expect, it } from "vitest";

import type { MuxRunner } from "../src/mux.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	classifyWindowName,
	cycleInSessionWindow,
	emptyInSessionPanes,
	ensureInSessionPanes,
	isProductPrompt,
	pickCodingWindow,
	pickSendWindow,
} from "../src/in-session-panes.js";

function fakeRunner(script: {
	readonly versionOk?: boolean;
	readonly windows?: string;
	readonly applyOk?: boolean;
}): MuxRunner {
	return {
		run: async (args) => {
			if (args[0] === "-V") {
				return { code: script.versionOk === false ? 1 : 0, stdout: "tmux 3.4" };
			}
			if (args[0] === "has-session") {
				return { code: 0, stdout: "" };
			}
			if (args[0] === "list-windows") {
				return { code: 0, stdout: script.windows ?? "codex\t%1\nhobo-code\t%0\n" };
			}
			if (args[0] === "capture-pane") {
				return { code: 0, stdout: "codex › ready\n" };
			}
			if (args[0] === "new-session" || args[0] === "new-window") {
				return { code: script.applyOk === false ? 1 : 0, stdout: "%1\n" };
			}
			return { code: 0, stdout: "" };
		},
	};
}

describe("in-session panes", () => {
	it("prefers Codex over other coding CLIs", () => {
		const picked = pickCodingWindow([
			{ name: "hobo-code", target: "%0", kind: "harness" },
			{ name: "claude", target: "%2", kind: "coding-agent" },
			{ name: "codex", target: "%1", kind: "coding-agent" },
		]);
		expect(picked?.name).toBe("codex");
		expect(classifyWindowName("codex")).toBe("coding-agent");
	});

	it("keeps slash and btw on the product shell", () => {
		expect(isProductPrompt("/dev")).toBe(true);
		expect(isProductPrompt("btw what is this")).toBe(true);
		expect(isProductPrompt("add a login form")).toBe(false);
	});

	it("cycles windows without leaving the session", () => {
		const next = cycleInSessionWindow(
			{
				session: "hobo",
				windows: [
					{ name: "codex", target: "%1", kind: "coding-agent" },
					{ name: "claude", target: "%2", kind: "coding-agent" },
				],
				focused: 0,
				capture: "",
				note: "",
				tmux: true,
			},
			1,
		);
		expect(next.focused).toBe(1);
		expect(next.windows[next.focused]?.name).toBe("claude");
	});

	it("explains a missing tmux instead of asking the user to attach", async () => {
		const panes = await ensureInSessionPanes({
			runner: fakeRunner({ versionOk: false }),
			env: { PATH: "", HOME: "/tmp" },
		});
		expect(panes.windows).toEqual([]);
		expect(panes.note).toMatch(/tmux is not available/i);
	});

	it("returns empty panes when no agent CLI is on PATH", async () => {
		const panes = await ensureInSessionPanes({
			runner: fakeRunner({}),
			env: { PATH: "/empty", HOME: "/tmp" },
		});
		expect(panes.note).toMatch(/no agent CLI/i);
	});

	it("does not send to the harness pane even when it is focused", () => {
		const target = pickSendWindow({
			session: "hobo",
			windows: [
				{ name: "hobo-code", target: "%0", kind: "harness" },
				{ name: "codex", target: "%1", kind: "coding-agent" },
			],
			focused: 0,
			capture: "",
			note: "",
			tmux: true,
		});
		expect(target?.name).toBe("codex");
	});

	it("seats detected coding CLIs and skips the harness", async () => {
		const bin = mkdtempSync(join(tmpdir(), "hobo-panes-"));
		writeFileSync(join(bin, "codex"), "");
		writeFileSync(join(bin, "hobo-code"), "");
		const panes = await ensureInSessionPanes({
			runner: fakeRunner({ windows: "codex\t%1\n" }),
			env: { PATH: bin, HOME: bin },
			cwd: bin,
		});
		expect(panes.tmux).toBe(true);
		expect(panes.windows.map((row) => row.name)).toContain("codex");
		expect(panes.windows.map((row) => row.name)).not.toContain("hobo-code");
		expect(panes.note).toMatch(/in-session · codex/i);
	});
});
