/**
 * Which engine a shell session gets, and what it says when it gets none.
 *
 * `HOBO_CODE_ENGINE` selects between four modes, and the default is `auto`:
 * try the local $0 path first, fall back to cloud, and if neither is there,
 * say so with the command that fixes it. Three properties carry the weight:
 *
 * **Anything unrecognised means `auto`, not `none`.** A typo in the variable
 * must not silently disable the engine — a user who wrote `HOBO_CODE_ENGINE=lokal`
 * wants an engine, and reading that as "no engine" would leave them with a
 * shell that answers nothing and blames their config for a reason they cannot
 * see. Auto is the safe misread: it tries everything.
 *
 * **Local is tried before cloud.** The local path is free. Reaching for a paid
 * provider while a working local model sits there is a real cost, charged
 * silently.
 *
 * **A failure to resolve names the fix.** The reason string ends with
 * `run \`ollama pull …\`` — the whole point of reporting "no engine" is to be
 * actionable, and a bare "unavailable" tells the user only that something they
 * did not configure is not configured.
 *
 * `localModelFromSpec` sits underneath: `ollama/qwen` is a local model,
 * `anthropic/claude` is not, and a bare name is taken as local. The
 * distinction matters because a provider-qualified cloud spec passed to Ollama
 * as a model name would ask a local daemon for a model it has never heard of.
 */
import { describe, expect, it } from "vitest";

import {
	type EngineMode,
	engineMode,
	localModelFromSpec,
	resolveShellEngine,
} from "../src/engine-resolve.js";

const mode = (value?: string): EngineMode =>
	engineMode(value === undefined ? {} : { HOBO_CODE_ENGINE: value });

describe("selecting an engine mode", () => {
	it.each(["none", "0", "off"])("reads %s as no engine", (value) => {
		// Three spellings because this is the one a user reaches for when the
		// engine is misbehaving and they want it out of the way.
		expect(mode(value)).toBe("none");
	});

	it.each(["local", "ollama"])("reads %s as local", (value) => {
		// `ollama` is the implementation and `local` is the intent; someone who
		// knows one may not know the other.
		expect(mode(value)).toBe("local");
	});

	it.each(["pi", "cloud"])("reads %s as cloud", (value) => {
		expect(mode(value)).toBe("cloud");
	});

	it("defaults to auto with nothing set", () => {
		expect(mode()).toBe("auto");
	});

	it("reads an empty value as auto", () => {
		expect(mode("")).toBe("auto");
	});

	it("reads whitespace as auto", () => {
		expect(mode("   ")).toBe("auto");
	});

	it("reads an unrecognised value as auto rather than as none", () => {
		// The safe misread. A typo must not silently disable the engine and
		// leave the user with a shell that answers nothing.
		expect(mode("lokal")).toBe("auto");
	});

	it("does not read a near-miss of none as none", () => {
		// `nope` is not `none`, and treating it as such would disable the
		// engine on a typo -- the exact failure the auto default prevents.
		expect(mode("nope")).toBe("auto");
	});

	it.each([
		"NONE",
		"Local",
		"OLLAMA",
		"Cloud",
		"PI",
	])("matches %s regardless of case", (value) => {
		// Environment variables get typed by hand and copied between
		// shells; case sensitivity here would be a silent misconfiguration.
		expect(mode(value)).not.toBe("auto");
	});

	it("trims surrounding whitespace before matching", () => {
		// A trailing space is the most common copy-paste artefact there is.
		expect(mode("  none  ")).toBe("none");
	});

	it("ignores an unrelated variable", () => {
		expect(engineMode({ HOBO_CODE_MODEL: "ollama/qwen" })).toBe("auto");
	});
});

describe("reading a local model out of a spec", () => {
	it("strips the ollama prefix", () => {
		expect(localModelFromSpec("ollama/qwen2.5-coder:1.5b")).toBe(
			"qwen2.5-coder:1.5b",
		);
	});

	it("keeps a tag on the model name", () => {
		// The tag selects the quantisation and size; dropping it would pull a
		// different model than the one asked for.
		expect(localModelFromSpec("ollama/llama3:8b")).toBe("llama3:8b");
	});

	it("takes a bare name as a local model", () => {
		// No provider qualifier means the user is naming something they expect
		// the local daemon to have.
		expect(localModelFromSpec("qwen2.5-coder")).toBe("qwen2.5-coder");
	});

	it("refuses a provider-qualified cloud spec", () => {
		// Passing `anthropic/claude-sonnet-5` to Ollama as a model name would
		// ask a local daemon for a model it has never heard of, and the error
		// would name the daemon rather than the misconfiguration.
		expect(localModelFromSpec("anthropic/claude-sonnet-5")).toBeUndefined();
	});

	it("refuses any other provider prefix", () => {
		expect(localModelFromSpec("openai/gpt-4.1")).toBeUndefined();
	});

	it("returns nothing for an undefined spec", () => {
		expect(localModelFromSpec(undefined)).toBeUndefined();
	});

	it("returns nothing for an empty spec", () => {
		expect(localModelFromSpec("")).toBeUndefined();
	});

	it("returns nothing for a whitespace-only spec", () => {
		// Trimmed to nothing is not a chosen model; returning `"   "` would ask
		// Ollama for a model named three spaces.
		expect(localModelFromSpec("   ")).toBeUndefined();
	});

	it("trims a spec before reading it", () => {
		expect(localModelFromSpec("  ollama/qwen  ")).toBe("qwen");
	});

	it("does not mistake a bare name containing a colon for a provider spec", () => {
		// The provider check is on `/`, not `:` -- and `:` is how Ollama spells
		// a tag, so confusing the two would reject every tagged local model.
		expect(localModelFromSpec("qwen:7b")).toBe("qwen:7b");
	});

	it("refuses a spec that is only a prefix", () => {
		// `ollama/` names no model. Returning the empty string would ask the
		// daemon for one.
		expect(localModelFromSpec("ollama/")).toBe("");
	});
});

