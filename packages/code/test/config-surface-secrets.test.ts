/**
 * The configuration inventory, and the values it must never print.
 *
 * `hobo-code config` answers "what is set up on this machine?" — and it answers
 * it for an audience that includes bug reports, support threads, and pasted
 * terminal output. So the single rule the module exists to enforce is:
 *
 * **A secret's presence is reported; its value never is.** `OPENAI_API_KEY`,
 * `ANTHROPIC_API_KEY`, `HOBO_CODE_AGENT_TOKEN` and `HOBO_CODE_SESSION_REF` are
 * marked secret, and a secret knob's `valueHint` is the fixed string
 * `present (secret)` regardless of what the variable actually contains. A
 * truncated prefix would be worse than useless: it leaks the key's shape and
 * issuer while still not being enough to diagnose anything.
 *
 * Non-secret knobs report `set` rather than their value for the same reason at
 * lower stakes — a base URL or a model name can carry an internal hostname or
 * a customer identifier, and the inventory's job is presence, not contents.
 * The few knobs that do surface a value are the ones whose value *is* the
 * answer (a discovered file path, a list of binaries found on PATH), and they
 * are truncated.
 *
 * Two other properties matter:
 *
 * **Absence is not failure.** `missingCritical` is recommended-setup advice,
 * not a list of errors; the module says so in its own notes. A fresh install
 * with nothing configured must still produce a usable inventory rather than
 * refusing.
 *
 * **A model path can come from any of six knobs.** Requiring one specific
 * variable would report "no model path" to someone running a local Ollama, who
 * is in fact fully configured — so the check is a disjunction over every route
 * to a model, including the two BYOK keys.
 *
 * The whole surface takes `env` and `cwd` as arguments, so none of this reads
 * the developer's real environment.
 */
import { describe, expect, it } from "vitest";

import {
	CODE_CONFIG_SCHEMA,
	CONFIG_STACK_IDS,
	configHumanSummary,
	inspectConfigSurface,
	isConfigStackId,
} from "../src/config-surface.js";

const CWD = "/nonexistent-hobo-config-test";

/** Inspect against an explicit environment and a directory with nothing in it. */
const inspect = (env: NodeJS.ProcessEnv = {}) => inspectConfigSurface(env, CWD);

const knob = (env: NodeJS.ProcessEnv, name: string) =>
	inspect(env).knobs.find((entry) => entry.name === name);

const SECRETS = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"HOBO_CODE_AGENT_TOKEN",
	"HOBO_CODE_SESSION_REF",
] as const;

describe("secrets", () => {
	for (const name of SECRETS) {
		it(`never prints the value of ${name}`, () => {
			// The inventory is pasted into bug reports and support threads. A
			// truncated prefix would be worse than useless: it leaks the key's
			// shape and issuer while still not diagnosing anything.
			const secret = "sk-live-0123456789abcdefghijklmnop";
			const status = inspectConfigSurface({ [name]: secret }, CWD);
			expect(JSON.stringify(status)).not.toContain(secret);
		});

		it(`marks ${name} as secret`, () => {
			// The flag is what a renderer keys on; a secret that was not marked
			// would be formatted like any other value.
			expect(knob({ [name]: "x" }, name)?.secret).toBe(true);
		});

		it(`reports ${name} as present without its value`, () => {
			expect(knob({ [name]: "sk-live-abc" }, name)).toMatchObject({
				present: true,
				valueHint: "present (secret)",
			});
		});
	}

	it("uses one fixed hint for every secret, whatever the value", () => {
		// A hint derived from the value — its length, its prefix — would leak a
		// little on every report and vary in ways an attacker could read.
		const short = knob({ OPENAI_API_KEY: "a" }, "OPENAI_API_KEY");
		const long = knob(
			{ OPENAI_API_KEY: "sk-proj-".padEnd(200, "x") },
			"OPENAI_API_KEY",
		);
		expect(short?.valueHint).toBe(long?.valueHint);
	});

	it("reports an unset secret as absent with no hint", () => {
		expect(knob({}, "OPENAI_API_KEY")).toMatchObject({
			present: false,
			valueHint: null,
		});
	});

	it("treats an empty secret as unset", () => {
		// An exported-but-empty variable is the shell's way of saying nothing.
		// Reporting it as present would send someone hunting for a key that is
		// not there.
		expect(knob({ OPENAI_API_KEY: "" }, "OPENAI_API_KEY")?.present).toBe(false);
	});

	it("keeps the secret out of the human summary too", () => {
		// Two renderers, one rule. The summary is the output people actually
		// paste, so it is the one that matters most.
		const secret = "sk-live-0123456789abcdefghijklmnop";
		const status = inspectConfigSurface({ OPENAI_API_KEY: secret }, CWD);
		expect(configHumanSummary(status)).not.toContain(secret);
	});
});

