/**
 * What a harness turn does with the prompt it is handed, and what it accepts
 * as a harness module.
 *
 * `ai-sdk-harness-runtime.test.ts` beside this file establishes the dispatch
 * rule — adapters are chosen from `runtime.adapter`, never from the agent id.
 * This file covers the two normalisers that sit on either side of that
 * dispatch, both of which fail quietly rather than loudly when they get
 * something unexpected:
 *
 * **`promptText` accepts four prompt shapes and must not lose text.** The AI
 * SDK hands a turn either a bare string or a `{ content }` envelope, and the
 * envelope's content is itself either a string or an array of parts. A shape
 * that fell through to `""` would run the CLI with an empty prompt — which
 * exits zero, returns nothing, and looks to the caller like a model that
 * declined to answer. There is no error to trace back to the real cause, so
 * the shapes are pinned individually.
 *
 * **`pickBuiltinExport` decides whether a loaded package is a harness.** It
 * accepts a factory function, an already-constructed object, or a default
 * export, and screens all three on the same three fields. Accepting something
 * that merely looks close would defer the failure to the first prompt turn,
 * where the stack trace names the AI SDK rather than the adapter that was
 * mis-detected. Worth knowing, and pinned below: the screen runs on the real
 * `import()` only — an injected `importBuiltin` short-circuits ahead of it and
 * is trusted verbatim, so the seam is an injection point rather than a
 * validated boundary.
 *
 * Everything here goes through the public `createHarnessV1` /
 * `cliPromptInvocation` surface — the normalisers are internal, which is the
 * point: a caller cannot work around them.
 */
import { describe, expect, it } from "vitest";

import {
	cliPromptInvocation,
	createHarnessAgent,
	createHarnessV1,
	type HarnessPrompt,
	type HarnessV1,
	type HarnessV1Event,
} from "../src/ai-sdk-harness-runtime.js";
import { parseHarnessSpec } from "../src/harness-spec.js";

const cliSpec = (prompt?: Record<string, unknown>) =>
	parseHarnessSpec({
		id: "probe",
		label: "Probe",
		kind: "coding-agent",
		command: "probe-cli",
		// `runtime.adapter` is required once `runtime` is present at all — the
		// parser refuses a half-specified runtime rather than guessing.
		...(prompt === undefined
			? undefined
			: { runtime: { adapter: "cli", prompt } }),
	});

/** Drive one prompt turn and hand back the text the runtime actually sent. */
async function promptSeenBy(prompt: HarnessPrompt): Promise<string> {
	let seen = "";
	const harness = await createHarnessV1(cliSpec(), {
		runCliTurn: async (input) => {
			seen = input.prompt;
			return "ok";
		},
	});
	const session = await harness.doStart({ sessionId: "s1" });
	const turn = await session.doPromptTurn({ prompt, emit: () => {} });
	await turn.done;
	return seen;
}

/** Collect the event stream a turn emits, in order. */
async function eventsFor(reply: string): Promise<HarnessV1Event[]> {
	const events: HarnessV1Event[] = [];
	const harness = await createHarnessV1(cliSpec(), {
		runCliTurn: async () => reply,
	});
	const session = await harness.doStart({ sessionId: "s1" });
	const turn = await session.doPromptTurn({
		prompt: "hello",
		emit: (event) => events.push(event),
	});
	await turn.done;
	return events;
}

describe("the prompt shapes a turn accepts", () => {
	it("takes a bare string", () => {
		return expect(promptSeenBy("write a test")).resolves.toBe("write a test");
	});

	it("takes a content envelope carrying a string", async () => {
		expect(await promptSeenBy({ content: "write a test" })).toBe(
			"write a test",
		);
	});

	it("joins the parts of a content array", async () => {
		// A multi-part prompt is the normal shape once a system preamble and a
		// user message are both present; taking only the first part would drop
		// the actual request.
		expect(await promptSeenBy({ content: ["write ", "a test"] })).toBe(
			"write a test",
		);
	});

	it("reads the text field out of an object part", async () => {
		expect(
			await promptSeenBy({
				content: [{ type: "text", text: "write " }, { text: "a test" }],
			}),
		).toBe("write a test");
	});

	it("mixes string and object parts in one prompt", async () => {
		// The SDK does not promise a homogeneous array, and a shape check that
		// bailed on the first mismatch would silently truncate.
		expect(
			await promptSeenBy({ content: ["write ", { text: "a test" }] }),
		).toBe("write a test");
	});

	it("skips a part whose text is not a string rather than stringifying it", async () => {
		// `String({})` is "[object Object]" — pasting that into a prompt is
		// worse than dropping it, because the model treats it as an
		// instruction.
		expect(await promptSeenBy({ content: [{ text: 42 }, "real text"] })).toBe(
			"real text",
		);
	});

	it("skips a part with no text field at all", async () => {
		expect(
			await promptSeenBy({ content: [{ type: "image" }, "real text"] }),
		).toBe("real text");
	});

	it("skips a null part", async () => {
		expect(await promptSeenBy({ content: [null, "real text"] })).toBe(
			"real text",
		);
	});

	it("yields empty text for an envelope with no content", async () => {
		expect(await promptSeenBy({})).toBe("");
	});

	it("yields empty text for content that is neither string nor array", async () => {
		expect(await promptSeenBy({ content: 42 })).toBe("");
	});
});

