/**
 * Which editor `hobo-code edit` opens, and how it opens it.
 *
 * The bridge picks a binary and a way to launch it. Both choices are made
 * before anything is spawned, and both have a failure mode that only shows up
 * at the moment the developer is trying to work:
 *
 * **Picking an editor that is not installed** produces a spawn failure the user
 * sees instead of their code. So detection walks PATH and the preference order
 * only ever selects something it actually found — except when the caller names
 * one explicitly, which is treated as an instruction rather than a hint.
 *
 * **An explicitly named editor is honoured even when undetected.** Someone
 * passing `--editor` has a reason: a wrapper script, a not-yet-installed binary,
 * a path the PATH search cannot see. Silently falling back to a different
 * editor would open the wrong program and look like the flag was ignored.
 *
 * The preference order is neovim, vim, helix, then `$EDITOR` — most specific
 * first, with the environment variable last because it is a fallback the user
 * set for *everything*, not a statement about this tool.
 *
 * The bridge modes matter for the same reason. `tmux-send` is the CLI-native
 * default: the editor becomes a managed harness pane beside the agent chrome,
 * rather than a detached window that takes over the terminal. Every mode still
 * publishes a runnable command, because a mode that cannot say how to launch is
 * not an option a caller can take.
 *
 * `env` is an argument throughout, so nothing here depends on what is installed
 * on the machine running the tests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CODE_EDITOR_BRIDGE_SCHEMA,
	editorBridgeHumanSummary,
	editorBridgeOpenScript,
	inspectEditorBridge,
} from "../src/editor-bridge.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** A PATH containing exactly the named binaries, and nothing else. */
function pathWith(...binaries: readonly string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-editor-"));
	dirs.push(dir);
	for (const binary of binaries)
		writeFileSync(join(dir, binary), "", {
			mode: 0o755,
		});
	return dir;
}

const inspect = (options: Parameters<typeof inspectEditorBridge>[0] = {}) =>
	inspectEditorBridge({ env: { PATH: pathWith() }, ...options });

describe("detecting editors", () => {
	it("finds nvim on PATH", () => {
		const status = inspect({ env: { PATH: pathWith("nvim") } });
		expect(
			status.candidates.find((entry) => entry.kind === "neovim")?.detected,
		).toBe(true);
	});

	it("reports an editor that is not installed rather than omitting it", () => {
		// "vim — not found" is the answer to "why did it open nvim?". A list of
		// only what exists cannot explain the choice it made.
		const status = inspect({ env: { PATH: pathWith("nvim") } });
		expect(
			status.candidates.find((entry) => entry.kind === "vim")?.detected,
		).toBe(false);
	});

	it("finds helix under its real binary name", () => {
		// The binary is `hx`, not `helix`; searching for the product name would
		// never find it.
		const status = inspect({ env: { PATH: pathWith("hx") } });
		expect(
			status.candidates.find((entry) => entry.kind === "helix")?.detected,
		).toBe(true);
	});

	it("adds $EDITOR as a candidate when set", () => {
		const dir = pathWith("micro");
		const status = inspect({ env: { PATH: dir, EDITOR: "micro" } });
		expect(status.candidates.some((entry) => entry.kind === "editor-env")).toBe(
			true,
		);
	});

	it("falls back to $VISUAL when $EDITOR is unset", () => {
		// Both are conventional; honouring only one would ignore a setting the
		// user reasonably expects to work.
		const dir = pathWith("micro");
		const status = inspect({ env: { PATH: dir, VISUAL: "micro" } });
		expect(status.candidates.some((entry) => entry.kind === "editor-env")).toBe(
			true,
		);
	});

	it("takes only the program from an $EDITOR carrying flags", () => {
		// `EDITOR="code -w"` is ordinary. Searching PATH for the whole string
		// would find nothing and report a configured editor as missing.
		const dir = pathWith("code");
		const status = inspect({ env: { PATH: dir, EDITOR: "code -w" } });
		expect(
			status.candidates.find((entry) => entry.kind === "editor-env")?.detected,
		).toBe(true);
	});

	it("keeps the full $EDITOR string as the hint", () => {
		// The flags are part of what the user configured, so the diagnostic
		// shows them even though the search ignored them.
		const dir = pathWith("code");
		const status = inspect({ env: { PATH: dir, EDITOR: "code -w" } });
		expect(
			status.candidates.find((entry) => entry.kind === "editor-env")
				?.versionHint,
		).toBe("$EDITOR=code -w");
	});

	it("ignores an empty $EDITOR", () => {
		// An exported-but-empty variable is not a configured editor.
		const status = inspect({ env: { PATH: pathWith(), EDITOR: "   " } });
		expect(status.candidates.some((entry) => entry.kind === "editor-env")).toBe(
			false,
		);
	});

	it("accepts an $EDITOR given as an absolute path", () => {
		// Not every editor is on PATH; a full path is a legitimate way to name
		// one, and the PATH walk alone would miss it.
		const dir = pathWith("micro");
		const absolute = join(dir, "micro");
		const status = inspect({ env: { PATH: "/nonexistent", EDITOR: absolute } });
		expect(
			status.candidates.find((entry) => entry.kind === "editor-env")?.detected,
		).toBe(true);
	});

	it("detects nothing with an empty PATH", () => {
		expect(inspect().candidates.every((entry) => !entry.detected)).toBe(true);
	});
});

