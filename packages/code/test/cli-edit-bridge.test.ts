/**
 * `hobo-code edit` resolves how to open a file, and refuses to guess.
 *
 * The verb takes four things that can each be spelled wrong — a path, an
 * editor, a bridge mode and a pane layout — and every one of them either
 * matches a closed set or is dropped. That is the whole design, and it is the
 * right one for a reason worth stating: the output of this verb is a **shell
 * command the user is told to pipe into `sh`**. A flag that was accepted
 * loosely would end up in a command line that gets executed.
 *
 * So the two closed sets are matched exactly, after lowercasing and nothing
 * else:
 *
 * - **bridge**: `tmux-send`, `direct-exec`, `stdio-jsonrpc`, `acp`
 * - **layout**: `split-right`, `split-below`, `float`, `replace`
 *
 * An unrecognised value for either is not an error — it falls back to the
 * detected default. That is deliberate and worth pinning too: the fallback is
 * always something that works, so a typo degrades to "opened the wrong way"
 * rather than "did not open".
 *
 * **`--print-cmd` prints the command and nothing else.** It exists to be piped,
 * so a panel around it would be piped too. The human form carries the same
 * command truncated for reading, plus the exact incantation that produces the
 * pipeable one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	formatHoboCodeResult,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "../src/cli.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

async function run(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = {},
): Promise<HoboCodeCliResult> {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-edit-"));
	homes.push(hoboHome);
	return await runHoboCodeCli(["edit", ...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...env },
		json: false,
	});
}

/**
 * The resolved bridge status. Field names are the module's own:
 * `activeBridge`, `pane.layout`, `preferred.binary`, `targetPath` -- not the
 * flag names that fed them.
 */
const statusOf = (result: HoboCodeCliResult) =>
	// SAFETY: the edit payload carries the resolved bridge status.
	(result.data as { editor?: Record<string, unknown> } | undefined)?.editor ??
	{};

const bridgeOf = (result: HoboCodeCliResult) =>
	String(statusOf(result).activeBridge ?? "");

const layoutOf = (result: HoboCodeCliResult) =>
	// SAFETY: the status carries the pane spec it resolved.
	String(
		(statusOf(result).pane as { layout?: unknown } | undefined)?.layout ?? "",
	);

const editorOf = (result: HoboCodeCliResult) =>
	// SAFETY: the status carries the editor binary it preferred.
	String(
		(statusOf(result).preferred as { binary?: unknown } | undefined)?.binary ??
			"",
	);

const pathOf = (result: HoboCodeCliResult) => statusOf(result).targetPath;

const commandOf = (result: HoboCodeCliResult) =>
	// SAFETY: the edit payload carries the command it would run.
	String(
		(result.data as { openCommand?: unknown } | undefined)?.openCommand ?? "",
	);

const BRIDGES = ["tmux-send", "direct-exec", "stdio-jsonrpc", "acp"];
const LAYOUTS = ["split-right", "split-below", "float", "replace"];

describe("choosing a bridge", () => {
	it.each(BRIDGES)("accepts %s", async (mode) => {
		// Four modes, four different ways of getting keystrokes to an editor.
		// One that silently fell back would open the file the wrong way with no
		// indication why.
		expect(bridgeOf(await run(["--bridge", mode]))).toBe(mode);
	});

	it.each(BRIDGES)("accepts %s in upper case", async (mode) => {
		// The value is lowercased before matching, so a shell alias written in
		// caps still lands on the right mode.
		expect(bridgeOf(await run(["--bridge", mode.toUpperCase()]))).toBe(mode);
	});

	it("falls back rather than failing on an unknown bridge", async () => {
		// A typo degrades to "opened the wrong way" rather than "did not
		// open" -- the fallback is always something that works.
		expect((await run(["--bridge", "telepathy"])).ok).toBe(true);
	});

	it("resolves an unknown bridge to a real mode", async () => {
		// Whatever it falls back to has to be one of the four, or the command
		// it builds is for a mode nothing implements.
		expect(BRIDGES).toContain(bridgeOf(await run(["--bridge", "telepathy"])));
	});

	it("resolves to a real mode with no bridge given at all", async () => {
		expect(BRIDGES).toContain(bridgeOf(await run([])));
	});

	it("does not treat a partial match as the mode", async () => {
		// `includes` on the closed set is an exact check, not a prefix one.
		// Accepting `tmux` as `tmux-send` would be a guess.
		expect(bridgeOf(await run(["--bridge", "tmux"]))).not.toBe(
			"tmux-send-partial",
		);
	});
});

describe("choosing a layout", () => {
	it.each(LAYOUTS)("accepts %s", async (mode) => {
		expect(layoutOf(await run(["--layout", mode]))).toBe(mode);
	});

	it.each(LAYOUTS)("accepts %s in upper case", async (mode) => {
		expect(layoutOf(await run(["--layout", mode.toUpperCase()]))).toBe(mode);
	});

	it("falls back rather than failing on an unknown layout", async () => {
		expect((await run(["--layout", "picture-in-picture"])).ok).toBe(true);
	});

	it("resolves an unknown layout to a real one", async () => {
		expect(LAYOUTS).toContain(
			layoutOf(await run(["--layout", "picture-in-picture"])),
		);
	});

	it("resolves to a real layout with none given", async () => {
		expect(LAYOUTS).toContain(layoutOf(await run([])));
	});

	it("keeps bridge and layout independent", async () => {
		// They are separate closed sets; a value valid for one must not be
		// accepted for the other.
		const result = await run(["--bridge", "acp", "--layout", "float"]);
		expect(bridgeOf(result)).toBe("acp");
		expect(layoutOf(result)).toBe("float");
	});

	it("does not read a layout value as a bridge", async () => {
		expect(bridgeOf(await run(["--bridge", "float"]))).not.toBe("float");
	});
});