describe("the events a turn emits", () => {
	it("brackets the reply with text-start and text-end", async () => {
		const kinds = (await eventsFor("hi")).map((event) => event.type);
		expect(kinds).toStrictEqual([
			"text-start",
			"text-delta",
			"text-end",
			"finish",
		]);
	});

	it("carries the reply as the delta", async () => {
		const delta = (await eventsFor("hi")).find(
			(event) => event.type === "text-delta",
		);
		expect(delta).toMatchObject({ delta: "hi" });
	});

	it("omits the delta entirely for an empty reply", async () => {
		// A zero-length delta is not the same as no delta: a consumer
		// accumulating text would render an empty assistant bubble rather than
		// none at all.
		const kinds = (await eventsFor("")).map((event) => event.type);
		expect(kinds).toStrictEqual(["text-start", "text-end", "finish"]);
	});

	it("finishes with a stop reason rather than leaving the turn open", async () => {
		const finish = (await eventsFor("hi")).find(
			(event) => event.type === "finish",
		);
		expect(finish).toMatchObject({
			finishReason: { unified: "stop", raw: "stop" },
		});
	});

	it("reports zero usage for a custom adapter instead of inventing numbers", async () => {
		// The CLI adapters have no token accounting to report. Zero is the
		// honest answer; a guess would land in a cost dashboard.
		const finish = (await eventsFor("hi")).find(
			(event) => event.type === "finish",
		);
		expect(finish).toMatchObject({
			totalUsage: {
				inputTokens: { total: 0, noCache: 0 },
				outputTokens: { total: 0, text: 0 },
			},
		});
	});

	it("accepts a tool result without a tool loop to feed it to", async () => {
		// The handle satisfies the HarnessV1 shape; a throwing stub would break
		// a generic caller that submits unconditionally.
		const harness = await createHarnessV1(cliSpec(), {
			runCliTurn: async () => "ok",
		});
		const session = await harness.doStart({ sessionId: "s1" });
		const turn = await session.doPromptTurn({ prompt: "x", emit: () => {} });
		await expect(turn.submitToolResult({ ok: true })).resolves.toBeUndefined();
	});
});

describe("the rest of the session lifecycle", () => {
	const start = async () => {
		const harness = await createHarnessV1(cliSpec(), {
			runCliTurn: async () => "ok",
		});
		return { harness, session: await harness.doStart({ sessionId: "s1" }) };
	};

	it("reports a fresh session as not a resume", async () => {
		expect((await start()).session.isResume).toBe(false);
	});

	it("keeps the session id it was started with", async () => {
		// The caller correlates transcript rows by it; a generated id would
		// orphan everything written before the first turn.
		expect((await start()).session.sessionId).toBe("s1");
	});

	it("emits a bare finish for a continue turn", async () => {
		// Continuing has no new text of its own — the events exist so a
		// consumer's state machine still closes the turn.
		const { session } = await start();
		const events: HarnessV1Event[] = [];
		const turn = await session.doContinueTurn({
			emit: (event) => events.push(event),
		});
		await turn.done;
		expect(events.map((event) => event.type)).toStrictEqual([
			"text-start",
			"text-end",
			"finish",
		]);
	});

	it("hands back resumable state on detach", async () => {
		const { harness, session } = await start();
		expect(await session.doDetach()).toStrictEqual({
			type: "resume-session",
			harnessId: harness.harnessId,
			specificationVersion: "harness-v1",
			data: {},
		});
	});

	it("hands back resumable state on stop, not a terminal marker", async () => {
		// Stop is not destroy. Returning a terminal state here would make a
		// stopped session unrecoverable.
		expect(await (await start()).session.doStop()).toMatchObject({
			type: "resume-session",
		});
	});

	it("hands back continue state on suspend", async () => {
		// A suspended *turn* resumes mid-turn; conflating it with a suspended
		// session would restart the prompt.
		expect(await (await start()).session.doSuspendTurn()).toMatchObject({
			type: "continue-turn",
			specificationVersion: "harness-v1",
		});
	});

	it("stamps the harness id on every state it returns", async () => {
		const { harness, session } = await start();
		expect(await session.doSuspendTurn()).toMatchObject({
			harnessId: harness.harnessId,
		});
	});

	it("compacts and destroys without a backing process to talk to", async () => {
		const { session } = await start();
		await expect(session.doCompact()).resolves.toBeUndefined();
		await expect(session.doDestroy()).resolves.toBeUndefined();
	});

	it("names the harness after the spec id", async () => {
		expect((await start()).harness.harnessId).toBe("probe");
	});

	it("declares no builtin tools for a CLI adapter", async () => {
		// The CLI owns its own tools; claiming any here would have the SDK
		// offer the model tools nothing implements.
		expect((await start()).harness.builtinTools).toStrictEqual({});
	});
});