describe("choosing the preferred editor", () => {
	it("prefers neovim when several are installed", () => {
		// Most specific first. The nvim extension is the one this tool actually
		// ships, so picking anything else when nvim is there would leave that
		// integration unused.
		const status = inspect({ env: { PATH: pathWith("nvim", "vim", "hx") } });
		expect(status.preferred.kind).toBe("neovim");
	});

	it("falls to vim when nvim is absent", () => {
		const status = inspect({ env: { PATH: pathWith("vim", "hx") } });
		expect(status.preferred.kind).toBe("vim");
	});

	it("falls to helix when neither vim is there", () => {
		const status = inspect({ env: { PATH: pathWith("hx") } });
		expect(status.preferred.kind).toBe("helix");
	});

	it("uses $EDITOR last", () => {
		// It is a fallback the user set for everything, not a statement about
		// this tool — so a real vim beats it.
		const dir = pathWith("vim", "micro");
		const status = inspect({ env: { PATH: dir, EDITOR: "micro" } });
		expect(status.preferred.kind).toBe("vim");
	});

	it("uses $EDITOR when it is the only one detected", () => {
		const dir = pathWith("micro");
		const status = inspect({ env: { PATH: dir, EDITOR: "micro" } });
		expect(status.preferred.kind).toBe("editor-env");
	});

	it("never picks an undetected editor over a detected one", () => {
		// The whole point of detection: a preferred binary that is not there
		// produces a spawn failure the user sees instead of their code.
		const status = inspect({ env: { PATH: pathWith("hx") } });
		expect(status.preferred.detected).toBe(true);
	});

	it("still names a preference when nothing is installed", () => {
		// The command has to say what it *would* run; refusing to answer would
		// make the diagnostic useless on exactly the machine that needs it.
		expect(inspect().preferred.binary.length).toBeGreaterThan(0);
	});
});

describe("an explicitly named editor", () => {
	it("is honoured over the detected preference", () => {
		// Passing `--editor` is an instruction, not a hint.
		const status = inspect({
			env: { PATH: pathWith("nvim", "vim") },
			editor: "vim",
		});
		expect(status.preferred.kind).toBe("vim");
	});

	it("is honoured even when it is not installed", () => {
		// A wrapper script, a not-yet-installed binary, a path PATH cannot see.
		// Silently substituting another editor would open the wrong program and
		// look like the flag was ignored.
		const status = inspect({ env: { PATH: pathWith("nvim") }, editor: "hx" });
		expect(status.preferred.binary).toBe("hx");
	});

	it("reports an unfound named editor as undetected rather than pretending", () => {
		const status = inspect({ editor: "my-editor" });
		expect(status.preferred.detected).toBe(false);
	});

	it("accepts `neovim` as a name for nvim", () => {
		// Two names for one editor; refusing either would make the flag depend
		// on which one the user happens to type.
		const status = inspect({
			env: { PATH: pathWith("nvim") },
			editor: "neovim",
		});
		expect(status.preferred.kind).toBe("neovim");
	});

	it("matches case-insensitively", () => {
		const status = inspect({ env: { PATH: pathWith("vim") }, editor: "VIM" });
		expect(status.preferred.kind).toBe("vim");
	});
});

