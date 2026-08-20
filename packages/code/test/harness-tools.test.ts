/**
 * The model-callable harness tools (ADR-0139).
 *
 * Every tool here is a thin translation from a model's arguments into a
 * `hobo-code` argv, and that thinness is the design: routing through the normal
 * CLI pipeline is what keeps an agent from bypassing platform composition,
 * feature gates and isolation checks. So the thing worth testing is exactly the
 * argv — a tool that assembled the wrong one would still "work", just against a
 * different command than its own description promises.
 *
 * `hobo_dispatch` looks like it is missing a verb and is not: `dispatch` is the
 * CLI's default verb, so a bare prompt is dispatched. Pinning that keeps
 * someone from "fixing" it into `["dispatch", ...]` and silently changing what
 * a model's free-text prompt runs.
 *
 * The other property pinned throughout is that every tool goes through the CLI
 * in JSON mode and reports its result envelope faithfully — including
 * failures. A tool that swallowed `ok: false` would let a model narrate a
 * success that did not happen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runHoboCodeCli = vi.fn();

vi.mock("../src/cli.js", () => ({
	runHoboCodeCli: (...args: unknown[]) => runHoboCodeCli(...args),
}));

const {
	HOBO_AGENT_TOOLS,
	hoboDevTool,
	hoboDispatchTool,
	hoboHistoryTool,
	hoboHiveStatusTool,
	hoboScaffoldTool,
	hoboTemplateTool,
} = await import("../src/harness-tools.js");

/** The argv the last CLI call was made with. */
const argv = () => runHoboCodeCli.mock.calls.at(-1)?.[0] as string[];

const run = async (
	tool: { run: (arg: never) => unknown },
	input?: unknown,
): Promise<Record<string, unknown>> =>
	(await tool.run({ input } as never)) as Record<string, unknown>;

beforeEach(() => {
	runHoboCodeCli.mockReset();
	runHoboCodeCli.mockResolvedValue({ ok: true, code: 0, message: "done" });
});