describe("what counts as a builtin harness module", () => {
	const builtinSpec = parseHarnessSpec({
		id: "cc",
		label: "CC",
		kind: "coding-agent",
		command: "cc",
		runtime: { adapter: "claude-code" },
	});

	const harnessObject = (harnessId: string): HarnessV1 =>
		({
			specificationVersion: "harness-v1",
			harnessId,
			builtinTools: {},
			doStart: async () => {
				throw new Error("not started in this test");
			},
		}) as unknown as HarnessV1;

	const load = (mod: Record<string, unknown>) =>
		createHarnessV1(builtinSpec, {
			// SAFETY: the importer seam takes the module shape the loader screens.
			importBuiltin: async () => mod as unknown as HarnessV1,
		});

	it("takes the module the importer returns when it is already a harness", async () => {
		expect((await load(harnessObject("from-module"))).harnessId).toBe(
			"from-module",
		);
	});

	it("trusts the injected importer verbatim, screening only real imports", async () => {
		// Pinning the seam as it actually behaves: `importBuiltin` short-circuits
		// ahead of `pickBuiltinExport`, so a module that is not a harness at all
		// comes straight back. That is deliberate — the seam exists so a test or
		// an embedder can supply an object the screen would reject — but it does
		// mean the screen is not a safety net for callers who use it.
		expect(await load({ not: "a harness" })).toStrictEqual({
			not: "a harness",
		});
	});

	it("screens the package it imports itself", async () => {
		// With no importer injected the real `import()` runs and the result goes
		// through `pickBuiltinExport`. `@ai-sdk/harness-claude-code` is installed
		// here, so this is the live path: whatever comes back must satisfy the
		// same three-field screen an injected module bypasses.
		const harness = await createHarnessV1(builtinSpec);
		expect(harness.specificationVersion).toBe("harness-v1");
		expect(typeof harness.harnessId).toBe("string");
		expect(harness.doStart).toBeInstanceOf(Function);
	});

	it("takes the real package's id, not the spec id", async () => {
		// The harness names itself; overwriting that with the spec id would make
		// a resume state built by one adapter look valid to another.
		expect((await createHarnessV1(builtinSpec)).harnessId).not.toBe("cc");
	});
});

describe("building a one-shot CLI invocation", () => {
	it("defaults to the -p prompt flag", async () => {
		// Every bundled coding CLI takes `-p` for a one-shot prompt; making the
		// spec restate it would be boilerplate that drifts.
		expect(cliPromptInvocation(cliSpec(), "hi")).toStrictEqual({
			command: "probe-cli",
			args: ["-p", "hi"],
		});
	});

	it("takes an explicit prefix over the default", () => {
		expect(
			cliPromptInvocation(
				cliSpec({ placement: "trailing-arg", prefixArgs: ["run", "--once"] }),
				"hi",
			).args,
		).toStrictEqual(["run", "--once", "hi"]);
	});

	it("moves the prompt to stdin when the spec says so", () => {
		// A long prompt on argv hits ARG_MAX and fails with E2BIG rather than
		// anything the user can read.
		expect(
			cliPromptInvocation(cliSpec({ placement: "stdin" }), "hi"),
		).toStrictEqual({ command: "probe-cli", args: ["-p"], stdin: "hi" });
	});

	it("keeps an explicit prefix when the prompt goes to stdin", () => {
		expect(
			cliPromptInvocation(
				cliSpec({ placement: "stdin", prefixArgs: ["chat"] }),
				"hi",
			),
		).toStrictEqual({ command: "probe-cli", args: ["chat"], stdin: "hi" });
	});

	it("refuses a cli spec with no command instead of spawning nothing", async () => {
		const spec = parseHarnessSpec({
			id: "nocmd",
			label: "No Command",
			kind: "coding-agent",
		});
		expect(() => cliPromptInvocation(spec, "hi")).toThrow(/requires command/);
	});

	it("refuses at construction time, not at first prompt", async () => {
		// A harness that constructs and then fails on the first turn wastes the
		// session setup and reports the failure where nobody is looking for a
		// configuration error.
		const spec = parseHarnessSpec({
			id: "nocmd",
			label: "No Command",
			kind: "coding-agent",
		});
		await expect(createHarnessV1(spec)).rejects.toThrow(/requires command/);
	});
});

