/**
 * Which models a coding harness offers — curated rows, live CLI probes, and
 * OpenAI/Anthropic-compatible endpoints.
 *
 * The catalog answers one question: what can this harness actually run? The
 * standing rule is **provider-real only — never invent a model**. An offer the
 * provider does not serve is worse than an empty list: the user picks it, the
 * harness starts, and the first request fails with a provider error naming a
 * model HoBo made up.
 *
 * That rule shapes each source:
 *
 * - **Live probes are merged over curated rows, not instead of them.** A CLI
 *   that lists models knows better than a compiled-in list, so its rows win on
 *   collision — but a probe that returns nothing must not empty the catalog,
 *   because "the CLI is missing" and "the provider has no models" are
 *   different facts.
 * - **Every parser de-duplicates and skips what it cannot read.** CLI output
 *   carries headers, blank lines, and decoration; a line that does not match
 *   the shape is not a model.
 * - **Compatible endpoints come from the environment, and an unset variable is
 *   not an endpoint.** `OPENAI_BASE_URL=""` would otherwise produce an offer
 *   pointing at the empty string.
 * - **Pi reads real configured providers from `models.json`** and returns
 *   nothing at all when the file is missing or malformed, rather than guessing
 *   at what a Pi install might have.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	listAnthropicCompatibleOffers,
	listConfigurableHarnessIds,
	listHarnessModelOffers,
	listOpenAiCompatibleOffers,
	listPiModelOffersFromFile,
	parseCursorListModelsOutput,
	parseGrokModelsOutput,
	parseOpencodeModelsOutput,
} from "../src/harness-model-catalog.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-models-"));
	dirs.push(dir);
	return dir;
}

describe("parseCursorListModelsOutput", () => {
	it("reads the `id - description` rows and ignores everything else", () => {
		// The command prints a banner and a trailing hint around its rows.
		// Treating those as models would offer the user unselectable entries.
		expect(
			parseCursorListModelsOutput(
				[
					"Available models:",
					"gpt-5 - the big one",
					"  claude-sonnet-5 - balanced  ",
					"",
					"Use --model to pick one.",
				].join("\n"),
			),
		).toEqual(["gpt-5", "claude-sonnet-5"]);
	});

	it("de-duplicates repeated ids", () => {
		// A model listed under two aliases would otherwise appear twice in the
		// picker with no way to tell them apart.
		expect(
			parseCursorListModelsOutput("a - one\nb - two\na - one again"),
		).toEqual(["a", "b"]);
	});

	it("requires the separator, so a bare word is not a model", () => {
		expect(parseCursorListModelsOutput("gpt-5\nnot-a-row")).toEqual([]);
	});

	it("refuses an id starting with punctuation", () => {
		// Bullet lists and tree drawings both start lines this way, and their
		// content is not an id.
		expect(parseCursorListModelsOutput("- gpt-5 - the big one")).toEqual([]);
	});

	it("handles CRLF output", () => {
		expect(parseCursorListModelsOutput("gpt-5 - x\r\nclaude - y\r\n")).toEqual([
			"gpt-5",
			"claude",
		]);
	});
});

describe("parseOpencodeModelsOutput", () => {
	it("keeps `provider/model` lines only", () => {
		// The slash is the whole shape. A bare word is a heading; a line with
		// spaces is prose.
		expect(
			parseOpencodeModelsOutput(
				[
					"Models",
					"anthropic/claude-sonnet-5",
					"  openai/gpt-5  ",
					"local model here",
					"nonslash",
					"",
				].join("\n"),
			),
		).toEqual(["anthropic/claude-sonnet-5", "openai/gpt-5"]);
	});

	it("de-duplicates", () => {
		expect(parseOpencodeModelsOutput("a/b\na/b\nc/d")).toEqual(["a/b", "c/d"]);
	});
});

describe("parseGrokModelsOutput", () => {
	it("reads bulleted rows under any of the three markers", () => {
		for (const marker of ["*", "+", "-"]) {
			expect(parseGrokModelsOutput(`  ${marker} grok-4`)).toEqual(["grok-4"]);
		}
	});

	it("strips a trailing parenthetical", () => {
		// The CLI annotates rows with context windows and pricing. Keeping that
		// in the id would make every selection fail against the provider.
		expect(parseGrokModelsOutput("* grok-4(beta)")).toEqual(["grok-4"]);
	});

	it("ignores unbulleted lines and de-duplicates", () => {
		expect(
			parseGrokModelsOutput("Models:\n* grok-4\ngrok-3\n* grok-4"),
		).toEqual(["grok-4"]);
	});

	it("drops a row whose id is only a parenthetical", () => {
		// Stripping can leave nothing. An empty id would be offered as a blank
		// row that selects a model named "".
		expect(parseGrokModelsOutput("* (deprecated)")).toEqual([]);
	});
});

describe("compatible endpoints", () => {
	it("reads OpenAI-compatible endpoints from either single variable", () => {
		// Both spellings are in circulation — the standard one and HoBo's. A
		// user who set only one should still see their endpoint.
		for (const key of ["OPENAI_BASE_URL", "HOBO_CODE_LOCAL_BASE_URL"]) {
			const offers = listOpenAiCompatibleOffers("codex", {
				env: { [key]: "http://localhost:1234/v1" },
			});
			expect(offers).toHaveLength(1);
			expect(offers[0]?.label).toContain("http://localhost:1234/v1");
		}
	});

	it("splits a list variable on commas, semicolons, or whitespace", () => {
		// The variable is written by hand in a shell profile. Supporting one
		// separator would silently collapse the others into a single bad URL.
		const offers = listOpenAiCompatibleOffers("codex", {
			env: {
				HOBO_CODE_OPENAI_COMPAT_URLS: "http://a/v1, http://b/v1;http://c/v1",
			},
		});
		expect(offers.map((offer) => offer.label).join(" ")).toContain(
			"http://a/v1",
		);
		expect(offers).toHaveLength(3);
	});

	it("de-duplicates a URL named by more than one variable", () => {
		// Setting both the standard and the list variable is common. Two
		// identical rows in the picker would be indistinguishable.
		expect(
			listOpenAiCompatibleOffers("codex", {
				env: {
					OPENAI_BASE_URL: "http://a/v1",
					HOBO_CODE_OPENAI_COMPAT_URLS: "http://a/v1 http://b/v1",
				},
			}),
		).toHaveLength(2);
	});

	it("ignores empty and whitespace-only values", () => {
		// An exported-but-empty variable would otherwise produce an offer whose
		// base URL is the empty string, failing at request time.
		expect(
			listOpenAiCompatibleOffers("codex", {
				env: { OPENAI_BASE_URL: "   ", HOBO_CODE_OPENAI_COMPAT_URLS: " , ; " },
			}),
		).toEqual([]);
	});

	it("names the model after the active selection, dropping a provider prefix", () => {
		// A compat endpoint serves whatever the user pointed it at, so the
		// active model name is the best guess. The prefix belongs to HoBo's
		// catalog, not to the endpoint's own API.
		const offers = listOpenAiCompatibleOffers("codex", {
			env: { OPENAI_BASE_URL: "http://a/v1", HOBO_CODE_MODEL: "openai/gpt-5" },
		});
		expect(offers[0]?.runtimeId).toBe("gpt-5");
	});

	it("falls back to local-coder when the active model is ollama or unset", () => {
		// An Ollama model name would not resolve on an OpenAI-compatible
		// endpoint, so it is not a useful guess.
		for (const model of [undefined, "", "ollama/llama3"]) {
			const offers = listOpenAiCompatibleOffers("codex", {
				env: {
					OPENAI_BASE_URL: "http://a/v1",
					...(model !== undefined ? { HOBO_CODE_MODEL: model } : {}),
				},
			});
			expect(offers[0]?.runtimeId).toBe("local-coder");
		}
	});

	it("takes an explicit model name over any inference", () => {
		expect(
			listOpenAiCompatibleOffers("codex", {
				env: {
					OPENAI_BASE_URL: "http://a/v1",
					HOBO_CODE_MODEL: "openai/gpt-5",
				},
				modelName: "pinned",
			})[0]?.runtimeId,
		).toBe("pinned");
	});

	it("names Anthropic-compatible offers after a claude-shaped active model", () => {
		// Only a Claude-shaped name is plausible on an Anthropic-compatible
		// endpoint; anything else falls back to a known-real default rather
		// than being passed through and rejected.
		expect(
			listAnthropicCompatibleOffers("claude", {
				env: {
					ANTHROPIC_BASE_URL: "http://a",
					HOBO_CODE_MODEL: "anthropic/claude-opus-5",
				},
			})[0]?.runtimeId,
		).toBe("claude-opus-5");
		expect(
			listAnthropicCompatibleOffers("claude", {
				env: { ANTHROPIC_BASE_URL: "http://a", HOBO_CODE_MODEL: "gpt-5" },
			})[0]?.runtimeId,
		).toBe("claude-sonnet-5");
	});

	it("returns nothing when no compatible endpoint is configured", () => {
		expect(listOpenAiCompatibleOffers("codex", { env: {} })).toEqual([]);
		expect(listAnthropicCompatibleOffers("claude", { env: {} })).toEqual([]);
	});
});

describe("listPiModelOffersFromFile", () => {
	function modelsJson(body: unknown): string {
		const dir = tmp();
		const path = join(dir, "models.json");
		writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
		return path;
	}

	it("returns nothing when the file does not exist", () => {
		// A Pi install that has never been configured has no file. Guessing at
		// its providers would offer models the user has no credentials for.
		expect(listPiModelOffersFromFile(join(tmp(), "missing.json"))).toEqual([]);
	});

	it("returns nothing for malformed JSON rather than throwing", () => {
		// This runs while building an interactive picker. An exception would
		// take down the picker over a file the user can fix later.
		expect(listPiModelOffersFromFile(modelsJson("{ broken"))).toEqual([]);
	});

	it("returns nothing when there are no providers", () => {
		for (const body of [{}, { providers: {} }, { providers: { a: {} } }]) {
			expect(listPiModelOffersFromFile(modelsJson(body))).toEqual([]);
		}
	});

	it("reads every model across every provider", () => {
		const offers = listPiModelOffersFromFile(
			modelsJson({
				providers: {
					openai: { models: [{ id: "gpt-5" }] },
					anthropic: { models: [{ id: "claude-sonnet-5" }] },
				},
			}),
		);
		expect(offers.map((offer) => offer.runtimeId)).toEqual([
			"claude-sonnet-5",
			"gpt-5",
		]);
	});

	it("sorts by runtime id so the picker is stable", () => {
		// JSON key order is not something the user controls; an unstable list
		// would reorder under them between two identical sessions.
		const offers = listPiModelOffersFromFile(
			modelsJson({
				providers: { p: { models: [{ id: "zeta" }, { id: "alpha" }] } },
			}),
		);
		expect(offers.map((offer) => offer.runtimeId)).toEqual(["alpha", "zeta"]);
	});

	it("skips entries with no usable id and de-duplicates across providers", () => {
		// One model reachable through two configured providers is still one
		// model to select.
		const offers = listPiModelOffersFromFile(
			modelsJson({
				providers: {
					a: { models: [{ id: "gpt-5" }, { id: "  " }, { name: "no-id" }, {}] },
					b: { models: [{ id: "gpt-5" }] },
				},
			}),
		);
		expect(offers.map((offer) => offer.runtimeId)).toEqual(["gpt-5"]);
	});

	it("uses the provider name as the offer's provider when it is name-shaped", () => {
		// The provider drives credential lookup. A name with characters that
		// cannot be a provider key falls back to `pi` rather than being passed
		// through into a lookup that would fail obscurely.
		expect(
			listPiModelOffersFromFile(
				modelsJson({ providers: { OpenAI: { models: [{ id: "gpt-5" }] } } }),
			)[0]?.provider,
		).toBe("openai");
		expect(
			listPiModelOffersFromFile(
				modelsJson({
					providers: { "my provider!": { models: [{ id: "m" }] } },
				}),
			)[0]?.provider,
		).toBe("pi");
	});

	it("labels each offer with its provider so two sources are distinguishable", () => {
		expect(
			listPiModelOffersFromFile(
				modelsJson({ providers: { openai: { models: [{ id: "gpt-5" }] } } }),
			)[0]?.label,
		).toContain("pi/openai");
	});
});

describe("listHarnessModelOffers", () => {
	it("returns curated rows for a known harness without probing", () => {
		// Under Vitest the live probe is off by default, so this is the curated
		// path — and it must not be empty, or the picker would show nothing on
		// a machine with no CLIs installed.
		const offers = listHarnessModelOffers("claude", { env: {} });
		expect(offers.length).toBeGreaterThan(0);
	});

	it("returns nothing for a harness it has never heard of", () => {
		// Inventing rows for an unknown id is exactly the failure mode the
		// provider-real rule exists to prevent.
		expect(listHarnessModelOffers("frobnicate", { env: {} })).toEqual([]);
	});

	it("normalizes the harness id", () => {
		expect(listHarnessModelOffers("  CLAUDE  ", { env: {} }).length).toBe(
			listHarnessModelOffers("claude", { env: {} }).length,
		);
	});

	it("merges live probe rows ahead of curated ones", () => {
		// The CLI knows what the provider actually serves today. Curated rows
		// are the fallback, so a live id that collides wins.
		const offers = listHarnessModelOffers("cursor", {
			env: {},
			runProbe: () => "live-only-model - from the CLI",
		});
		expect(offers[0]?.runtimeId).toBe("live-only-model");
	});

	it("keeps curated rows when the probe returns nothing usable", () => {
		// "The CLI is missing" and "the provider has no models" are different
		// facts. Emptying the catalog on a failed probe would conflate them.
		const curated = listHarnessModelOffers("claude", { env: {} });
		for (const probe of [() => null, () => undefined, () => "", () => "junk"]) {
			expect(
				listHarnessModelOffers("claude", { env: {}, runProbe: probe }).length,
			).toBe(curated.length);
		}
	});

	it("merges OpenAI-compatible endpoints into codex and sdk only", () => {
		const env = { OPENAI_BASE_URL: "http://local/v1" };
		const hasCompat = (id: string) =>
			listHarnessModelOffers(id, { env, live: false }).some((offer) =>
				offer.label.includes("http://local/v1"),
			);
		expect(hasCompat("codex")).toBe(true);
		expect(hasCompat("sdk")).toBe(true);
		expect(hasCompat("claude")).toBe(false);
	});

	it("merges Anthropic-compatible endpoints into claude only", () => {
		const env = { ANTHROPIC_BASE_URL: "http://local" };
		const hasCompat = (id: string) =>
			listHarnessModelOffers(id, { env, live: false }).some((offer) =>
				offer.label.includes("http://local"),
			);
		expect(hasCompat("claude")).toBe(true);
		expect(hasCompat("codex")).toBe(false);
	});

	it("reads Pi's models.json from the given home rather than probing", () => {
		// Pi is wired to the Bo catalog elsewhere; reaching this helper directly
		// must still answer from real configured providers only.
		expect(listHarnessModelOffers("pi", { homeDir: tmp() })).toEqual([]);
	});

	it("honours live:false even when a probe was supplied", () => {
		// An explicit `false` is a caller saying "curated only" — it has to beat
		// the inference that a supplied probe means live.
		const offers = listHarnessModelOffers("cursor", {
			env: {},
			live: false,
			runProbe: () => "live-only-model - from the CLI",
		});
		expect(offers.some((offer) => offer.runtimeId === "live-only-model")).toBe(
			false,
		);
	});
});

describe("listConfigurableHarnessIds", () => {
	it("returns a sorted list of ids", () => {
		// The ids drive a menu. Filesystem or catalog order would reshuffle it
		// between sessions.
		const ids = listConfigurableHarnessIds();
		expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
	});

	it("excludes hobo-code itself", () => {
		// Bo is not a harness you configure from the harness menu; offering it
		// would open a configure screen for the shell the user is already in.
		expect(listConfigurableHarnessIds()).not.toContain("hobo-code");
	});

	it("keeps only coding-agent and sdk kinds", () => {
		// Inference and Eve harnesses configure elsewhere. Listing them here
		// would open the wrong screen for half the entries.
		const specs = [
			{ id: "a", kind: "coding-agent" },
			{ id: "b", kind: "sdk" },
			{ id: "c", kind: "inference" },
			{ id: "d", kind: "eve-agent" },
			{ id: "e", kind: "something-else" },
			{ id: "hobo-code", kind: "coding-agent" },
		] as never;
		expect(listConfigurableHarnessIds(specs)).toEqual(["a", "b"]);
	});
});