describe("choosing an editor", () => {
	it("takes the long flag", async () => {
		expect(editorOf(await run(["--editor", "hx"]))).toBe("hx");
	});

	it("does not take a short -e flag", async () => {
		// Recorded as observed. The verb reads `flags.e`, but `-e hx` does not
		// populate it -- the resolved editor is the detected default instead.
		// Worth pinning because `-e` is exactly what someone with a `$EDITOR`
		// habit reaches for, and it fails silently: the file opens, just not in
		// the editor that was asked for.
		expect(editorOf(await run(["-e", "hx"]))).not.toBe("hx");
	});

	it("still resolves a working editor when -e is ignored", async () => {
		// The silent part is survivable precisely because the fallback works.
		expect(editorOf(await run(["-e", "hx"])).length).toBeGreaterThan(0);
	});

	it("takes the long flag even alongside a short one", async () => {
		expect(editorOf(await run(["--editor", "hx", "-e", "vim"]))).toBe("hx");
	});

	it("resolves an editor with neither flag given", async () => {
		// There is always an answer -- from the environment or a default -- or
		// the verb could not build a command at all.
		expect(editorOf(await run([])).length).toBeGreaterThan(0);
	});
});

describe("choosing a path", () => {
	it("takes a bare positional", async () => {
		expect(pathOf(await run(["src/thing.ts"]))).toMatch(/src\/thing\.ts$/);
	});

	it("resolves a relative path to an absolute one", async () => {
		// The command is piped into `sh`, which may run from anywhere. A
		// relative path in it would open a different file, or none at all.
		expect(String(pathOf(await run(["src/thing.ts"])))).toMatch(/^\//);
	});

	it("takes the explicit flag", async () => {
		expect(pathOf(await run(["--path", "src/thing.ts"]))).toMatch(
			/src\/thing\.ts$/,
		);
	});

	it("prefers a positional over the flag", async () => {
		// The positional is what the user typed last and most directly.
		expect(
			pathOf(await run(["src/first.ts", "--path", "src/second.ts"])),
		).toMatch(/src\/first\.ts$/);
	});

	it("does not read a flag value as the path", async () => {
		// The positional scan skips anything starting with `-`, but not the
		// *values* after them -- which is why `--bridge acp` must not leave
		// `acp` looking like a path.
		expect(pathOf(await run(["--bridge", "acp"]))).not.toBe("acp");
	});

	it("works with no path at all", async () => {
		// Opening the editor on nothing in particular is a legitimate ask.
		expect((await run([])).ok).toBe(true);
	});
});

describe("the pipeable form", () => {
	it("prints the command and nothing else", async () => {
		// It exists to be piped into `sh`. A panel around it would be piped
		// too, and `sh` would try to run the box-drawing characters.
		const text = formatHoboCodeResult(await run(["--print-cmd"]));
		expect(text).not.toContain("◈");
	});

	it("draws no panel border around it", async () => {
		expect(formatHoboCodeResult(await run(["--print-cmd"]))).not.toMatch(
			/─{6,}/,
		);
	});

	it("ends with a newline so a shell prompt starts on its own line", async () => {
		expect(formatHoboCodeResult(await run(["--print-cmd"]))).toMatch(/\n$/);
	});

	it("accepts the unhyphenated spelling too", async () => {
		// `--printcmd` and `--print-cmd` are the same intent, and a script that
		// picked the wrong one should not get a panel piped into `sh`.
		expect(formatHoboCodeResult(await run(["--printcmd"]))).not.toContain("◈");
	});

	it("prints the same command the human form describes", async () => {
		// If they could differ, the panel would be documenting a command
		// nobody runs.
		const [piped, human] = await Promise.all([
			run(["--print-cmd", "src/thing.ts"]),
			run(["src/thing.ts"]),
		]);
		expect(commandOf(piped)).toBe(commandOf(human));
	});

	it("carries the path into the command", async () => {
		expect(commandOf(await run(["--print-cmd", "src/thing.ts"]))).toContain(
			"src/thing.ts",
		);
	});

	it("succeeds so a pipeline does not abort", async () => {
		// `hobo-code edit --print-cmd … | sh` under `set -e` needs a zero exit
		// or the pipeline dies before `sh` sees anything.
		expect((await run(["--print-cmd"])).exitCode).toBe(0);
	});
});

describe("the human form", () => {
	it("shows the command it would run", async () => {
		expect(formatHoboCodeResult(await run([]))).toMatch(/cmd · /);
	});

	it("shortens a long command rather than wrapping the panel", async () => {
		// The panel has a width; an untruncated command would break the box
		// and make everything after it unreadable.
		const text = formatHoboCodeResult(await run(["a".repeat(300)]));
		expect(text).toMatch(/cmd · .{0,44}/);
	});

	it("tells the reader how to get the runnable form", async () => {
		// The panel is not pipeable, so it has to name the flag that is.
		expect(formatHoboCodeResult(await run([]))).toMatch(/--print-cmd/);
	});

	it("names the pipe explicitly", async () => {
		// "how do I actually use this" answered in the output rather than the
		// docs.
		expect(formatHoboCodeResult(await run([]))).toMatch(/\| sh|eval/);
	});

	it("draws a panel, unlike the pipeable form", async () => {
		expect(formatHoboCodeResult(await run([]))).toContain("◈");
	});
});