describe("passing the working directory through", () => {
	const cwdSeenBy = async (
		options: { cwd?: string },
		spec = cliSpec(),
	): Promise<string | undefined> => {
		let seen: string | undefined;
		let called = false;
		const harness = await createHarnessV1(spec, {
			...options,
			runCliTurn: async (input) => {
				called = true;
				seen = input.cwd;
				return "ok";
			},
		});
		const session = await harness.doStart({ sessionId: "s1" });
		await (await session.doPromptTurn({ prompt: "x", emit: () => {} })).done;
		expect(called).toBe(true);
		return seen;
	};

	it("forwards an explicit cwd to the runner", async () => {
		expect(await cwdSeenBy({ cwd: "/work/repo" })).toBe("/work/repo");
	});

	it("omits cwd rather than sending undefined when none is set", async () => {
		// The key's absence is what lets the spawn inherit the process cwd; an
		// explicit `undefined` is the same to JS but not to an exactOptional
		// consumer that checks `in`.
		expect(await cwdSeenBy({})).toBeUndefined();
	});

	it("forwards cwd for an eve tree too", async () => {
		const spec = parseHarnessSpec({
			id: "tree",
			label: "Tree",
			kind: "eve-agent",
			command: "eve",
		});
		expect(await cwdSeenBy({ cwd: "/work/repo" }, spec)).toBe("/work/repo");
	});

	it("forwards cwd for the sdk adapter's CLI fallback", async () => {
		const spec = parseHarnessSpec({
			id: "sdk-agent",
			label: "SDK",
			kind: "sdk",
			command: "sdk-cli",
		});
		expect(await cwdSeenBy({ cwd: "/work/repo" }, spec)).toBe("/work/repo");
	});
});

describe("the eve and sdk fallbacks", () => {
	const runOnce = async (
		spec: ReturnType<typeof parseHarnessSpec>,
		options = {},
	) => {
		const harness = await createHarnessV1(spec, options);
		const session = await harness.doStart({ sessionId: "s1" });
		let text = "";
		const turn = await session.doPromptTurn({
			prompt: "hello",
			emit: (event) => {
				if (event.type === "text-delta") text += event.delta;
			},
		});
		await turn.done;
		return text;
	};

	const eveSpec = (extra: Record<string, unknown> = {}) =>
		parseHarnessSpec({
			id: "tree",
			label: "Tree",
			kind: "eve-agent",
			...extra,
		});

	it("echoes rather than spawning when an eve tree has no runner", async () => {
		// The echo is a visible placeholder: an eve tree with no runner wired
		// should look obviously unimplemented, not silently produce nothing.
		expect(await runOnce(eveSpec())).toContain("hello");
	});

	it("names the tree in the echo", async () => {
		expect(await runOnce(eveSpec())).toContain("tree");
	});

	it("defaults an eve command when the spec omits one", async () => {
		let seen = "";
		await runOnce(eveSpec(), {
			runCliTurn: async (input: { command: string }) => {
				seen = input.command;
				return "ok";
			},
		});
		expect(seen).toBe("eve");
	});

	it("prefers the spec command over the eve default", async () => {
		let seen = "";
		await runOnce(eveSpec({ command: "my-eve" }), {
			runCliTurn: async (input: { command: string }) => {
				seen = input.command;
				return "ok";
			},
		});
		expect(seen).toBe("my-eve");
	});

	it("prefers generateSdkText over the CLI runner for the sdk adapter", async () => {
		// Both seams can be injected at once; falling through to the CLI would
		// spawn a process the caller explicitly replaced.
		const spec = parseHarnessSpec({
			id: "sdk-agent",
			label: "SDK",
			kind: "sdk",
			command: "sdk-cli",
		});
		expect(
			await runOnce(spec, {
				generateSdkText: async () => "from the sdk",
				runCliTurn: async () => "from the cli",
			}),
		).toBe("from the sdk");
	});

	it("defaults an sdk command when falling back to the CLI runner", async () => {
		let seen = "";
		await runOnce(
			parseHarnessSpec({ id: "sdk-agent", label: "SDK", kind: "sdk" }),
			{
				runCliTurn: async (input: { command: string }) => {
					seen = input.command;
					return "ok";
				},
			},
		);
		expect(seen).toBe("sdk");
	});
});