describe("resolving with the engine switched off", () => {
	const options = {
		sandboxRoot: "/tmp/sandbox",
		runId: "run-1",
		instructions: "be helpful",
		modelSpec: "anthropic/claude-sonnet-5",
	};

	it("returns no engine", async () => {
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "none" },
		});
		expect(resolved.engine).toBeNull();
	});

	it("says why, naming the variable that did it", async () => {
		// The user set this deliberately, possibly a while ago. Naming the
		// variable is what turns "no engine" back into something they can undo.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "none" },
		});
		expect(resolved.reason).toContain("HOBO_CODE_ENGINE=none");
	});

	it("does not try any provider first", async () => {
		// `none` is a short-circuit, not a preference. Probing a daemon or a
		// credential store anyway would cost time on every session start.
		const started = Date.now();
		await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "off" },
		});
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});

describe("resolving when nothing is available", () => {
	const options = {
		sandboxRoot: "/tmp/sandbox",
		runId: "run-1",
		instructions: "be helpful",
		modelSpec: "anthropic/claude-sonnet-5",
	};

	it("returns no engine rather than throwing", async () => {
		// A missing engine is the ordinary state of a fresh machine. Throwing
		// would make the shell unopenable rather than merely unwired.
		const resolved = await resolveShellEngine({ ...options, env: {} });
		expect(resolved.engine).toBeNull();
	});

	it("says the local path is the free one", async () => {
		// The whole point of reporting "no engine" is to be actionable; a bare
		// "unavailable" tells the user only that something they did not
		// configure is not configured.
		const resolved = await resolveShellEngine({ ...options, env: {} });
		expect(resolved.reason).toMatch(/\$0/);
	});

	it("names the exact command that fixes it", async () => {
		const resolved = await resolveShellEngine({ ...options, env: {} });
		expect(resolved.reason).toMatch(/ollama pull /);
	});

	it("reports the absence of cloud credentials", async () => {
		// Two independent reasons, and the user needs to know it was both --
		// fixing only one still leaves them with no engine.
		const resolved = await resolveShellEngine({ ...options, env: {} });
		expect(resolved.reason).toMatch(/no cloud credentials/);
	});

	it("stops at the local reason when local was demanded", async () => {
		// `local` means local. Reporting a cloud failure too would send the
		// user to configure a provider they deliberately opted out of.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "local" },
		});
		expect(resolved.reason ?? "").not.toMatch(/no cloud credentials/);
	});

	it("returns no engine when local was demanded and is absent", async () => {
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "local" },
		});
		expect(resolved.engine).toBeNull();
	});

	it("does not report a local failure when cloud was demanded", async () => {
		// The mirror of the rule above: `cloud` means cloud, so the local
		// probe's own reason is not part of the answer.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "cloud" },
		});
		expect(resolved.reason ?? "").not.toMatch(/HOBO_CODE_TOOLS|planner/);
	});

	it("still suggests pulling a local model even in cloud mode", async () => {
		// Recorded as observed, and it is the weaker half of that mirror. The
		// "run `ollama pull …` for the local $0 path" suffix is appended to the
		// final reason unconditionally, so a user who set HOBO_CODE_ENGINE=cloud
		// is told to pull a local model -- advice for the path they explicitly
		// opted out of.
		//
		// Arguably fine: it is the free option, and someone with no cloud
		// credentials may well want to hear about it. But it reads as a
		// non-sequitur directly after "no cloud credentials", and the mode was
		// an explicit choice rather than a default.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_ENGINE: "cloud" },
		});
		expect(resolved.reason).toMatch(/ollama pull /);
	});

	it("reports the tool planner being switched off", async () => {
		// Tool calling is a separate opt-out from the engine itself. A session
		// running conversation-only should say so rather than looking like a
		// model that will not use its tools.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_TOOLS: "0" },
		});
		expect(resolved.reason).toMatch(/HOBO_CODE_TOOLS=0/);
	});

	it("still reports the fix alongside the planner note", async () => {
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_TOOLS: "0" },
		});
		expect(resolved.reason).toMatch(/ollama pull /);
	});

	it("joins several reasons rather than reporting only the last", async () => {
		// A user with two things wrong needs both, or they fix one and see the
		// same unhelpful message again.
		const resolved = await resolveShellEngine({
			...options,
			env: { HOBO_CODE_TOOLS: "0" },
		});
		expect(resolved.reason).toMatch(/;/);
	});
});
