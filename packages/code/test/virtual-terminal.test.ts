/**
 * tmux `capture-pane` hands back text tmux has already interpreted, which is
 * useless for deciding *when* something happened or what the screen held at a
 * moment. These tests pin that the harness does its own VT parsing — that a
 * pane's raw byte stream, including sequences split across chunks, becomes a
 * structured screen.
 */
import { describe, expect, it } from "vitest";
import {
	createVirtualTerminal,
	pipePaneCommand,
	unpipePaneCommand,
} from "../src/virtual-terminal.js";

describe("a pane's bytes become a screen", () => {
	it("renders plain output at the right positions", async () => {
		const term = createVirtualTerminal({ cols: 40, rows: 5 });
		await term.write("first\r\nsecond\r\n");
		const snap = term.snapshot();
		expect(snap.lines[0]).toBe("first");
		expect(snap.lines[1]).toBe("second");
		expect(snap.cursor.y).toBe(2);
		term.dispose();
	});

	it("resolves cursor movement rather than showing escape codes", async () => {
		const term = createVirtualTerminal({ cols: 40, rows: 5 });
		// Write a word, jump home, overwrite it — a progress line's shape.
		await term.write("working...\x1b[1;1Hdone      ");
		// Trailing spaces are kept: they were *written*, and they are what
		// erased "ing...". Collapsing them would lose the distinction between a
		// cell that was cleared and one that was never touched.
		expect(term.snapshot().lines[0]).toBe("done      ");
		expect(term.snapshot().lines[0]?.trimEnd()).toBe("done");
		expect(term.text()).not.toContain("\x1b");
		term.dispose();
	});

	it("handles a sequence split across chunks", async () => {
		// The case that makes naive string matching wrong: tmux delivers bytes
		// when it has them, not when a sequence is complete.
		const term = createVirtualTerminal({ cols: 40, rows: 5 });
		await term.write("abc\x1b[");
		await term.write("1;1Hxyz");
		expect(term.snapshot().lines[0]).toBe("xyz");
		term.dispose();
	});

	it("applies a clear instead of accumulating text", async () => {
		const term = createVirtualTerminal({ cols: 40, rows: 5 });
		await term.write("noise noise noise");
		await term.write("\x1b[2J\x1b[1;1H");
		await term.write("clean");
		expect(term.text()).toBe("clean");
		term.dispose();
	});

	it("counts the bytes it consumed", async () => {
		const term = createVirtualTerminal({ cols: 40, rows: 5 });
		await term.write("hello");
		await term.write("!");
		expect(term.snapshot().bytes).toBe(6);
		term.dispose();
	});

	it("keeps scrolled-off output in history but not on screen", async () => {
		const term = createVirtualTerminal({ cols: 40, rows: 3 });
		for (let i = 1; i <= 6; i += 1) await term.write(`line${i}\r\n`);
		const visible = term.text();
		expect(visible).not.toContain("line1");
		expect(visible).toContain("line6");
		expect(term.history()).toContain("line1");
		term.dispose();
	});

	it("resizes without reflowing what is already on screen", async () => {
		const term = createVirtualTerminal({ cols: 10, rows: 6 });
		await term.write("abcdefghijklmno");
		expect(term.snapshot().lines[1]?.trimEnd()).toBe("klmno");
		term.resize(40, 6);
		const wide = term.snapshot();
		expect(wide.cols).toBe(40);
		// Existing rows keep their old wrap points — the emulator does not
		// re-lay-out history. Output written *after* the resize uses the new
		// width. Asserting only `cols === 40` would have hidden this, and a
		// caller that expected reflow would be wrong.
		expect(wide.lines[0]?.trimEnd()).toBe("abcdefghij");
		expect(wide.lines[1]?.trimEnd()).toBe("klmno");
		await term.write("\r\n0123456789012345678901234567890123456789012");
		expect(term.snapshot().lines[2]?.trimEnd()).toHaveLength(40);
		term.dispose();
	});
});

describe("streaming a pane out of tmux", () => {
	it("asks for the raw stream, including what is already there", () => {
		// -O matters: without it the emulator starts mid-screen and the first
		// snapshot is missing everything printed before the pipe was attached.
		const cmd = pipePaneCommand("hobo:claude", "/run/pane.log");
		expect(cmd).toContain("pipe-pane");
		expect(cmd).toContain("-O");
		expect(cmd.join(" ")).toContain("'/run/pane.log'");
	});

	it("quotes the sink so a path with a space cannot split the command", () => {
		expect(pipePaneCommand("hobo:claude", "/run/my panes/x.log").join(" ")).toContain(
			"'/run/my panes/x.log'",
		);
	});

	it("neutralises a sink path that would otherwise expand", () => {
		// Double quotes (what JSON.stringify emits) leave `$`, backticks and
		// backslashes live — the same hazard mux.ts documents for cwd.
		const cmd = pipePaneCommand("hobo:claude", "/run/$(touch pwned)/x.log").join(" ");
		expect(cmd).toContain("'/run/$(touch pwned)/x.log'");
		expect(cmd).not.toContain('"/run/$(touch pwned)');
	});

	it("stops streaming with no command argument", () => {
		expect(unpipePaneCommand("hobo:claude")).toEqual(["pipe-pane", "-t", "hobo:claude"]);
	});
});
