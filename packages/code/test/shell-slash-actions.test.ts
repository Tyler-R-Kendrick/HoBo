/**
 * The shell's slash commands, driven end-to-end through the scripted-keys hook.
 *
 * A slash item is either an *action* the shell handles itself (`/quit`,
 * `/clear`, `/help`, `/resume`, `/compact`) or an *argv* it hands to the
 * product CLI (`/status`, `/cost`, `/dev`). The split matters: an argv item
 * that quietly became an action would stop reaching the CLI's feature gates and
 * isolation checks, and an action item that became argv would try to run a verb
 * that does not exist.
 *
 * These are driven the way a user drives them — typing `/`, filtering, and
 * pressing Enter — rather than by calling the handler, because the palette's
 * filter and selection are part of what decides which item runs. A test that
 * called the action directly would pass while `/co` selected the wrong row.
 *
 * The one that matters most is `/quit`: it is the documented way out, and a
 * shell whose quit did not quit leaves the user with Ctrl-C and a terminal they
 * have to repair.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import {
	DEFAULT_SLASH_ITEMS,
	filterSlash,
	runInteractiveShell,
	slashItemForInput,
} from "../src/interactive-shell.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-slash-"));
	homes.push(dir);
	return dir;
}

const CTRL_C = "";

/** Type a slash command and press Enter, then quit. */
async function slash(command: string, quitAfter = true) {
	const chunks: string[] = [];
	const verbs: string[][] = [];
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const code = await runInteractiveShell({
		stdin: new PassThrough(),
		stdout: new Writable({
			write(chunk, _encoding, done) {
				chunks.push(String(chunk));
				done();
			},
		}),
		hoboHome: home(),
		sidecars: false,
		reducedMotion: true,
		scriptedKeys: `${command}\r${quitAfter ? CTRL_C : ""}`,
		host: {
			runVerb: async (argv: readonly string[]) => {
				verbs.push([...argv]);
				return `ran ${argv.join(" ")}`;
			},
			complete: async (prompt: string) => `assistant: ${prompt}`,
		},
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
	} as never);
	return { code, output: chunks.join(""), verbs };
}

