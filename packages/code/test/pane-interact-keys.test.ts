/**
 * Forwarding keystrokes into an attached tmux pane.
 *
 * When you attach to a pane inside the Agents bezel, every key you press has
 * to reach the program running in there — a nested CLI, an editor, a REPL —
 * while two keys are held back to get you out again. Getting either half wrong
 * is bad in a specific way:
 *
 * **A key that does not translate is a key the nested program never sees.**
 * Not an error, not a beep: you press Up and nothing happens, and there is no
 * way to tell a dead key from a program that ignored it. So the translation
 * covers named keys, arrows, ctrl and alt combinations, shifted letters, raw
 * escape sequences, and finally plain text — with a literal-text fallback so an
 * unrecognised printable chunk still arrives.
 *
 * **A detach key that leaked through would strand you.** Ctrl+] and Ctrl+\ are
 * how you leave; if they were forwarded to the nested program instead, the only
 * way out would be killing the pane. Both are checked first, ahead of every
 * other rule, and in every encoding a terminal might send them — including the
 * Kitty CSI-u forms, because a terminal that speaks Kitty would otherwise send
 * a sequence nothing here recognises.
 *
 * **Kitty CSI-u is normalised on the way in.** Nested CLIs do not speak it, so
 * forwarding it verbatim would deliver an escape sequence the program renders
 * as garbage rather than acts on.
 *
 * The `-l` flag matters throughout: it tells tmux to send text *literally*
 * rather than interpreting it as a key name. Without it a pane receiving the
 * letters `Up` would act as though the up-arrow had been pressed.
 */
import { describe, expect, it } from "vitest";

import {
	AGENTS_ATTACH_HINT,
	attachTmuxFullscreen,
	isPaneInteractDetach,
	PANE_INTERACT_DETACH,
	PANE_INTERACT_DETACH_ALT,
	PANE_INTERACT_HINT,
	sendKeysToPane,
	tmuxKeyArgvForInput,
} from "../src/pane-interact.js";

const argv = (data: string) => tmuxKeyArgvForInput(data).map((a) => [...a]);

/** A mux runner that records every argv it was asked to run. */
function recordingRunner() {
	const calls: string[][] = [];
	return {
		calls,
		runner: {
			run: async (args: readonly string[]) => {
				calls.push([...args]);
				return { code: 0, stdout: "", stderr: "" };
			},
			// SAFETY: the callers here use exactly the `run` method a runner names.
		} as never,
	};
}

describe("leaving the pane", () => {
	it("recognises Ctrl+]", () => {
		// If this leaked through to the nested program, the only way out would
		// be killing the pane.
		expect(isPaneInteractDetach(PANE_INTERACT_DETACH)).toBe(true);
	});

	it("recognises Ctrl+backslash", () => {
		// The alternate exists because some terminals swallow Ctrl+].
		expect(isPaneInteractDetach(PANE_INTERACT_DETACH_ALT)).toBe(true);
	});

	for (const [name, seq] of [
		["GS", "\x1b[29;5u"],
		["]", "\x1b[93;5u"],
		["FS", "\x1b[28;5u"],
		["backslash", "\x1b[92;5u"],
	] as const) {
		it(`recognises the Kitty CSI-u form for ${name}`, () => {
			// A terminal in Kitty mode sends these instead of the control byte.
			// Missing one would make the detach key silently stop working on
			// that terminal only — the worst kind of bug to reproduce.
			expect(isPaneInteractDetach(seq)).toBe(true);
		});
	}

	it("does not treat an ordinary key as detach", () => {
		// Over-matching here is worse than under-matching: it would drop the
		// user out of the pane mid-keystroke.
		for (const data of ["a", "\r", "\x1b[A", "\x03", ""]) {
			expect(isPaneInteractDetach(data)).toBe(false);
		}
	});

	it("forwards nothing for a detach key", () => {
		// Checked ahead of every other rule — a detach that also reached the
		// nested program would leave a stray keystroke behind.
		expect(argv(PANE_INTERACT_DETACH)).toStrictEqual([]);
		expect(argv(PANE_INTERACT_DETACH_ALT)).toStrictEqual([]);
	});
});

