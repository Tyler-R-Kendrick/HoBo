/**
 * What a slash command does with the words after it.
 *
 * `shell-slash-actions.test.ts` beside this file covers picking an item out of
 * the palette. This one covers the step after: turning `/mux attach` or
 * `/session list --json` into the thing that actually runs. Three rules carry
 * the weight:
 *
 * **`/mux` subcommands are aliases, not separate rows.** Six actions have two
 * or three spellings each — `tab`/`new-tab`, `pane`/`new-pane`/`split`,
 * `attach`/`interact` — because they are typed from muscle memory built in
 * tmux, screen and every other multiplexer. A spelling that resolved to
 * nothing would leave the user staring at a shell that ignored them; worse, an
 * unrecognised subcommand must *not* silently become plain `/mux`, since
 * opening the terminal view is not what `/mux stpo` was asking for. It stays
 * an argv so the failure is visible.
 *
 * **Two items rewrite their argv rather than appending to it.** `/sessions`
 * ships `["session", "list"]` but with arguments becomes `["session", ...]` —
 * appending would produce `session list <args>`, running the list verb with
 * the user's subcommand as a filter. `/template` has the same shape with an
 * added default: bare `/template` lists rather than printing usage, because
 * "what patterns are there" is the question someone typing it actually has.
 *
 * **Everything else appends.** `/dev --port 8080` is `["dev", "--port",
 * "8080"]`, and that has to stay true for every argv row or flags silently
 * vanish between the palette and the CLI.
 *
 * The resolvers are pure and exported, so this runs without a terminal.
 */
import { describe, expect, it } from "vitest";

import {
	DEFAULT_SLASH_ITEMS,
	MUX_SLASH_HELP,
	resolveSlashArgv,
	type ShellSlashItem,
	slashItemForInput,
} from "../src/interactive-shell.js";

const itemNamed = (name: string): ShellSlashItem => {
	const found = DEFAULT_SLASH_ITEMS.find((item) => item.name === name);
	if (!found) throw new Error(`no slash item named ${name}`);
	return found;
};

describe("mux subcommands", () => {
	const actionFor = (text: string) => slashItemForInput(text)?.action;

	it("opens the terminal view for a bare /mux", () => {
		expect(actionFor("/mux")).toBe("mux");
	});

	it.each([
		["tab", "session-tab"],
		["new-tab", "session-tab"],
		["pane", "session-pane"],
		["new-pane", "session-pane"],
		["split", "session-pane"],
		["detach", "session-detach"],
		["stop", "session-stop"],
		["stop-session", "session-stop"],
		["focus", "session-focus"],
		["focus-pane", "session-focus"],
		["attach", "pane-attach"],
		["interact", "pane-attach"],
	])("resolves /mux %s", (sub, action) => {
		// Every spelling is typed from muscle memory built in tmux or screen;
		// one that resolved to nothing leaves the user staring at a shell that
		// ignored them.
		expect(actionFor(`/mux ${sub}`)).toBe(action);
	});

	it("matches a subcommand case-insensitively", () => {
		expect(actionFor("/mux ATTACH")).toBe("pane-attach");
	});

	it("does not open the terminal view for an unrecognised subcommand", () => {
		// A typo must not silently become plain `/mux`: opening the terminal
		// view is not what `/mux stpo` was asking for.
		expect(slashItemForInput("/mux stpo")?.argv).toStrictEqual(["stpo"]);
	});

	it("keeps the mux action on an unrecognised subcommand so it is still handled", () => {
		expect(actionFor("/mux stpo")).toBe("mux");
	});

	it("carries no argv for a bare /mux", () => {
		// An empty argv and an absent one read differently downstream; the bare
		// form has nothing to pass on.
		expect(slashItemForInput("/mux")?.argv).toBeUndefined();
	});

	it("names the subcommand in the description a resolved item carries", () => {
		// The palette row is what the user sees confirm their command; a
		// description that still said plain "/mux" would not confirm anything.
		expect(slashItemForInput("/mux attach")?.description).toMatch(/attach/);
	});

	it("documents every subcommand spelling group in the help text", () => {
		for (const sub of ["tab", "pane", "attach", "focus", "detach", "stop"]) {
			expect(MUX_SLASH_HELP).toContain(`/mux ${sub}`);
		}
	});

	it("points at /agents for model configuration rather than /mux", () => {
		// The two are adjacent in the user's head and not in the product;
		// saying so in the help is cheaper than the wrong command.
		expect(MUX_SLASH_HELP).toMatch(/\/agents/);
	});
});

describe("rewriting rather than appending", () => {
	it("lists sessions by default", () => {
		expect(resolveSlashArgv(itemNamed("sessions"))).toStrictEqual([
			"session",
			"list",
		]);
	});

	it("replaces the sessions subcommand rather than appending to list", () => {
		// Appending would produce `session list new`, running the list verb
		// with the user's subcommand as a filter.
		expect(resolveSlashArgv(itemNamed("sessions"), ["new"])).toStrictEqual([
			"session",
			"new",
		]);
	});

	it("keeps every argument after a rewritten sessions subcommand", () => {
		expect(
			resolveSlashArgv(itemNamed("sessions"), ["list", "--json"]),
		).toStrictEqual(["session", "list", "--json"]);
	});

	it("lists templates for a bare /template", () => {
		// "What patterns are there" is the question someone typing it actually
		// has; printing usage instead answers a question nobody asked.
		expect(resolveSlashArgv(itemNamed("template"))).toStrictEqual([
			"template",
			"list",
		]);
	});

	it("replaces the template subcommand rather than appending to list", () => {
		expect(
			resolveSlashArgv(itemNamed("template"), ["search", "auth"]),
		).toStrictEqual(["template", "search", "auth"]);
	});

	it("resolves the templates alias to the same item", () => {
		expect(slashItemForInput("/templates")?.name).toBe("template");
	});
});