describe("the pane and the target", () => {
	it("defaults to a right-hand split", () => {
		// The editor sits beside the agent chrome rather than replacing it —
		// the CLI-native shape this bridge exists to produce.
		expect(inspect().pane.layout).toBe("split-right");
	});

	it("takes the layout it was given", () => {
		expect(inspect({ layout: "float" }).pane.layout).toBe("float");
	});

	it("names the pane after the run when there is one", () => {
		// Two concurrent runs must not share a pane, or one would type into the
		// other's editor.
		expect(inspect({ runId: "run-7" }).pane.id).toBe("edit-run-7");
	});

	it("uses a stable pane id when there is no run", () => {
		expect(inspect().pane.id).toBe("edit-main");
	});

	it("resolves a relative path to an absolute one", () => {
		// The command runs in a pane whose working directory is not necessarily
		// the caller's, so a relative path would open the wrong file.
		const status = inspect({ path: "src/index.ts" });
		expect(status.targetPath).toBe(resolve("src/index.ts"));
	});

	it("falls back to the isolation root when no path is given", () => {
		// `hobo-code edit` inside an isolated run means "open the run", not
		// "open wherever the shell happens to be".
		const root = mkdtempSync(join(tmpdir(), "hobo-iso-"));
		dirs.push(root);
		expect(editorBridgeOpenScript(inspect({ isolationRoot: root }))).toContain(
			root,
		);
	});

	it("falls back to the current directory when there is neither", () => {
		expect(editorBridgeOpenScript(inspect())).toContain('"."');
	});

	it("quotes the target so a path with spaces survives", () => {
		// An unquoted path with a space becomes two arguments, and the editor
		// opens two files that do not exist.
		const dir = mkdtempSync(join(tmpdir(), "hobo editor space-"));
		dirs.push(dir);
		mkdirSync(join(dir, "sub"), { recursive: true });
		const status = inspect({ path: join(dir, "sub") });
		expect(editorBridgeOpenScript(status)).toContain('"');
	});
});

describe("bridge modes", () => {
	it("offers every mode a command that can be run", () => {
		// A mode that cannot say how to launch is not an option a caller can
		// take.
		for (const bridge of inspect().bridges) {
			expect(bridge.openCommand.length).toBeGreaterThan(0);
		}
	});

	it("defaults to the tmux pane when tmux is installed", () => {
		// Direct exec replaces focus; the managed pane is what keeps the agent
		// chrome visible beside the editor, so it is preferred where possible.
		expect(
			inspect({ env: { PATH: pathWith("tmux", "nvim") } }).activeBridge,
		).toBe("tmux-send");
	});

	it("falls back to direct exec when tmux is not installed", () => {
		// Defaulting to a tmux command on a machine without tmux would emit a
		// command that cannot run — worse than the simpler mode that can.
		expect(inspect({ env: { PATH: pathWith("nvim") } }).activeBridge).toBe(
			"direct-exec",
		);
	});

	it("takes the bridge it was given", () => {
		expect(inspect({ bridge: "direct-exec" }).activeBridge).toBe("direct-exec");
	});

	it("returns the command for the active bridge", () => {
		const status = inspect({ bridge: "direct-exec" });
		const direct = status.bridges.find((b) => b.mode === "direct-exec");
		expect(editorBridgeOpenScript(status)).toBe(direct?.openCommand);
	});

	it("names the editor binary in the direct command", () => {
		const status = inspect({
			env: { PATH: pathWith("vim") },
			bridge: "direct-exec",
		});
		expect(editorBridgeOpenScript(status)).toContain("vim");
	});

	it("opens the tmux split in the isolation root, not the caller's cwd", () => {
		// A pane that started in the wrong directory would show the wrong
		// project's files.
		const root = mkdtempSync(join(tmpdir(), "hobo-iso-"));
		dirs.push(root);
		const status = inspect({ bridge: "tmux-send", isolationRoot: root });
		expect(editorBridgeOpenScript(status)).toContain(root);
	});

	it("titles the tmux pane so it can be found again", () => {
		const status = inspect({ bridge: "tmux-send" });
		expect(editorBridgeOpenScript(status)).toContain(status.pane.title);
	});

	it("falls back to a bare editor invocation for an unknown bridge", () => {
		// The script is what actually runs; returning nothing would be a silent
		// no-op where the user expected an editor.
		const status = inspect();
		const script = editorBridgeOpenScript({
			...status,
			// SAFETY: the fixture supplies an out-of-contract mode deliberately.
			activeBridge: "no-such-bridge" as never,
		});
		expect(script).toContain(status.preferred.binary);
	});
});

describe("the surface as a whole", () => {
	it("stamps its schema", () => {
		expect(inspect().schema).toBe(CODE_EDITOR_BRIDGE_SCHEMA);
	});

	it("renders a summary with nothing installed", () => {
		expect(editorBridgeHumanSummary(inspect()).length).toBeGreaterThan(0);
	});

	it("reads differently once an editor is found", () => {
		const bare = editorBridgeHumanSummary(inspect());
		const found = editorBridgeHumanSummary(
			inspect({ env: { PATH: pathWith("nvim") } }),
		);
		expect(found).not.toBe(bare);
	});

	it("carries the legend into the summary", () => {
		const status = inspect();
		expect(editorBridgeHumanSummary(status)).toContain(status.legend);
	});

	it("offers CLI navigation hints", () => {
		// The bridge is half of the story; the other half is moving around
		// without leaving the terminal.
		expect(inspect().cliNavigation.length).toBeGreaterThan(0);
	});
});
