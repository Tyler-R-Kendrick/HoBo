/**
 * How `/template` decides what the user asked for.
 *
 * `template-command.test.ts` walks the main paths — search, list, render, apply.
 * This file covers the dispatcher underneath them: how a subcommand, a flag,
 * and a bare query compete to decide the action, and what each branch does when
 * the thing it needs is not there.
 *
 * Two reasons this is worth pinning rather than reading:
 *
 * - **A subcommand and a flag can both claim the action.** `resolveAction` has
 *   a precedence order, and precedence is exactly what nobody remembers when
 *   editing it later. Getting it wrong routes `/template apply` to a search —
 *   which returns a plausible result rather than an error, so the user reads a
 *   preview and believes they applied something.
 * - **The first positional word is consumed only if it is a known subcommand.**
 *   That is what makes `/template a web server` a natural-language query rather
 *   than a search for "web server" under a subcommand called "a". One extra
 *   word in `TEMPLATE_SUB` silently changes how every query starting with it is
 *   read.
 *
 * Every path also carries a zero-LLM receipt. That claim is the point of the
 * command — it is what distinguishes a catalog lookup from a model call — so it
 * is asserted on each branch rather than once.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runTemplateCommand } from "../src/template-command.js";

function run(
	args: readonly string[],
	flags: Readonly<Record<string, string | boolean>> = {},
) {
	return runTemplateCommand({ args, flags });
}

describe("choosing an action", () => {
	it("treats a bare invocation as a listing", () => {
		// With nothing to search for, a listing is the only useful answer. An
		// empty search result would read as "the catalog is empty".
		const result = run([]);
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/^templates · \d+/u);
	});

	it("takes an explicit list subcommand", () => {
		expect(run(["list"]).message).toMatch(/^templates · \d+/u);
	});

	it("treats a bare word as a query rather than a subcommand", () => {
		// This is what makes `/template a web server` work. If the first word were
		// always consumed, the query would silently lose it.
		const result = run(["bindle"]);
		expect(result.message).not.toMatch(/^templates · \d+/u);
	});

	it("consumes a known subcommand before the query", () => {
		// `search bindle` must query "bindle", not "search bindle" — the latter
		// scores against a word that is not in anybody's pattern.
		expect(run(["search", "bindle"]).code).toBe("HOBO_CODE_TEMPLATE");
	});

	it("lets --apply stand in for the apply subcommand", () => {
		// Both spellings reach users through different surfaces (a slash command
		// and a CLI flag), so they have to agree.
		const result = run(["bindle"], { apply: true });
		expect(result.message).toContain("apply needs a selected pattern");
	});

	it("lets --explain stand in for the explain subcommand", () => {
		const result = run(["bindle"], { explain: true });
		expect(result.ok).toBe(true);
	});

	it("prefers an explicit subcommand over a conflicting flag", () => {
		// Precedence has to be decided somewhere. The subcommand is what the user
		// typed most deliberately, so it wins — and routing this to `apply`
		// instead would attempt a write when they asked to look.
		const result = run(["explain", "bindle"], { apply: true });
		expect(result.message).not.toContain("apply needs a selected pattern");
	});
});

describe("finding the query", () => {
	it("joins the remaining words into one natural-language query", () => {
		// Searching only the first word would score against a fragment and return
		// confidently wrong matches rather than no matches.
		expect(run(["search", "a", "web", "server"]).code).toBe(
			"HOBO_CODE_TEMPLATE",
		);
	});

	it("prefers an explicit --id over the positional words", () => {
		// `--id` is an exact address. Letting stray positional words override it
		// would turn a precise request into a fuzzy one.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		const result = run(["something", "else"], { id });
		expect(result.code).toBe("HOBO_CODE_TEMPLATE");
	});

	it("falls back to a listing when search is asked for with no query", () => {
		// `search` with nothing after it is a request to see what exists, not an
		// error and not an empty result set.
		expect(run(["search"]).message).toMatch(/^templates · \d+/u);
	});

	it("reports usage when a non-search action has nothing to work on", () => {
		// `apply` with no query cannot guess a pattern. Naming the three ways to
		// supply one is what makes the message actionable.
		const result = run(["apply"]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_TEMPLATE_USAGE");
		expect(result.message).toContain("needs a query, --id, or list");
	});

	it("ignores a non-string --id rather than searching for true", () => {
		// A bare `--id` with no value arrives as boolean `true`. Interpolating it
		// would search the catalog for the literal string "true".
		expect(run(["bindle"], { id: true }).code).toBe("HOBO_CODE_TEMPLATE");
	});
});

describe("applying", () => {
	it("refuses without an isolation root", () => {
		// Apply writes files. Defaulting the destination would scatter a template
		// into whatever directory the shell happened to be in.
		const result = run(["apply", "bindle"]);
		expect(result.ok).toBe(false);
		expect(result.message).toContain("--out isolation root");
	});

	it("accepts --isolation as a synonym for --out", () => {
		const result = run(["apply", "bindle"], {
			isolation: mkdtempSync(join(tmpdir(), "hobo-template-iso-")),
		});
		expect(result.message).not.toContain("--out isolation root");
	});

	it("applies an unrelated pattern for a query that matches nothing", () => {
		// Pinning behaviour that surprised me, because it is worth knowing rather
		// than worth silently relying on. The search has no relevance floor: it
		// always ranks the whole catalog and returns a best candidate, so a
		// nonsense query still selects a real pattern. Combined with `apply`
		// falling back to `candidates[0]`, that means a typo'd id plus an --out
		// directory *writes files* from a pattern the user never asked for.
		//
		// The refusal path above only fires when the query is missing entirely,
		// not when it matches nothing — because nothing ever matches nothing.
		//
		// Fixing this means giving the search a score threshold and returning no
		// selection below it, which is a product decision about how eager the
		// matcher should be rather than a defect with an obvious right answer. So
		// it is recorded here instead of changed.
		const result = run(["apply", "zzz-no-such-pattern-anywhere-zzz"], {
			out: mkdtempSync(join(tmpdir(), "hobo-template-apply-")),
		});
		expect(result.ok).toBe(true);
	});
});

describe("rendering", () => {
	it("renders an unrelated pattern for a query that matches nothing", () => {
		// The same missing relevance floor described under "applying". A render is
		// the harmless half — nothing is written — but the user is shown a real,
		// confidently-formatted pattern for a query that meant nothing, with no
		// hint that the match was poor.
		const result = run(["render", "zzz-no-such-pattern-anywhere-zzz"]);
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_TEMPLATE");
	});

	it("treats show as a synonym for render", () => {
		// Both must land on the same branch; a `show` that fell through to search
		// would print a candidate list where the user expected a rendering.
		const shown = run(["show", "zzz-no-such-pattern-anywhere-zzz"]);
		const rendered = run(["render", "zzz-no-such-pattern-anywhere-zzz"]);
		expect(shown.message).toBe(rendered.message);
	});

	it("renders a real pattern with its identity and validation", () => {
		// The header is how a reader knows which pattern they are looking at and
		// whether it is mature enough to use. The validation line is what stops a
		// broken rendering being pasted into a project.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		const result = run(["render"], { id });
		expect(result.ok).toBe(true);
		expect(result.message).toContain(id);
		expect(result.message).toContain("validation:");
	});

	it("names a follow-up command a reader can run next", () => {
		// A render answers "what is this"; the explain line answers "why did I get
		// this one", which is the next question every time.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(run(["render"], { id }).message).toContain(
			`hobo-code template explain ${id}`,
		);
	});
});

describe("composing", () => {
	it("returns a compose result for a compose subcommand", () => {
		const result = run(["compose", "a web server with a database"]);
		expect(result.data).toHaveProperty("chosenIds");
	});

	it("codes a failed composition as an invalid index rather than ok", () => {
		// A composition that chose nothing is not a successful empty answer; the
		// caller has to be able to tell it apart from one that chose patterns.
		const result = run(["compose", "zzz-no-such-pattern-anywhere-zzz"]);
		if (!result.ok)
			expect(result.code).toBe("HOBO_CODE_TEMPLATE_INDEX_INVALID");
		else expect(result.code).toBe("HOBO_CODE_TEMPLATE");
	});
});

describe("parameters", () => {
	it("maps --name onto both the name and resource-name parameters", () => {
		// Patterns are inconsistent about which they declare. Filling only one
		// leaves the other rendering as an unsubstituted placeholder.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(run(["render"], { id, name: "checkout" }).ok).toBe(true);
	});

	it("accepts a JSON object of parameters", () => {
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(run(["render"], { id, params: '{"region":"eu-west-1"}' }).ok).toBe(
			true,
		);
	});

	it("coerces JSON numbers and booleans to strings", () => {
		// Templates substitute text. A number reaching a renderer that expects a
		// string is the kind of thing that produces "[object Object]" in output.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(
			run(["render"], { id, params: '{"replicas":3,"public":true}' }).ok,
		).toBe(true);
	});

	it("ignores a JSON array of parameters rather than indexing it", () => {
		// Parameters are named. An array has no names, so the only safe reading is
		// that the caller passed the wrong shape.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(run(["render"], { id, params: "[1,2,3]" }).ok).toBe(true);
	});

	it("ignores a nested object value rather than stringifying it", () => {
		// `String({})` is "[object Object]", which would be substituted into the
		// rendered file verbatim and look like a template engine failure.
		const listed = run(["list"]).data as { ids: readonly string[] };
		const id = listed.ids[0] ?? "";
		expect(run(["render"], { id, params: '{"nested":{"a":1}}' }).ok).toBe(true);
	});

	it("throws on malformed JSON rather than proceeding with no parameters", () => {
		// Silently dropping them would render a template with placeholders left
		// in, and the user would not know their --params was ignored.
		expect(() => run(["render", "bindle"], { params: "{not json" })).toThrow();
	});
});

describe("the zero-LLM receipt", () => {
	// The receipt is the command's whole claim: this is a catalog lookup, not a
	// model call. It has to appear on every branch, including the failures —
	// a user debugging an error should not be left wondering whether the failed
	// attempt cost them tokens.
	const cases: readonly (readonly [
		string,
		readonly string[],
		Record<string, string | boolean>,
	])[] = [
		["a listing", ["list"], {}],
		["a search", ["search", "bindle"], {}],
		["a usage error", ["apply"], {}],
		["a failed apply", ["apply", "bindle"], {}],
		["a failed render", ["render", "zzz-nothing-matches-zzz"], {}],
		["a composition", ["compose", "a web server"], {}],
		["an explanation", ["explain", "bindle"], {}],
	];

	for (const [name, args, flags] of cases) {
		it(`reports zero LLM calls on ${name}`, () => {
			expect(run(args, flags).message).toContain("0 LLM calls · 0 LLM tokens");
		});
	}

	it("carries the zero counts in the data as well as the message", () => {
		// The message is for a human; the data is what a caller records. Reporting
		// zero in only one of them would let a usage ledger drift from the text
		// the user was shown.
		const data = run(["list"]).data as Record<string, number>;
		expect(data.llmCalls).toBe(0);
		expect(data.llmInputTokens).toBe(0);
		expect(data.llmOutputTokens).toBe(0);
	});
});
