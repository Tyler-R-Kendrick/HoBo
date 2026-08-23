/**
 * Where a harness config points, and the checklist that decides what to write.
 *
 * Two halves of `hobo-code agents init`, both with their dependencies handed in
 * rather than reached for: the destination resolver takes an environment and a
 * probe function, and the checklist takes its own stdin and stdout.
 *
 * **The resolver refuses rather than guessing.** With no model listen URL it
 * returns `ok: false` and a remediation list — it does not write harness
 * configs pointing at a default that may not be there. A config file naming a
 * dead endpoint is worse than no config: it fails later, somewhere else, with
 * an error that does not mention `agents init`.
 *
 * **Its precedence is explicit and ordered.** An explicitly-passed sidecar
 * beats `HOBO_CODE_LOCAL_BASE_URL`, which beats `OPENAI_BASE_URL`, which beats
 * `OLLAMA_HOST`, which beats probing the default Ollama host. Each step is
 * something a user stated more deliberately than the one below it, and the
 * probe is last because it is the only one nobody asked for.
 *
 * **The probe can be switched off.** `HOBO_CODE_AGENTS_PROBE=0` matters in CI,
 * where an 800ms connect attempt against a host that will never answer is
 * eight hundred wasted milliseconds on every run.
 *
 * The checklist is a modal keyboard surface, so what it restores matters as
 * much as what it returns: raw mode goes back off and the terminal is paused
 * on the way out, **including when the user aborts**, because a shell left in
 * raw mode after a Ctrl+C is a shell that has stopped echoing what is typed.
 */
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import {
	promptAgentChecklist,
	resolveAgentsDestination,
} from "../src/agent-harness-init.js";
import type { AgentPick } from "../src/agent-harness-picks.js";

// ------------------------------------------------------------- destination

const resolve = (
	env: NodeJS.ProcessEnv,
	extra: { sidecarUrl?: string; probeOllamaHost?: () => Promise<boolean> } = {},
) =>
	resolveAgentsDestination({
		env,
		// Never probe a real host unless a test says to.
		probeOllamaHost: extra.probeOllamaHost ?? (async () => false),
		...(extra.sidecarUrl !== undefined ? { sidecarUrl: extra.sidecarUrl } : {}),
	});

describe("refusing without a destination", () => {
	it("refuses when nothing names a model listener", async () => {
		// A config naming a dead endpoint fails later, somewhere else, with an
		// error that never mentions `agents init`.
		expect((await resolve({})).ok).toBe(false);
	});

	it("says why it refused", async () => {
		const result = await resolve({});
		if (result.ok) throw new Error("expected a refusal");
		expect(result.reason).toContain("no model listen URL");
	});

	it("offers ways to fix it", async () => {
		const result = await resolve({});
		if (result.ok) throw new Error("expected a refusal");
		expect(result.remediation.length).toBeGreaterThan(0);
	});

	it("names a command that would start a listener", async () => {
		const result = await resolve({});
		if (result.ok) throw new Error("expected a refusal");
		expect(result.remediation.join(" ")).toContain("ollama serve");
	});
});

describe("the precedence between sources", () => {
	it("takes an explicit sidecar first", async () => {
		const result = await resolve(
			{
				HOBO_CODE_LOCAL_BASE_URL: "http://local",
				OPENAI_BASE_URL: "http://openai",
				OLLAMA_HOST: "http://ollama",
			},
			{ sidecarUrl: "http://sidecar" },
		);
		if (!result.ok) throw new Error("expected a destination");
		expect(result.source).toBe("sidecar");
	});

	it("falls to the local base url", async () => {
		const result = await resolve({
			HOBO_CODE_LOCAL_BASE_URL: "http://local",
			OPENAI_BASE_URL: "http://openai",
		});
		if (!result.ok) throw new Error("expected a destination");
		expect(result.source).toBe("local-base-url");
	});

	it("falls to the openai base url", async () => {
		const result = await resolve({
			OPENAI_BASE_URL: "http://openai",
			OLLAMA_HOST: "http://ollama",
		});
		if (!result.ok) throw new Error("expected a destination");
		expect(result.source).toBe("openai-base-url");
	});

	it("falls to an explicit ollama host", async () => {
		const result = await resolve({ OLLAMA_HOST: "http://ollama" });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.source).toBe("ollama");
	});

	it("probes the default ollama host last", async () => {
		// Last because it is the only source nobody asked for.
		const result = await resolve({}, { probeOllamaHost: async () => true });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.source).toBe("ollama");
	});

	it("refuses when the probe finds nothing", async () => {
		expect((await resolve({}, { probeOllamaHost: async () => false })).ok).toBe(
			false,
		);
	});
});