describe("the tool catalog", () => {
	it("exports every tool it defines", () => {
		expect(HOBO_AGENT_TOOLS).toHaveLength(6);
	});

	it("gives every tool a distinct name", () => {
		// Two tools under one name are indistinguishable to the model, and the
		// runtime will silently pick one.
		const names = HOBO_AGENT_TOOLS.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("namespaces every tool under hobo", () => {
		// The model sees these alongside a host's own tools; an unnamespaced
		// `status` would collide with somebody else's.
		for (const tool of HOBO_AGENT_TOOLS) {
			expect(tool.name.startsWith("hobo_")).toBe(true);
		}
	});

	it("describes every tool, since the description is what the model routes on", () => {
		for (const tool of HOBO_AGENT_TOOLS) {
			expect(String(tool.description).length).toBeGreaterThan(20);
		}
	});
});

describe("the CLI envelope", () => {
	it("always asks the CLI for JSON", async () => {
		// The model consumes the result structurally; human-formatted output
		// would have to be re-parsed out of prose.
		await run(hoboHiveStatusTool);
		expect(runHoboCodeCli.mock.calls[0]?.[1]).toEqual({ json: true });
	});

	it("reports the CLI's own result fields", async () => {
		runHoboCodeCli.mockResolvedValue({ ok: true, code: 0, message: "ready" });
		expect(await run(hoboHiveStatusTool)).toEqual({
			ok: true,
			code: 0,
			message: "ready",
		});
	});

	it("reports a failure rather than swallowing it", async () => {
		// A tool that hid `ok: false` would let the model narrate a success that
		// did not happen.
		runHoboCodeCli.mockResolvedValue({
			ok: false,
			code: 2,
			message: "no station",
		});
		expect(await run(hoboHiveStatusTool)).toMatchObject({
			ok: false,
			code: 2,
		});
	});

	it("carries the CLI's data through when there is any", async () => {
		runHoboCodeCli.mockResolvedValue({
			ok: true,
			code: 0,
			message: "",
			data: { panes: 2 },
		});
		expect((await run(hoboHiveStatusTool)).data).toEqual({ panes: 2 });
	});

	it("omits the data key entirely when the CLI returned none", async () => {
		// `data: undefined` is not JSON-representable; emitting the key would
		// hand the model a field that vanishes in transit.
		expect(await run(hoboHiveStatusTool)).not.toHaveProperty("data");
	});

	it("keeps a falsy data value rather than treating it as absent", async () => {
		runHoboCodeCli.mockResolvedValue({
			ok: true,
			code: 0,
			message: "",
			data: 0,
		});
		expect((await run(hoboHiveStatusTool)).data).toBe(0);
	});
});

describe("hobo_compute_status", () => {
	it("runs the bare status verb", async () => {
		await run(hoboHiveStatusTool);
		expect(argv()).toEqual(["status"]);
	});

	it("takes no input, since it is read-only", () => {
		expect(hoboHiveStatusTool.name).toBe("hobo_compute_status");
	});
});

describe("hobo_dispatch", () => {
	it("passes the prompt as the argv, relying on dispatch being the default verb", async () => {
		// Not a missing verb: the CLI dispatches a bare positional prompt.
		// Prefixing "dispatch" here would change what a free-text prompt runs.
		await run(hoboDispatchTool, { prompt: "add a login page" });
		expect(argv()).toEqual(["add", "a", "login", "page"]);
	});

	it("trims the prompt before splitting it", async () => {
		// A leading space would otherwise produce an empty first argument, which
		// the CLI reads as an empty verb.
		await run(hoboDispatchTool, { prompt: "  build it  " });
		expect(argv()).toEqual(["build", "it"]);
	});

	it("collapses runs of whitespace", async () => {
		await run(hoboDispatchTool, { prompt: "build\n\tit" });
		expect(argv()).toEqual(["build", "it"]);
	});
});

describe("hobo_scaffold", () => {
	it("scaffolds the named example", async () => {
		await run(hoboScaffoldTool, { name: "hello-world" });
		expect(argv()).toEqual(["scaffold", "hello-world"]);
	});

	it("passes the name through verbatim rather than guessing", async () => {
		// The catalog decides what exists; a tool that corrected a name here
		// would scaffold something the model did not ask for.
		await run(hoboScaffoldTool, { name: "not-a-real-example" });
		expect(argv()).toEqual(["scaffold", "not-a-real-example"]);
	});
});

describe("hobo_template", () => {
	it("searches by default", async () => {
		// Search is the safe default: it reads the catalog rather than writing
		// into the workspace.
		await run(hoboTemplateTool, { query: "api resource" });
		expect(argv()).toEqual(["template", "search", "api", "resource"]);
	});

	it("uses the action it was given", async () => {
		await run(hoboTemplateTool, {
			query: "bindle.resource.api",
			action: "render",
		});
		expect(argv()).toEqual(["template", "render", "bindle.resource.api"]);
	});

	it("drops the query for a list, which takes none", async () => {
		// `template list ...` with a stray query would be read as a filter the
		// model never intended.
		await run(hoboTemplateTool, { query: "anything", action: "list" });
		expect(argv()).toEqual(["template", "list"]);
	});

	it.each([
		"search",
		"render",
		"explain",
		"compose",
		"apply",
	])("routes the %s action", async (action) => {
		await run(hoboTemplateTool, { query: "x", action });
		expect(argv()).toEqual(["template", action, "x"]);
	});

	it("trims and splits a multi-word query", async () => {
		await run(hoboTemplateTool, { query: "  two  words " });
		expect(argv()).toEqual(["template", "search", "two", "words"]);
	});
});

describe("hobo_dev", () => {
	it("asks for ephemeral ports rather than fixed ones", async () => {
		// A fixed port collides with whatever the user is already running, and
		// the tool's whole value is returning URLs that work.
		await run(hoboDevTool, {});
		expect(argv()).toEqual(["dev", "--port", "0", "--debug-port", "0"]);
	});

	it("runs in a named working directory", async () => {
		await run(hoboDevTool, { cwd: "/work/app" });
		expect(argv()).toEqual([
			"dev",
			"--cwd",
			"/work/app",
			"--port",
			"0",
			"--debug-port",
			"0",
		]);
	});

	it("ignores an empty cwd rather than passing a blank flag", async () => {
		// `--cwd ""` resolves to the process's directory, which is not what an
		// empty string was meant to say.
		await run(hoboDevTool, { cwd: "" });
		expect(argv()).not.toContain("--cwd");
	});

	it("works with no input object at all", async () => {
		await run(hoboDevTool, {});
		expect(argv()[0]).toBe("dev");
	});
});

describe("hobo_history", () => {
	it("lists everything when asked for nothing", async () => {
		await run(hoboHistoryTool, {});
		expect(argv()).toEqual(["history"]);
	});

	it("filters to failures", async () => {
		await run(hoboHistoryTool, { failedOnly: true });
		expect(argv()).toEqual(["history", "--failed"]);
	});

	it("does not pass the failure flag when it was explicitly false", async () => {
		// `--failed` is a switch, so emitting it for `false` would invert the
		// model's request.
		await run(hoboHistoryTool, { failedOnly: false });
		expect(argv()).toEqual(["history"]);
	});

	it("filters by author", async () => {
		await run(hoboHistoryTool, { author: "agent" });
		expect(argv()).toEqual(["history", "--author", "agent"]);
	});

	it("treats `any` as no author filter rather than a literal author", async () => {
		// There is no author called "any"; passing it would match nothing.
		await run(hoboHistoryTool, { author: "any" });
		expect(argv()).toEqual(["history"]);
	});

	it("puts the free-text query last, after the flags", async () => {
		// The CLI reads it positionally; a query before a flag would be consumed
		// as that flag's value.
		await run(hoboHistoryTool, { q: "deploy", failedOnly: true });
		expect(argv()).toEqual(["history", "--failed", "deploy"]);
	});

	it("combines every filter", async () => {
		await run(hoboHistoryTool, {
			q: "deploy",
			failedOnly: true,
			author: "human",
		});
		expect(argv()).toEqual([
			"history",
			"--failed",
			"--author",
			"human",
			"deploy",
		]);
	});

	it("ignores an empty query rather than passing a blank positional", async () => {
		await run(hoboHistoryTool, { q: "" });
		expect(argv()).toEqual(["history"]);
	});
});
