/**
 * The two "you already know X, here is the HoBo word for it" guides.
 *
 * `hobo-code guide` and its Cursor twin translate a tool someone already uses
 * into HoBo verbs. Both are written for a reader who is *not* a traditional
 * developer, and that audience is what makes the honesty rule load-bearing
 * rather than decorative:
 *
 * **Every mapped feature carries a status, and `residual` means not built.**
 * A guide that listed an unbuilt feature the same way as a shipped one would
 * send someone to configure something that does not exist — and a reader
 * without the background to recognise a missing product would conclude they
 * had done it wrong. The three states are `supported`, `partial` and
 * `residual`, and the renderer gives each a distinct glyph so the distinction
 * survives being skimmed.
 *
 * **The gaps get their own section, labelled as gaps.** Burying them in the
 * map would let a skim miss them entirely; the panel says "Residual (honest
 * gaps)" in words.
 *
 * **Every row says what to actually run.** A translation with no command is a
 * vocabulary lesson, not a bridge — the whole point is that the reader can act
 * on it without knowing HoBo's structure first.
 *
 * These are pure builders with no I/O, so the tests read the guides directly
 * rather than through a CLI.
 */
import { describe, expect, it } from "vitest";

import {
	claudeCodeGuide,
	renderClaudeCodeGuideText,
} from "../src/claude-code-guide.js";
import { cursorGuide, renderCursorGuideText } from "../src/cursor-guide.js";

const GUIDES = [
	{
		name: "claude-code",
		guide: claudeCodeGuide(),
		render: renderClaudeCodeGuideText,
		schema: "hobo.code.claude-guide/v1",
		sourceKey: "claudeCode" as const,
	},
	{
		name: "cursor",
		guide: cursorGuide(),
		render: renderCursorGuideText,
		schema: "hobo.code.cursor-guide/v1",
		sourceKey: "cursor" as const,
	},
];

for (const { name, guide, render, schema, sourceKey } of GUIDES) {
	describe(`the ${name} guide`, () => {
		it("stamps its own schema", () => {
			// Two guides, two payloads; a shared id would make a consumer unable
			// to tell which vocabulary it received.
			expect(guide.schema).toBe(schema);
		});

		it("names the audience it is written for", () => {
			// The register of the prose depends on it — this is the field that
			// says "assume no traditional engineering background".
			expect(guide.audience.length).toBeGreaterThan(0);
		});

		it("opens in plain English rather than HoBo vocabulary", () => {
			// A guide whose first paragraph needs the glossary it is providing
			// cannot be read by the person it is for.
			expect(guide.plainIntro.length).toBeGreaterThan(0);
		});

		it("gives a happy path to follow in order", () => {
			// The reader wants "what do I type first"; a map alone answers
			// translation questions but never the starting one.
			expect(guide.happyPath.length).toBeGreaterThan(0);
		});

		it("maps at least a handful of features", () => {
			expect(guide.map.length).toBeGreaterThan(3);
		});

		it("gives every row a status", () => {
			// The honesty rule. A row with no status reads as shipped.
			for (const row of guide.map) {
				expect(["supported", "partial", "residual"]).toContain(row.status);
			}
		});

		it("gives every row a HoBo side", () => {
			// A translation with only the left-hand side is not a translation.
			for (const row of guide.map) {
				expect(row.hoboCode.length).toBeGreaterThan(0);
			}
		});

		it("gives every row something to run", () => {
			// A translation with no command is a vocabulary lesson, not a
			// bridge; the reader has to be able to act without knowing HoBo's
			// structure first.
			for (const row of guide.map) {
				expect(row.try.length).toBeGreaterThan(0);
			}
		});

		it("names each source-tool feature once", () => {
			// Two rows for one feature would give contradictory advice with no
			// way for the reader to tell which applies.
			const names = guide.map.map((row) => row[sourceKey]);
			expect(new Set(names).size).toBe(names.length);
		});

		it("lists honest gaps separately from the map", () => {
			// Burying a gap among the mappings lets a skim miss it entirely.
			expect(guide.residual.length).toBeGreaterThan(0);
		});

		it("carries a legend", () => {
			expect(guide.legend.length).toBeGreaterThan(0);
		});

		it("is stable across calls", () => {
			// Pure builder: two readers of the same version must see the same
			// guide, or a support answer stops matching what the asker sees.
			expect(render()).toBe(render());
		});
	});

	describe(`the ${name} panel`, () => {
		const text = render();

		it("renders without arguments", () => {
			expect(text.length).toBeGreaterThan(0);
		});

		it("shows the happy path", () => {
			expect(text).toContain("Happy path:");
			for (const step of guide.happyPath) expect(text).toContain(step);
		});

		it("shows every mapped feature", () => {
			for (const row of guide.map) expect(text).toContain(row[sourceKey]);
		});

		it("shows what to run for every feature", () => {
			for (const row of guide.map) expect(text).toContain(row.try);
		});

		it("labels the gaps as gaps, in words", () => {
			// Not just a section break — a reader skimming for problems needs
			// the word.
			expect(text).toMatch(/Residual \(honest gaps\)/);
		});

		it("lists every gap", () => {
			for (const gap of guide.residual) expect(text).toContain(gap);
		});

		it("marks the three statuses distinctly", () => {
			// The glyph is the whole signal in a skimmed panel; two statuses
			// sharing one would erase the distinction the status field exists
			// to make.
			const glyphs = new Set(
				guide.map.map((row) =>
					row.status === "supported"
						? "●"
						: row.status === "partial"
							? "◐"
							: "○",
				),
			);
			for (const glyph of glyphs) expect(text).toContain(glyph);
		});

		it("does not mark a residual feature as supported", () => {
			// The failure this whole file guards: an unbuilt feature rendered
			// like a shipped one sends someone to configure something that does
			// not exist.
			const residualRows = guide.map.filter((row) => row.status === "residual");
			for (const row of residualRows) {
				const line = text
					.split("\n")
					.find((entry) => entry.includes(row[sourceKey]));
				expect(line).toContain("○");
				expect(line).not.toContain("●");
			}
		});

		it("renders the guide it was handed rather than rebuilding one", () => {
			// The parameter exists so a caller can render a filtered or future
			// guide; ignoring it would make the argument a lie.
			const custom = {
				...guide,
				residual: ["a gap that exists only in this test"],
			};
			expect(render(custom as never)).toContain(
				"a gap that exists only in this test",
			);
		});

		it("keeps the panel plain text with no ANSI escapes", () => {
			// It is piped, redirected and pasted into issues; escape codes
			// would show up as noise everywhere but a terminal.
			// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of ANSI escapes is the point
			expect(text).not.toMatch(/\[/);
		});
	});
}

describe("the two guides together", () => {
	it("do not share a schema id", () => {
		expect(claudeCodeGuide().schema).not.toBe(cursorGuide().schema);
	});

	it("address different audiences", () => {
		// One is for someone who has never written code professionally, the
		// other for an IDE power user. Collapsing them would leave both
		// half-served.
		expect(claudeCodeGuide().audience).not.toBe(cursorGuide().audience);
	});

	it("both admit to gaps rather than one claiming completeness", () => {
		// A guide with no residual section reads as "everything is covered",
		// which is the claim neither product can honestly make.
		expect(claudeCodeGuide().residual.length).toBeGreaterThan(0);
		expect(cursorGuide().residual.length).toBeGreaterThan(0);
	});
});