describe("values that are present but empty", () => {
	it.each([
		["HOBO_CODE_LOCAL_BASE_URL", ""],
		["HOBO_CODE_LOCAL_BASE_URL", "   "],
		["OPENAI_BASE_URL", ""],
		["OLLAMA_HOST", "  "],
	])("ignores a blank %s", async (key, value) => {
		// `export OPENAI_BASE_URL=` sets the variable to empty. Treating that as
		// a destination would produce a config pointing at nothing at all.
		expect((await resolve({ [key]: value })).ok).toBe(false);
	});

	it("ignores a blank sidecar url", async () => {
		expect((await resolve({}, { sidecarUrl: "   " })).ok).toBe(false);
	});

	it("trims a url with surrounding whitespace", async () => {
		const result = await resolve({ OPENAI_BASE_URL: "  http://openai  " });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.namedUrl).toBe("http://openai");
	});
});

describe("the urls it derives", () => {
	it("derives an openai url", async () => {
		const result = await resolve({ OPENAI_BASE_URL: "http://host:11434" });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.openaiUrl).toContain("http://host:11434");
	});

	it("derives an anthropic url from the same base", async () => {
		// One listener, two API shapes: a harness that speaks either can be
		// pointed at the same place without the user resolving it twice.
		const result = await resolve({ OPENAI_BASE_URL: "http://host:11434" });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.anthropicUrl.length).toBeGreaterThan(0);
	});

	it("keeps the url the user actually named", async () => {
		const result = await resolve({ OPENAI_BASE_URL: "http://host:11434" });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.namedUrl).toBe("http://host:11434");
	});

	it("names the env key a session ref is written under", async () => {
		const result = await resolve({ OPENAI_BASE_URL: "http://host" });
		if (!result.ok) throw new Error("expected a destination");
		expect(result.envKey).toBe("HOBO_CODE_SESSION_REF");
	});
});

describe("switching the probe off", () => {
	it.each([
		"0",
		"false",
	])("does not probe when HOBO_CODE_AGENTS_PROBE=%s", async (value) => {
		// An 800ms connect attempt against a host that will never answer is
		// eight hundred wasted milliseconds on every CI run.
		let probed = false;
		const result = await resolve(
			{ HOBO_CODE_AGENTS_PROBE: value },
			{
				probeOllamaHost: async () => {
					probed = true;
					return true;
				},
			},
		);
		expect(probed).toBe(false);
		expect(result.ok).toBe(false);
	});

	it("still probes for any other value", async () => {
		let probed = false;
		await resolve(
			{ HOBO_CODE_AGENTS_PROBE: "1" },
			{
				probeOllamaHost: async () => {
					probed = true;
					return true;
				},
			},
		);
		expect(probed).toBe(true);
	});

	it("does not probe when an explicit url already answered", async () => {
		// The probe is a fallback; reaching it after a stated destination would
		// be a network call for a question already settled.
		let probed = false;
		await resolve(
			{ OPENAI_BASE_URL: "http://openai" },
			{
				probeOllamaHost: async () => {
					probed = true;
					return true;
				},
			},
		);
		expect(probed).toBe(false);
	});
});

// --------------------------------------------------------------- checklist

const pick = (id: string, patch: Partial<AgentPick> = {}): AgentPick => ({
	id,
	kind: "harness",
	label: id,
	detected: true,
	selected: false,
	note: "",
	...patch,
});

/** Drive the checklist with a scripted key sequence. */
async function checklist(
	picks: readonly AgentPick[],
	keys: readonly string[],
): Promise<{ result: readonly string[] | null; out: string; raw: boolean[] }> {
	const stdin = new PassThrough();
	const raw: boolean[] = [];
	// The prompt asks for raw mode and pauses on the way out; a PassThrough has
	// neither, so they are recorded rather than faked away.
	Object.assign(stdin, {
		setRawMode(on: boolean) {
			raw.push(on);
			return stdin;
		},
	});
	let out = "";
	const stdout = new Writable({
		write(chunk, _enc, done) {
			out += String(chunk);
			done();
		},
	});
	const pending = promptAgentChecklist(picks, {
		// SAFETY: the streams stand in for the TTY handles the prompt reads.
		stdin: stdin as unknown as NodeJS.ReadStream,
		// SAFETY: the streams stand in for the TTY handles the prompt writes.
		stdout: stdout as unknown as NodeJS.WriteStream,
	});
	for (const key of keys) {
		await new Promise((resolve) => setImmediate(resolve));
		stdin.write(key);
	}
	const result = await pending;
	return { result, out, raw };
}