describe("appending arguments to an ordinary verb", () => {
	it("passes a flag through to the verb", () => {
		// A flag that vanished between the palette and the CLI is the worst
		// kind of silent failure: the command runs, just not the one typed.
		expect(slashItemForInput("/dev --port 8080")?.argv).toStrictEqual([
			"dev",
			"--port",
			"8080",
		]);
	});

	it("leaves a bare verb's argv alone", () => {
		expect(slashItemForInput("/status")?.argv).toStrictEqual(["status"]);
	});

	it("appends to a multi-word argv without disturbing it", () => {
		// `/auth` ships `["auth", "status"]`; the arguments go after both.
		expect(slashItemForInput("/auth --json")?.argv).toStrictEqual([
			"auth",
			"status",
			"--json",
		]);
	});

	it("keeps arguments in the order they were typed", () => {
		expect(slashItemForInput("/cost a b c")?.argv).toStrictEqual([
			"cost",
			"a",
			"b",
			"c",
		]);
	});

	it("collapses runs of whitespace between arguments", () => {
		// A double space is a typo, not an empty argument; passing `""` along
		// would show up as a mystery positional at the CLI.
		expect(slashItemForInput("/cost  a   b")?.argv).toStrictEqual([
			"cost",
			"a",
			"b",
		]);
	});

	it("ignores trailing whitespace after a bare command", () => {
		expect(slashItemForInput("/status  ")?.argv).toStrictEqual(["status"]);
	});

	it("returns no argv for an action item that has none", () => {
		expect(resolveSlashArgv(itemNamed("help"))).toBeUndefined();
	});

	it("returns no argv for an action item even when given arguments", () => {
		// There is nothing to append to; inventing an argv would turn `/help
		// foo` into a CLI call.
		expect(resolveSlashArgv(itemNamed("help"), ["foo"])).toBeUndefined();
	});
});

describe("actions that take their arguments as argv", () => {
	it("carries btw's arguments", () => {
		// `/btw` opens a side-chat *about something*; dropping the something
		// would open an empty one.
		expect(slashItemForInput("/btw what is this file")?.argv).toStrictEqual([
			"what",
			"is",
			"this",
			"file",
		]);
	});

	it("keeps btw an action rather than a CLI verb", () => {
		// There is no `hobo-code btw`; routing it to the CLI would fail with an
		// unknown-verb error for a feature that exists.
		expect(slashItemForInput("/btw hello")?.action).toBe("btw");
	});

	it("gives bare btw an empty argv rather than none", () => {
		expect(slashItemForInput("/btw")?.argv).toStrictEqual([]);
	});

	it("carries compact's arguments", () => {
		expect(slashItemForInput("/compact keep the plan")?.argv).toStrictEqual([
			"keep",
			"the",
			"plan",
		]);
	});

	it("keeps compact an action rather than a CLI verb", () => {
		expect(slashItemForInput("/compact")?.action).toBe("compact");
	});

	it("keeps bare /agents an action with no argv", () => {
		// Bare `/agents` opens the catalog modal in the shell; handing it to
		// the CLI would print a list instead of opening anything.
		expect(slashItemForInput("/agents")?.argv).toBeUndefined();
	});

	it("routes /agents with arguments to the CLI verb", () => {
		// With arguments it is a query, not a modal — and the verb is named
		// again at the front because the item's own argv is not used here.
		expect(slashItemForInput("/agents list")?.argv).toStrictEqual([
			"agents",
			"list",
		]);
	});

	it("keeps every argument after /agents", () => {
		expect(
			slashItemForInput("/agents add codex --model x")?.argv,
		).toStrictEqual(["agents", "add", "codex", "--model", "x"]);
	});
});

describe("the catalog as a whole", () => {
	it("resolves every item by its own name", () => {
		// A row the palette can show but `slashItemForInput` cannot resolve is
		// reachable by arrow key and not by typing — an inconsistency the user
		// experiences as the command working sometimes.
		for (const item of DEFAULT_SLASH_ITEMS) {
			expect(slashItemForInput(`/${item.name}`)?.name).toBe(item.name);
		}
	});

	it("resolves every alias to its item", () => {
		for (const item of DEFAULT_SLASH_ITEMS) {
			for (const alias of item.aliases ?? []) {
				expect(slashItemForInput(`/${alias}`)?.name).toBe(item.name);
			}
		}
	});

	it("gives every argv item a resolvable argv", () => {
		for (const item of DEFAULT_SLASH_ITEMS) {
			if (!item.argv) continue;
			expect(resolveSlashArgv(item)?.length).toBeGreaterThan(0);
		}
	});

	it("never resolves an argv row to an empty first word", () => {
		// An empty verb reaches the CLI as a bare invocation, which prints
		// help — indistinguishable from the command silently doing nothing.
		for (const item of DEFAULT_SLASH_ITEMS) {
			if (!item.argv) continue;
			expect(resolveSlashArgv(item)?.[0]?.length ?? 0).toBeGreaterThan(0);
		}
	});

	it("resolves nothing for a bare slash", () => {
		expect(slashItemForInput("/")).toBeUndefined();
	});

	it("resolves nothing for a slash followed by only spaces", () => {
		expect(slashItemForInput("/   ")).toBeUndefined();
	});
});
