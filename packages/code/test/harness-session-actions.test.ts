/**
 * Harness chrome actions: the pure parts.
 *
 * The action layer is mostly I/O — tmux, durable session control — but three
 * decisions in it are pure and worth pinning, because each encodes a rule that
 * is easy to break without noticing.
 *
 * `harnessActionFromSlash` is a closed mapping. The `default: undefined` arm is
 * the load-bearing one: an unrecognised slash action must produce *nothing*,
 * not a plausible-looking default, because guessing at a session action means
 * guessing at stopping someone's session.
 *
 * `parseHarnessChromeKey` is deprecated and returns undefined for everything.
 * That is deliberate — bare letter hotkeys stole keystrokes from the composer —
 * so a test that it stays inert is a test that the regression stays fixed.
 *
 * `nextAgentTabName` names tmux windows, and its whole job is not colliding
 * with an existing one while keeping the agent id readable. The regex it builds
 * from the agent id also has to survive an id containing regex metacharacters.
 */
import { describe, expect, it } from "vitest";

import {
	harnessActionFromSlash,
	isMuxHarnessSession,
	nextAgentTabName,
	parseHarnessChromeKey,
} from "../src/harness-session-actions.js";
import type { HarnessSessionNode } from "../src/harness-session-view.js";

function session(overrides: Partial<HarnessSessionNode>): HarnessSessionNode {
	return {
		id: "s1",
		branch: "durable",
		...overrides,
	} as HarnessSessionNode;
}

const windows = (...names: string[]) => names.map((name) => ({ name }));

describe("harnessActionFromSlash", () => {
	it.each([
		["session-detach", "detach"],
		["session-stop", "stop"],
		["session-tab", "createTab"],
		["session-pane", "createPane"],
		["session-focus", "focus"],
	])("maps %s to %s", (action, kind) => {
		expect(harnessActionFromSlash(action)).toEqual({ kind });
	});

	it("returns nothing for an unknown action", () => {
		// The load-bearing arm: guessing at a session action means guessing at
		// stopping someone's session.
		expect(harnessActionFromSlash("session-obliterate")).toBeUndefined();
	});

	it("returns nothing for undefined", () => {
		expect(harnessActionFromSlash(undefined)).toBeUndefined();
	});

	it("returns nothing for an empty string", () => {
		expect(harnessActionFromSlash("")).toBeUndefined();
	});

	it("does not match on a prefix", () => {
		expect(harnessActionFromSlash("session-sto")).toBeUndefined();
		expect(harnessActionFromSlash("session-stopped")).toBeUndefined();
	});
});

describe("parseHarnessChromeKey", () => {
	it.each([
		"d",
		"S",
		"t",
		"p",
		"f",
		"\x1b",
		"",
	])("stays inert for %s", (key) => {
		// Deprecated on purpose: bare letters stole keystrokes from the
		// composer. This asserts the regression stays fixed.
		expect(parseHarnessChromeKey(key)).toBeUndefined();
	});
});

describe("isMuxHarnessSession", () => {
	it("recognises an in-session branch", () => {
		expect(isMuxHarnessSession(session({ branch: "in-session" }))).toBe(true);
	});

	it("recognises the hobo session by id", () => {
		expect(isMuxHarnessSession(session({ id: "hobo" }))).toBe(true);
	});

	it("does not claim an ordinary durable session", () => {
		expect(
			isMuxHarnessSession(session({ id: "other", branch: "durable" })),
		).toBe(false);
	});
});

describe("nextAgentTabName", () => {
	it("starts at -2 when no window matches", () => {
		// The first tab is the agent's own name, so a second one is -2.
		expect(nextAgentTabName([], "codex")).toBe("codex-2");
	});

	it("starts at -2 when other agents' windows exist", () => {
		expect(nextAgentTabName(windows("claude", "aider"), "codex")).toBe(
			"codex-2",
		);
	});

	it("counts the bare name as the first", () => {
		expect(nextAgentTabName(windows("codex"), "codex")).toBe("codex-2");
	});

	it("increments past the highest existing suffix", () => {
		expect(nextAgentTabName(windows("codex", "codex-2"), "codex")).toBe(
			"codex-3",
		);
	});

	it("uses the highest suffix, not the count, so gaps do not collide", () => {
		// With three windows present, returning "codex-4" would collide with the
		// existing one. Counting is the bug this guards.
		expect(
			nextAgentTabName(windows("codex", "codex-2", "codex-7"), "codex"),
		).toBe("codex-8");
	});

	it("compares suffixes numerically rather than lexically", () => {
		expect(nextAgentTabName(windows("codex-9", "codex-10"), "codex")).toBe(
			"codex-11",
		);
	});

	it("ignores a window whose name merely starts with the agent id", () => {
		expect(nextAgentTabName(windows("codex-review"), "codex")).toBe("codex-2");
	});

	it("ignores a window whose name merely ends with the agent id", () => {
		expect(nextAgentTabName(windows("my-codex"), "codex")).toBe("codex-2");
	});

	it("sanitizes a dot out of the agent id before naming the window", () => {
		// `safeWindowName` rewrites `.` to `-`, so the name tmux is handed is
		// already metacharacter-free. The regex escaping downstream is therefore
		// belt-and-braces rather than the thing doing the work — worth pinning so
		// a future change to the sanitizer does not quietly re-open that door.
		expect(nextAgentTabName(windows("a.b"), "a.b")).toBe("a-b-2");
	});

	it("counts the sanitized form, so a.b and a-b are the same window family", () => {
		expect(nextAgentTabName(windows("a-b"), "a.b")).toBe("a-b-2");
	});

	it('names an all-punctuation id "pane" rather than handing tmux a bare dash', () => {
		// Note `nextAgentTabName`'s own `|| "agent"` fallback is unreachable:
		// `safeWindowName` never returns an empty string, it returns "pane".
		expect(nextAgentTabName([], "///")).toBe("pane-2");
	});
});