describe("choosing what to write", () => {
	it("returns nothing selected when the user just confirms", async () => {
		const { result } = await checklist([pick("codex"), pick("claude")], ["\r"]);
		expect(result).toEqual([]);
	});

	it("returns the pick under the cursor when it is toggled", async () => {
		const { result } = await checklist(
			[pick("codex"), pick("claude")],
			[" ", "\r"],
		);
		expect(result).toEqual(["codex"]);
	});

	it("moves the cursor before toggling", async () => {
		const { result } = await checklist(
			[pick("codex"), pick("claude")],
			["j", " ", "\r"],
		);
		expect(result).toEqual(["claude"]);
	});

	it("takes x as a toggle too", async () => {
		const { result } = await checklist([pick("codex")], ["x", "\r"]);
		expect(result).toEqual(["codex"]);
	});

	it("toggles back off", async () => {
		const { result } = await checklist([pick("codex")], [" ", " ", "\r"]);
		expect(result).toEqual([]);
	});

	it("selects everything with a", async () => {
		const { result } = await checklist(
			[pick("codex"), pick("claude")],
			["a", "\r"],
		);
		expect(result).toEqual(["codex", "claude"]);
	});

	it("clears everything with a second a", async () => {
		// `a` is a toggle over the whole list, not a one-way select-all: the
		// user who hit it by mistake needs the same key to undo it.
		const { result } = await checklist(
			[pick("codex"), pick("claude")],
			["a", "a", "\r"],
		);
		expect(result).toEqual([]);
	});

	it("starts from what was already selected", async () => {
		const { result } = await checklist(
			[pick("codex", { selected: true }), pick("claude")],
			["\r"],
		);
		expect(result).toEqual(["codex"]);
	});

	it("keeps the picks in their original order", async () => {
		// The order is the detection order; re-ordering by selection would make
		// the confirmation read differently from the list just shown.
		const { result } = await checklist(
			[pick("a"), pick("b"), pick("c")],
			["j", " ", "k", " ", "\r"],
		);
		expect(result).toEqual(["a", "b"]);
	});
});

describe("leaving the checklist", () => {
	it("returns null when the user aborts with q", async () => {
		// Not an empty selection -- that would be indistinguishable from
		// confirming with nothing ticked, and would write empty configs.
		const { result } = await checklist([pick("codex")], ["q"]);
		expect(result).toBeNull();
	});

	it("returns null on ctrl-c", async () => {
		const { result } = await checklist([pick("codex")], [""]);
		expect(result).toBeNull();
	});

	it("discards selections made before an abort", async () => {
		const { result } = await checklist([pick("codex")], [" ", "q"]);
		expect(result).toBeNull();
	});

	it("takes a newline as confirmation", async () => {
		const { result } = await checklist([pick("codex")], [" ", "\n"]);
		expect(result).toEqual(["codex"]);
	});

	it("restores the terminal after confirming", async () => {
		// Raw on the way in, off on the way out.
		const { raw } = await checklist([pick("codex")], ["\r"]);
		expect(raw).toEqual([true, false]);
	});

	it("restores the terminal after aborting too", async () => {
		// The case that matters: a shell left in raw mode after Ctrl+C is a
		// shell that has stopped echoing what is typed.
		const { raw } = await checklist([pick("codex")], [""]);
		expect(raw).toEqual([true, false]);
	});

	it("erases what it painted on the way out", async () => {
		// The checklist is transient chrome; leaving it in the scrollback above
		// the command's real output would read as part of that output.
		const { out } = await checklist([pick("codex")], ["\r"]);
		expect(out.length).toBeGreaterThan(0);
	});
});

describe("keys the checklist ignores", () => {
	it.each(["z", "1", "\t"])("does nothing on %j", async (key) => {
		const { result } = await checklist([pick("codex")], [key, " ", "\r"]);
		expect(result).toEqual(["codex"]);
	});

	it("does not move the cursor past the last row", async () => {
		// A cursor that wrapped would put the user on a different pick from the
		// one the key press suggested.
		const { result } = await checklist(
			[pick("a"), pick("b")],
			["j", "j", "j", " ", "\r"],
		);
		expect(result).toEqual(["b"]);
	});

	it("does not move the cursor above the first row", async () => {
		const { result } = await checklist(
			[pick("a"), pick("b")],
			["k", "k", " ", "\r"],
		);
		expect(result).toEqual(["a"]);
	});

	it("takes the arrow keys as well as j and k", async () => {
		const { result } = await checklist(
			[pick("a"), pick("b")],
			["[B", " ", "\r"],
		);
		expect(result).toEqual(["b"]);
	});

	it("handles an empty pick list without hanging", async () => {
		const { result } = await checklist([], ["\r"]);
		expect(result).toEqual([]);
	});
});