describe("non-secret knobs", () => {
	it("reports presence rather than the value", () => {
		// A base URL can carry an internal hostname; the inventory's job is
		// presence, not contents.
		expect(
			knob({ OPENAI_BASE_URL: "https://internal.acme/v1" }, "OPENAI_BASE_URL"),
		).toMatchObject({ present: true, valueHint: "set" });
	});

	it("does not leak a non-secret value into the JSON either", () => {
		const status = inspectConfigSurface(
			{ OPENAI_BASE_URL: "https://internal.acme/v1" },
			CWD,
		);
		expect(JSON.stringify(status)).not.toContain("internal.acme");
	});

	it("reports an unset knob as absent", () => {
		expect(knob({}, "OPENAI_BASE_URL")).toMatchObject({
			present: false,
			valueHint: null,
		});
	});

	it("treats an empty value as unset", () => {
		expect(knob({ HOBO_HOME: "" }, "HOBO_HOME")?.present).toBe(false);
	});
});

describe("the inventory as a whole", () => {
	it("stamps its schema", () => {
		// The JSON is consumed by other tools; the schema id is how they tell a
		// shape change from a value change.
		expect(inspect().schema).toBe(CODE_CONFIG_SCHEMA);
	});

	it("produces a usable inventory with nothing configured at all", () => {
		// A fresh install is the commonest case this command is run in.
		// Refusing there would make the diagnostic unavailable exactly when it
		// is needed most.
		const status = inspect();
		expect(status.knobs.length).toBeGreaterThan(0);
		expect(status.setupChecklist.length).toBeGreaterThan(0);
	});

	it("reports every knob whether present or not", () => {
		// An inventory that listed only what is set could not tell "not
		// configured" from "not a thing" — which is the question a reader has.
		const bare = inspect().knobs.length;
		const configured = inspect({ HOBO_HOME: "/tmp/hobo" }).knobs.length;
		expect(configured).toBe(bare);
	});

	it("files each knob under every stack it belongs to", () => {
		// Knobs are cross-cutting: HOBO_HOME matters to core, hermetic, and
		// auth alike. Filing it under one would hide it from the others.
		const status = inspect();
		const home = status.knobs.find((entry) => entry.name === "HOBO_HOME");
		for (const stack of home?.stacks ?? []) {
			expect(status.byStack[stack]?.map((entry) => entry.name)).toContain(
				"HOBO_HOME",
			);
		}
	});

	it("gives every known stack a bucket, even an empty one", () => {
		// A reader filtering by stack should get an empty list rather than
		// undefined — the difference between "nothing here" and "no such
		// stack".
		const status = inspect();
		for (const stack of CONFIG_STACK_IDS) {
			expect(status.byStack[stack]).toBeDefined();
		}
	});

	it("says plainly that it does not print secret values", () => {
		// The promise is part of the output, so a reader can rely on it without
		// reading the source.
		expect(inspect().notes.join(" ")).toMatch(/[Nn]ever prints secret values/);
	});

	it("says the gaps are recommendations, not failures", () => {
		expect(inspect().notes.join(" ")).toMatch(/not hard failures/);
	});
});

describe("the model path", () => {
	const hasModelGap = (env: NodeJS.ProcessEnv) =>
		inspect(env).missingCritical.some((gap) => gap.includes("no model path"));

	it("reports a gap when no route to a model is configured", () => {
		expect(hasModelGap({})).toBe(true);
	});

	for (const name of [
		"HOBO_CODE_MODEL",
		"OPENAI_BASE_URL",
		"OLLAMA_HOST",
		"HOBO_CODE_LOCAL_BASE_URL",
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
	]) {
		it(`accepts ${name} as a model path`, () => {
			// Requiring one specific variable would report "no model path" to
			// someone running a local Ollama who is in fact fully configured.
			expect(hasModelGap({ [name]: "configured" })).toBe(false);
		});
	}

	it("does not name the value in the gap message", () => {
		// The gap text is advice; two of the six routes are API keys, so it has
		// to be written without reference to what was found.
		const status = inspect({});
		const gap = status.missingCritical.find((entry) =>
			entry.includes("no model path"),
		);
		expect(gap).toMatch(/values never printed/);
	});
});