describe("wrapping a harness in an agent", () => {
	const hostSpec = parseHarnessSpec({
		id: "host-agent",
		label: "Host",
		kind: "coding-agent",
		command: "host-cli",
	});

	it("passes instructions through to the agent constructor", async () => {
		let seen: { instructions?: string } | undefined;
		await createHarnessAgent(hostSpec, {
			sandbox: {},
			createAgent: (input) => {
				seen = input;
				return { createSession: async () => ({}) };
			},
		});
		expect(seen?.instructions).toBe(undefined);
	});

	it("carries explicit instructions to the agent", async () => {
		let seen: { instructions?: string } | undefined;
		await createHarnessAgent(hostSpec, {
			sandbox: {},
			instructions: "be terse",
			createAgent: (input) => {
				seen = input;
				return { createSession: async () => ({}) };
			},
		});
		expect(seen?.instructions).toBe("be terse");
	});

	it("hands the constructed harness to the agent, not the spec", async () => {
		// The agent needs something with a `doStart`; passing the spec would
		// fail on the first session with a shape error rather than here.
		let seen: { harness: HarnessV1 } | undefined;
		await createHarnessAgent(hostSpec, {
			sandbox: {},
			createAgent: (input) => {
				seen = input;
				return { createSession: async () => ({}) };
			},
		});
		expect(seen?.harness.harnessId).toBe("host-agent");
	});

	it("prefers the injected sandbox over loading just-bash", async () => {
		// The package is an optional dependency; loading it when the caller
		// already supplied a sandbox would make an injected test hang on a
		// real import.
		let seen: { sandbox: unknown } | undefined;
		await createHarnessAgent(hostSpec, {
			sandbox: { marker: "injected" },
			importJustBashSandbox: () => {
				throw new Error("must not load just-bash when a sandbox is injected");
			},
			createAgent: (input) => {
				seen = input;
				return { createSession: async () => ({}) };
			},
		});
		expect(seen?.sandbox).toStrictEqual({ marker: "injected" });
	});

	it("refuses a just-bash module that exports no factory", async () => {
		// A version bump that renames the export must fail here, naming the
		// package, rather than at the first sandboxed command.
		await expect(
			createHarnessAgent(hostSpec, {
				importJustBashSandbox: async () =>
					({}) as unknown as {
						createJustBashSandbox: () => never;
					},
				createAgent: () => ({ createSession: async () => ({}) }),
			}),
		).rejects.toThrow(/createJustBashSandbox/);
	});

	it("builds a sandbox from the injected just-bash importer", async () => {
		let seen: { sandbox: unknown } | undefined;
		await createHarnessAgent(hostSpec, {
			importJustBashSandbox: async () => ({
				createJustBashSandbox: () => ({ marker: "just-bash" }),
			}),
			createAgent: (input) => {
				seen = input;
				return { createSession: async () => ({}) };
			},
		});
		expect(seen?.sandbox).toStrictEqual({ marker: "just-bash" });
	});

	it("refuses a HarnessAgent module that exports no constructor", async () => {
		await expect(
			createHarnessAgent(hostSpec, {
				sandbox: {},
				importHarnessAgent: async () =>
					({}) as unknown as {
						HarnessAgent: new () => never;
					},
			}),
		).rejects.toThrow(/HarnessAgent/);
	});

	it("constructs through the injected HarnessAgent class", async () => {
		class FakeAgent {
			constructor(readonly settings: { harness: HarnessV1 }) {}
			async createSession() {
				return {};
			}
		}
		const agent = await createHarnessAgent(hostSpec, {
			sandbox: {},
			importHarnessAgent: async () => ({
				// SAFETY: the fake stands in for the AI SDK class at this seam.
				HarnessAgent: FakeAgent as never,
			}),
		});
		expect(agent).toBeInstanceOf(FakeAgent);
	});
});