describe("keys that carry no input", () => {
	it("forwards nothing for an empty chunk", () => {
		expect(argv("")).toStrictEqual([]);
	});

	it("forwards nothing for an unrecognised escape sequence", () => {
		// A sequence containing ESC that matched no rule is a terminal report
		// or a mode change, not a keystroke. Sending it literally would print
		// escape garbage into the nested program.
		expect(argv("\x1b[>1;95;0c")).toStrictEqual([]);
	});
});

describe("arrow keys", () => {
	for (const [seq, expected] of [
		["\x1b[A", "Up"],
		["\x1b[B", "Down"],
		["\x1b[C", "Right"],
		["\x1b[D", "Left"],
	] as const) {
		it(`forwards ${expected} in CSI form`, () => {
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}

	for (const [seq, expected] of [
		["\x1bOA", "Up"],
		["\x1bOB", "Down"],
		["\x1bOC", "Right"],
		["\x1bOD", "Left"],
	] as const) {
		it(`forwards ${expected} in SS3 form`, () => {
			// Terminals in application-cursor mode send SS3 instead of CSI.
			// Handling only one form breaks arrows inside anything that sets
			// that mode — which is most full-screen programs.
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}
});

describe("control keys", () => {
	for (const [seq, expected] of [
		["\r", "Enter"],
		["\n", "Enter"],
		["\t", "Tab"],
		["\x7f", "BSpace"],
		["\b", "BSpace"],
		["\x1b", "Escape"],
		["\x03", "C-c"],
		["\x04", "C-d"],
	] as const) {
		it(`forwards ${JSON.stringify(seq)} as ${expected}`, () => {
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}

	it("treats both carriage return and newline as Enter", () => {
		// Terminals disagree about which one Enter sends; a pane that only
		// accepted one would appear to ignore the return key.
		expect(argv("\r")).toStrictEqual(argv("\n"));
	});

	it("treats both DEL and backspace as BSpace", () => {
		expect(argv("\x7f")).toStrictEqual(argv("\b"));
	});

	it("forwards a bare Escape rather than swallowing it", () => {
		// Escape is a real key inside vim and every menu-driven CLI. Dropping
		// it because it looks like an incomplete sequence would make those
		// programs unusable in an attached pane.
		expect(argv("\x1b")).toStrictEqual([["Escape"]]);
	});
});

describe("printable text", () => {
	it("sends a single character literally", () => {
		// `-l` tells tmux to send text rather than interpret it as a key name.
		// Without it a pane receiving `Up` would act as though the arrow was
		// pressed.
		expect(argv("a")).toStrictEqual([["-l", "--", "a"]]);
	});

	it("sends a pasted run of text literally", () => {
		// A paste arrives as one chunk. Translating it key by key would be
		// slower and would mangle anything that looked like a key name.
		expect(argv("hello world")).toStrictEqual([["-l", "--", "hello world"]]);
	});

	it("uses the argument terminator so text starting with a dash is not a flag", () => {
		// `--` is what stops tmux reading `-n` as an option. Without it a paste
		// beginning with a dash would be parsed as flags and either error or do
		// something else entirely.
		expect(argv("-n")).toStrictEqual([["-l", "--", "-n"]]);
	});

	it("sends a digit literally", () => {
		expect(argv("7")).toStrictEqual([["-l", "--", "7"]]);
	});

	it("sends a punctuation character literally", () => {
		expect(argv(";")).toStrictEqual([["-l", "--", ";"]]);
	});

	it("sends a multi-byte character literally", () => {
		// Emoji and non-Latin text arrive as multi-byte chunks; a byte-wise
		// path would split them and deliver mojibake.
		expect(argv("é")).toStrictEqual([["-l", "--", "é"]]);
	});
});

describe("modified keys parsed by name", () => {
	/**
	 * These reach the *parsed* branch rather than the raw-sequence switch.
	 * `parseKey` turns a byte sequence into a name like `shift+up`, and only
	 * names absent from the tmux table fall through to the regex arms below —
	 * plain arrows are caught by the table first.
	 */
	for (const [seq, expected] of [
		["\x1b[1;2A", "Up"],
		["\x1b[1;2B", "Down"],
		["\x1b[1;2D", "Left"],
		["\x1b[1;2C", "Right"],
	] as const) {
		it(`forwards a shifted arrow as ${expected}`, () => {
			// tmux `send-keys` has no shifted-arrow name, so the modifier is
			// dropped and the direction is kept. Dropping the whole key instead
			// would make shift-arrow selection dead inside every nested editor.
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}

	it("forwards a ctrl-modified arrow by direction too", () => {
		// Same reasoning as shift: the direction is the part tmux can carry.
		expect(argv("\x1b[1;5A")).toStrictEqual([["Up"]]);
	});

	for (const [seq, expected] of [
		["\x06", "C-f"],
		["\x11", "C-q"],
	] as const) {
		it(`forwards ${expected} for a ctrl letter outside the named table`, () => {
			// The table lists the common ones; the regex is what stops every
			// other ctrl chord from being silently dropped.
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}

	it("lowercases a ctrl letter so tmux recognises it", () => {
		// tmux names are `C-f`, never `C-F`; an uppercase name is rejected and
		// the key never arrives.
		expect(argv("\x06")).toStrictEqual([["C-f"]]);
	});

	it("forwards an alt letter as a meta chord", () => {
		// Alt is `M-` in tmux. Meta chords are how readline-style editing works
		// inside a nested shell.
		expect(argv("\x1ba")).toStrictEqual([["M-a"]]);
	});

	it("forwards an alt digit as a meta chord", () => {
		// Alt+digit selects a window or a tab in most nested programs.
		expect(argv("\x1b1")).toStrictEqual([["M-1"]]);
	});

	it("sends a parsed single character literally", () => {
		// `parseKey` returns the character itself for an ordinary letter; it
		// still has to go literally, or tmux would look for a key of that name.
		expect(argv("b")).toStrictEqual([["-l", "--", "b"]]);
	});

	it("sends a capital letter literally rather than as a key name", () => {
		// `A` is a printable character, not the `A` key name — sending it
		// unliterally would be interpreted as something else entirely.
		expect(argv("A")).toStrictEqual([["-l", "--", "A"]]);
	});

	for (const [name, seq, expected] of [
		["enter", "\r", "Enter"],
		["tab", "\t", "Tab"],
		["escape", "\x1b", "Escape"],
	] as const) {
		it(`prefers the named tmux key for ${name}`, () => {
			// The named table is consulted before every regex, so these resolve
			// to a tmux key name rather than being sent as literal control
			// bytes that the nested program would have to decode itself.
			expect(argv(seq)).toStrictEqual([[expected]]);
		});
	}
});

describe("keys a terminal reports but the pane should not receive", () => {
	it("forwards nothing for a key-release event", () => {
		// Terminals in Kitty mode report press *and* release. Forwarding the
		// release would type every character twice.
		expect(argv("\x1b[97;1:3u")).toStrictEqual([]);
	});

	it("forwards a shifted letter as its uppercase, literally", () => {
		// `shift+b` is not a tmux key name — it is the letter B. Sending the
		// name would look for a key called "shift+b" and deliver nothing, and
		// sending it unliterally would let tmux reinterpret it.
		expect(argv("\x1b[98;2u")).toStrictEqual([["-l", "--", "B"]]);
	});

	it("normalises the Kitty form of a ctrl chord", () => {
		// Nested CLIs do not speak Kitty CSI-u, so it is translated to the
		// tmux name rather than forwarded as an escape sequence the program
		// would render as garbage.
		expect(argv("\x1b[98;5u")).toStrictEqual([["C-b"]]);
	});
});

describe("sending to a pane", () => {
	it("targets the pane it was given", async () => {
		const { runner, calls } = recordingRunner();
		await sendKeysToPane(runner, "%3", "a");
		expect(calls).toStrictEqual([["send-keys", "-t", "%3", "-l", "--", "a"]]);
	});

	it("sends nothing at all for a detach key", async () => {
		// The pane must not see the key that is taking the user out of it.
		const { runner, calls } = recordingRunner();
		await sendKeysToPane(runner, "%3", PANE_INTERACT_DETACH);
		expect(calls).toStrictEqual([]);
	});

	it("sends nothing for an empty chunk", async () => {
		const { runner, calls } = recordingRunner();
		await sendKeysToPane(runner, "%3", "");
		expect(calls).toStrictEqual([]);
	});

	it("forwards a named key by its tmux name", async () => {
		const { runner, calls } = recordingRunner();
		await sendKeysToPane(runner, "%3", "\x1b[A");
		expect(calls).toStrictEqual([["send-keys", "-t", "%3", "Up"]]);
	});
});

describe("the fullscreen attach escape hatch", () => {
	const attachOptions = (overrides: Record<string, unknown> = {}) => ({
		session: "hobo",
		window: "agents",
		attach: async () => 0,
		...overrides,
	});

	it("selects the window before attaching", async () => {
		// Attaching without selecting would drop the user into whichever window
		// the session last had focused — not the one they asked for.
		const { runner, calls } = recordingRunner();
		await attachTmuxFullscreen(attachOptions({ runner }));
		expect(calls[0]).toStrictEqual(["select-window", "-t", "hobo:agents"]);
	});

	it("selects a pane when one is named", async () => {
		const { runner, calls } = recordingRunner();
		await attachTmuxFullscreen(attachOptions({ runner, pane: "%7" }));
		expect(calls).toContainEqual(["select-pane", "-t", "%7"]);
	});

	it("does not select a pane when none is named", async () => {
		// Selecting a default pane would move focus away from wherever the
		// window already had it.
		const { runner, calls } = recordingRunner();
		await attachTmuxFullscreen(attachOptions({ runner }));
		expect(calls.some((call) => call[0] === "select-pane")).toBe(false);
	});

	it("binds the detach key without a prefix", async () => {
		// Fullscreen tmux would otherwise require its own prefix before Ctrl+],
		// which is not what the rest of the product taught the user.
		const { runner, calls } = recordingRunner();
		await attachTmuxFullscreen(attachOptions({ runner }));
		expect(calls).toContainEqual(["bind-key", "-n", "C-]", "detach-client"]);
	});

	it("attaches to the session it was given", async () => {
		const seen: string[][] = [];
		await attachTmuxFullscreen(
			attachOptions({
				attach: async (args: readonly string[]) => {
					seen.push([...args]);
					return 0;
				},
			}),
		);
		expect(seen).toStrictEqual([["attach-session", "-t", "hobo"]]);
	});

	it("works with no runner at all", async () => {
		// The runner is optional; a caller that only wants the attach should
		// not have to supply one.
		await expect(attachTmuxFullscreen(attachOptions())).resolves.toMatchObject({
			code: 0,
		});
	});

	it("reports a clean detach in words", async () => {
		// The user is coming back to the product TUI and needs to know the
		// attach ended normally rather than crashed.
		const result = await attachTmuxFullscreen(attachOptions());
		expect(result.detail).toMatch(/detached from hobo:agents/);
	});

	it("reports a non-zero exit with its code and target", async () => {
		// A failed attach and a clean detach look identical from the outside;
		// the code is the only thing that distinguishes them.
		const result = await attachTmuxFullscreen(
			attachOptions({ attach: async () => 1 }),
		);
		expect(result.detail).toMatch(/exited 1 \(hobo:agents\)/);
	});

	it("reports a null exit rather than treating it as success", async () => {
		// A process killed by a signal exits null. Reading that as zero would
		// tell the user their session detached cleanly when it was terminated.
		const result = await attachTmuxFullscreen(
			attachOptions({ attach: async () => null }),
		);
		expect(result.code).toBeNull();
		expect(result.detail).toMatch(/exited null/);
	});
});

describe("the on-screen hints", () => {
	it("names both ways out in the attached hint", () => {
		// The user is inside a nested program with their keys being forwarded;
		// the footer is the only place the exit is written down.
		expect(PANE_INTERACT_HINT).toMatch(/Ctrl\+\\/);
		expect(PANE_INTERACT_HINT).toMatch(/\[/);
	});

	it("tells the user how to attach before they do", () => {
		expect(AGENTS_ATTACH_HINT).toMatch(/Enter attach/);
	});

	it("names the leave keys in the pre-attach hint too", () => {
		// Read before committing to the attach — someone who cannot see the way
		// out reasonably declines to go in.
		expect(AGENTS_ATTACH_HINT).toMatch(/leave/);
	});
});