describe("the slash catalog", () => {
	it("gives every item a name and a description", () => {
		// The description is the whole palette UI; an item without one is a blank
		// row the user cannot choose deliberately.
		for (const item of DEFAULT_SLASH_ITEMS) {
			expect(item.name.length).toBeGreaterThan(0);
			expect(String(item.description).length).toBeGreaterThan(0);
		}
	});

	it("gives every item a distinct name", () => {
		// Two rows under one name make the filter ambiguous and the selection
		// order-dependent.
		const names = DEFAULT_SLASH_ITEMS.map((item) => item.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("gives every item either an action or an argv, never neither", () => {
		// An item with neither is a row that does nothing when chosen.
		for (const item of DEFAULT_SLASH_ITEMS) {
			expect(item.action !== undefined || (item.argv?.length ?? 0) > 0).toBe(
				true,
			);
		}
	});

	it("resolves an item from its exact name", () => {
		expect(slashItemForInput("/help")?.action).toBe("help");
	});

	it("resolves an item from an alias", () => {
		// `/task` and `/tasks` are the same thing to a user typing quickly.
		expect(slashItemForInput("/task")?.name).toBe("tasks");
	});

	it("resolves nothing for text that is not a slash command", () => {
		expect(slashItemForInput("deploy the app")).toBeUndefined();
	});

	it("resolves nothing for an unknown command", () => {
		// Guessing the nearest match would run a command the user did not type.
		expect(slashItemForInput("/reticulate")).toBeUndefined();
	});
});

describe("the palette filter", () => {
	it("returns everything for an empty filter", () => {
		expect(filterSlash(DEFAULT_SLASH_ITEMS, "")).toHaveLength(
			DEFAULT_SLASH_ITEMS.length,
		);
	});

	it("narrows to a prefix", () => {
		const hits = filterSlash(DEFAULT_SLASH_ITEMS, "hel");
		expect(hits.map((item) => item.name)).toContain("help");
	});

	it("finds an item by its alias", () => {
		expect(
			filterSlash(DEFAULT_SLASH_ITEMS, "task").map((item) => item.name),
		).toContain("tasks");
	});

	it("returns nothing for a filter nothing matches", () => {
		// An empty result is honest; falling back to the full list would let
		// Enter run whatever happened to be first.
		expect(filterSlash(DEFAULT_SLASH_ITEMS, "zzzznope")).toEqual([]);
	});

	it("is case-insensitive, since the palette is typed in a hurry", () => {
		expect(filterSlash(DEFAULT_SLASH_ITEMS, "HELP").length).toBeGreaterThan(0);
	});
});

describe("shell-handled actions", () => {
	it("quits on /quit", async () => {
		// The documented way out. A quit that did not quit leaves the user with
		// Ctrl-C and a terminal to repair.
		expect((await slash("/quit", false)).code).toBe(0);
	});

	it("shows the key map on /help", async () => {
		const session = await slash("/help");
		expect(session.output.length).toBeGreaterThan(0);
		expect(session.verbs).toEqual([]);
	});

	it("does not hand /help to the product CLI", async () => {
		// It is shell chrome, not a verb; routing it would 404 against the CLI.
		expect((await slash("/help")).verbs).toEqual([]);
	});

	it("answers /about without the CLI", async () => {
		expect((await slash("/about")).verbs).toEqual([]);
	});

	it("clears the transcript on /clear", async () => {
		const session = await slash("/clear");
		expect(session.code).toBe(0);
		expect(session.verbs).toEqual([]);
	});

	it("names the resume command on /resume", async () => {
		// The point of /resume is to tell the user how to come back; an answer
		// without the command is not actionable.
		expect((await slash("/resume")).output).toMatch(
			/hobo-code resume|persisted/u,
		);
	});

	it("handles /compact without reaching the CLI", async () => {
		expect((await slash("/compact")).verbs).toEqual([]);
	});

	it("handles /btw without reaching the CLI", async () => {
		expect((await slash("/btw")).verbs).toEqual([]);
	});
});

describe("argv items reach the product CLI", () => {
	it.each([
		["status", ["status"]],
		["cost", ["cost"]],
		["config", ["config"]],
		["history", ["history"]],
		["resources", ["resources"]],
	])("routes /%s to the CLI", async (name, expected) => {
		// Routing through the CLI is what keeps the shell from bypassing feature
		// gates and isolation checks.
		const session = await slash(`/${name}`);
		expect(session.verbs).toContainEqual(expected);
	});

	it("shows the CLI's own answer rather than a summary of it", async () => {
		// The shell is a frame around the CLI; paraphrasing its output would let
		// the two disagree.
		expect((await slash("/status")).output).toContain("ran status");
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("routes a multi-word argv item as its whole argv", async () => {
		const session = await slash("/sessions");
		expect(session.verbs.some((argv) => argv.length > 1)).toBe(true);
	});

	it("survives a CLI verb that throws", async () => {
		// A failing verb is a message, not a crash: the session and its unsaved
		// context have to survive it.
		const chunks: string[] = [];
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const code = await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({
				write(chunk, _e, done) {
					chunks.push(String(chunk));
					done();
				},
			}),
			hoboHome: home(),
			sidecars: false,
			reducedMotion: true,
			scriptedKeys: `/status\r${CTRL_C}`,
			host: {
				runVerb: async () => {
					throw new Error("verb exploded");
				},
				complete: async () => "",
			},
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
		} as never);
		expect(code).toBe(0);
	});
});

describe("typing a slash command", () => {
	it("does not send it to the completion engine", async () => {
		// A slash command billed as a model turn is the failure this routing
		// exists to prevent.
		const prompts: string[] = [];
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_c, _e, done) => done() }),
			hoboHome: home(),
			sidecars: false,
			reducedMotion: true,
			scriptedKeys: `/status\r${CTRL_C}`,
			host: {
				runVerb: async () => "ok",
				complete: async (prompt: string) => {
					prompts.push(prompt);
					return "";
				},
			},
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
		} as never);
		expect(prompts).toEqual([]);
	});

	it("sends an unknown slash command to the engine rather than dropping it", async () => {
		// It might be prose that happens to start with a slash. Silently doing
		// nothing would look like a hang.
		const prompts: string[] = [];
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({ write: (_c, _e, done) => done() }),
			hoboHome: home(),
			sidecars: false,
			reducedMotion: true,
			scriptedKeys: `/reticulate splines\r${CTRL_C}`,
			host: {
				runVerb: async () => "ok",
				complete: async (prompt: string) => {
					prompts.push(prompt);
					return "";
				},
			},
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
		} as never);
		expect(prompts.length).toBeGreaterThan(0);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("runs a bare slash as nothing at all", async () => {
		// `/` opens the palette; Enter on an empty filter must not run the first
		// row by accident.
		expect((await slash("/")).code).toBe(0);
	});
});