describe("recommended setup gaps", () => {
	it("suggests disabling the sponsored wait when monetization is unset", () => {
		expect(inspect().missingCritical.join(" ")).toMatch(
			/HOBO_CODE_MONETIZATION=0/,
		);
	});

	it("drops that suggestion once it is set", () => {
		// Advice that persists after being followed trains a reader to ignore
		// the whole list.
		expect(
			inspect({ HOBO_CODE_MONETIZATION: "0" }).missingCritical.join(" "),
		).not.toMatch(/HOBO_CODE_MONETIZATION=0/);
	});

	it("suggests an editor when none is configured", () => {
		expect(inspect().missingCritical.join(" ")).toMatch(/EDITOR=nvim/);
	});

	it("drops the editor suggestion once EDITOR is set", () => {
		expect(inspect({ EDITOR: "nvim" }).missingCritical.join(" ")).not.toMatch(
			/EDITOR=nvim/,
		);
	});

	it("reports no gaps as an empty list rather than a message", () => {
		// The list is iterated by callers; a sentinel string would be counted
		// as a gap by anything checking its length.
		expect(Array.isArray(inspect().missingCritical)).toBe(true);
	});
});

describe("the human summary", () => {
	it("leads with the setup tip count and the legend", () => {
		const status = inspect();
		expect(configHumanSummary(status).split("\n")[0]).toContain(status.legend);
	});

	it("marks a present knob differently from an absent one", () => {
		// The glyph is the whole information content of the line; if both
		// states rendered the same the summary would say nothing.
		const bare = configHumanSummary(inspect());
		const set = configHumanSummary(inspect({ HOBO_HOME: "/tmp/hobo" }));
		expect(set).not.toBe(bare);
	});

	it("reports no gaps in words when there are none to report", () => {
		// An empty section reads as a rendering bug; saying so explicitly does
		// not.
		const status = inspect({
			HOBO_CODE_MODEL: "x",
			HOBO_CODE_MONETIZATION: "0",
			EDITOR: "nvim",
			PATH: "/nonexistent",
		});
		const summary = configHumanSummary(status);
		expect(summary).toMatch(/gaps ·/);
	});

	it("shows at most three gaps so the summary stays a summary", () => {
		// The full list is in `--json`; a summary that grew with the number of
		// unset knobs would be unreadable on a fresh install.
		const summary = configHumanSummary(inspect());
		const gapLine = summary
			.split("\n")
			.find((line) => line.startsWith("gaps ·"));
		expect((gapLine?.match(/ · /g) ?? []).length).toBeLessThanOrEqual(3);
	});

	it("narrows to one stack when asked", () => {
		// The filter is what makes the command usable for a persona review —
		// a cost reviewer should not have to read the editor knobs.
		const status = inspect();
		const filtered = configHumanSummary(status, "cost-budget");
		expect(filtered).not.toMatch(/^editor-vim ·/m);
	});

	it("names the filtered stack", () => {
		const summary = configHumanSummary(inspect(), "cost-budget");
		expect(summary).toMatch(/cost-budget ·/);
	});

	it("skips a stack with no knobs rather than printing an empty line", () => {
		const summary = configHumanSummary(inspect(), "monetization");
		expect(summary.split("\n").every((line) => line.length > 0)).toBe(true);
	});

	it("tells the reader how to filter and how to get everything", () => {
		// A summary that cannot say what it left out is a summary the reader
		// cannot trust.
		const summary = configHumanSummary(inspect());
		expect(summary).toMatch(/--stack/);
		expect(summary).toMatch(/--json/);
	});

	it("leaves a name that already fits alone", () => {
		// The threshold is 18 characters, so `ANTHROPIC_API_KEY` (17) is printed
		// in full. Shortening everything would cost legibility for no gain.
		expect(
			configHumanSummary(inspect({ ANTHROPIC_API_KEY: "x" }), "models-byok"),
		).toContain("ANTHROPIC_API_KEY");
	});

	it("shortens a long knob name rather than wrapping the line", () => {
		// The summary is a fixed-width terminal artefact; one long name would
		// otherwise push every column out of alignment.
		const summary = configHumanSummary(inspect(), "models-byok");
		expect(summary).not.toContain("HOBO_CODE_LOCAL_BASE_URL");
	});

	it("marks a shortened name so the reader knows it was cut", () => {
		// A silently truncated name reads as a different variable; the ellipsis
		// is what says "look this up in --json".
		const summary = configHumanSummary(inspect(), "models-byok");
		expect(summary).toContain("…");
	});
});

describe("stack ids", () => {
	it("accepts every id it publishes", () => {
		// The predicate guards a CLI flag, so a published id it rejected would
		// be a documented option the command refuses.
		for (const id of CONFIG_STACK_IDS) {
			expect(isConfigStackId(id)).toBe(true);
		}
	});

	it("refuses an unknown id", () => {
		expect(isConfigStackId("not-a-stack")).toBe(false);
	});

	it("refuses an empty string", () => {
		expect(isConfigStackId("")).toBe(false);
	});

	it("is case-sensitive", () => {
		// Stack ids appear verbatim in JSON output that other tools match on;
		// accepting a different casing would make two spellings of one filter.
		expect(isConfigStackId("CORE")).toBe(false);
	});
});
