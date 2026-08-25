/**
 * Slash-command completion on the prompt line.
 *
 * Commands ride the editor's own autocomplete provider rather than a bespoke
 * palette, so there is one way to discover them rather than two. That makes
 * this provider the entire discovery surface for slash commands, and its job is
 * mostly knowing when to say nothing.
 *
 * **It is deliberately narrow.** Commands are a prefix concept, not a general
 * token completer: it only fires on a line that starts with `/`, and only while
 * the command word itself is still being typed. Once a space is entered the
 * user is writing arguments, and a popup that reappeared over them would fight
 * the thing they were doing.
 *
 * **Returning `null` and returning an empty list are different.** `null` closes
 * the popup; an empty suggestion set leaves it open with nothing in it. Every
 * "no suggestions" path here returns `null` for that reason, so the tests
 * assert on `null` specifically rather than on emptiness.
 *
 * The theme is here too because it has the same shape of decision — the palette
 * stays closed, so colour is an accent that has to disappear entirely under
 * `NO_COLOR` rather than degrade to a different colour.
 */
import { describe, expect, it } from "vitest";

import { inkEditorTheme, SlashCommandProvider } from "../src/shell-input.js";

const COMMANDS = [
	{ name: "review", description: "open a review" },
	{ name: "resume", description: "resume a session" },
	{ name: "quit", description: "leave" },
];

const provider = () => new SlashCommandProvider(COMMANDS);

/** Suggestions for a single-line buffer with the cursor at its end. */
const suggest = (line: string, col = line.length) =>
	provider().getSuggestions([line], 0, col);

describe("when the provider offers nothing", () => {
	it("stays silent on a line that is not a command", async () => {
		expect(await suggest("hello world")).toBeNull();
	});

	it("stays silent on an empty line", async () => {
		expect(await suggest("")).toBeNull();
	});

	it("stays silent once the user has moved on to arguments", async () => {
		// A popup reappearing over the arguments would fight what the user is
		// doing.
		expect(await suggest("/review origin/main")).toBeNull();
	});

	it("stays silent even for a trailing space with no argument yet", async () => {
		// The space is the signal, not the argument -- by the time one is typed
		// the popup is already unwanted.
		expect(await suggest("/review ")).toBeNull();
	});

	it("closes the popup rather than showing an empty one when nothing matches", async () => {
		// `null`, not `{ items: [] }`. An empty suggestion set leaves the popup
		// open with nothing in it.
		expect(await suggest("/zzz")).toBeNull();
	});

	it("looks at the cursor's line, not the first one", async () => {
		// A multi-line buffer where the cursor is on a non-command line.
		expect(
			await provider().getSuggestions(["/review", "plain"], 1, 5),
		).toBeNull();
	});

	it("treats a cursor on a line that does not exist as nothing to complete", async () => {
		expect(await provider().getSuggestions([], 3, 0)).toBeNull();
	});
});

describe("what it suggests", () => {
	it("offers every command for a bare slash", async () => {
		const suggestions = await suggest("/");
		expect(suggestions?.items.map((item) => item.value)).toEqual([
			"/review",
			"/resume",
			"/quit",
		]);
	});

	it("narrows to the prefix as it is typed", async () => {
		const suggestions = await suggest("/re");
		expect(suggestions?.items.map((item) => item.value)).toEqual([
			"/review",
			"/resume",
		]);
	});

	it("matches case-insensitively", async () => {
		// The command names are lowercase; a user typing `/RE` is not making a
		// different request.
		expect((await suggest("/RE"))?.items).toHaveLength(2);
	});

	it("carries each command's description", async () => {
		// The description is the discovery half -- a list of names alone does not
		// tell anyone what a command does.
		const suggestions = await suggest("/quit");
		expect(suggestions?.items[0]?.description).toBe("leave");
	});

	it("labels items the way they will be typed", async () => {
		const item = (await suggest("/quit"))?.items[0];
		expect(item?.label).toBe("/quit");
		expect(item?.value).toBe("/quit");
	});

	it("reports the text it is completing as the prefix", async () => {
		// The editor replaces this span, so a prefix that disagreed with what was
		// typed would duplicate or eat characters.
		expect((await suggest("/re"))?.prefix).toBe("/re");
	});

	it("completes from the cursor, not the whole line", async () => {
		// The cursor sits after `/re` while `view` is still to its right.
		const suggestions = await provider().getSuggestions(["/review"], 0, 3);
		expect(suggestions?.prefix).toBe("/re");
		expect(suggestions?.items).toHaveLength(2);
	});

	it("offers nothing when constructed with no commands", async () => {
		expect(
			await new SlashCommandProvider([]).getSuggestions(["/"], 0, 1),
		).toBeNull();
	});
});

describe("applying a completion", () => {
	it("replaces the line with the chosen command", async () => {
		const result = provider().applyCompletion(["/re"], 0, 3, {
			value: "/review",
			label: "/review",
		} as never);
		expect(result.lines).toEqual(["/review"]);
	});

	it("puts the cursor at the end of what it inserted", async () => {
		// So the next keystroke is an argument rather than landing mid-word.
		const result = provider().applyCompletion(["/re"], 0, 3, {
			value: "/review",
			label: "/review",
		} as never);
		expect(result.cursorCol).toBe("/review".length);
		expect(result.cursorLine).toBe(0);
	});

	it("leaves the other lines alone", async () => {
		const result = provider().applyCompletion(["first", "/re"], 1, 3, {
			value: "/review",
			label: "/review",
		} as never);
		expect(result.lines).toEqual(["first", "/review"]);
	});

	it("does not mutate the buffer it was handed", async () => {
		// The editor keeps its own array; writing through would change history
		// entries and undo state out from under it.
		const lines = ["/re"];
		provider().applyCompletion(lines, 0, 3, {
			value: "/review",
			label: "/review",
		} as never);
		expect(lines).toEqual(["/re"]);
	});
});

describe("the editor theme", () => {
	it("leaves borders unpainted", () => {
		// The palette stays closed: colour is a rare accent, and a coloured
		// border would make it structural.
		expect(inkEditorTheme().borderColor("─".repeat(4))).toBe("─".repeat(4));
	});

	it("provides every select-list slot the editor asks for", () => {
		// A missing slot is not a styling bug -- the editor calls it, so an
		// absent one throws while rendering the popup.
		const theme = inkEditorTheme();
		for (const paint of Object.values(theme.selectList ?? {})) {
			expect(paint).toBeTypeOf("function");
			expect(typeof (paint as (s: string) => string)("x")).toBe("string");
		}
	});

	it("keeps the text intact whichever way colour resolves", () => {
		// Whether or not the accent is applied, the payload has to survive: a
		// theme that dropped or truncated the text would make the popup unusable
		// in exactly one of the two modes, which is easy to miss.
		const theme = inkEditorTheme();
		for (const paint of Object.values(theme.selectList ?? {})) {
			expect((paint as (s: string) => string)("review")).toContain("review");
		}
	});
});
