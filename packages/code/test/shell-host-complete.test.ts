/**
 * What the default shell host does with a prompt.
 *
 * `complete` is the shell's fallback when no engine is wired: it tries to
 * recognise a workspace action first, and otherwise hands the prompt to the
 * CLI as a dispatch. Both halves matter, and the second is where the honesty
 * lives.
 *
 * **A recorded task is not a completed one.** With no engine, "build me a todo
 * app" cannot be acted on — it becomes a compute task for a worker to pick up.
 * The reply says exactly that, in those words, because a shell that answered
 * "Recorded compute task task-abc" and stopped would read as a job done. The
 * source calls this "honest dispatch-only mode" and the reply is the whole of
 * that honesty: it names the task, says nothing acted on the prompt, and points
 * at `/about` for why.
 *
 * **It offers the one-shot equivalent.** The same prompt as a single CLI
 * invocation — so a user who wanted a script rather than a session can leave
 * with one, and so the shell is never the only way to do the thing.
 *
 * **A create reply names what it wrote and does not overstate it.** Files, the
 * directory, the trainable holes that are deliberately skeletons rather than
 * invented logic, and the sentence that says what to do next.
 *
 * The workspace half is driven against a temp workspace root, so `create`
 * really writes files; the dispatch half against a temp `HOBO_HOME`, so the
 * task is really recorded.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultShellHost } from "../src/shell-host.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

/** A host with its own workspace and its own station, and no engine. */
function host(overrides: Record<string, unknown> = {}) {
	const cwd = scratch("hobo-shell-host-cwd-");
	const hoboHome = scratch("hobo-shell-host-home-");
	return {
		cwd,
		hoboHome,
		shell: createDefaultShellHost({
			cwd,
			hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
			...overrides,
		}),
	};
}

describe("dispatch-only mode", () => {
	it("records the prompt as a compute task", async () => {
		const reply = await host().shell.complete("refactor the auth module");
		expect(reply).toMatch(/Recorded compute task/u);
	});

	it("says nothing acted on the prompt", async () => {
		// The sentence the whole reply exists for. Without it, "Recorded
		// compute task task-abc" reads as a job done.
		const reply = await host().shell.complete("refactor the auth module");
		expect(reply).toMatch(/nothing acted on your prompt/u);
	});

	it("says the task is stored for a worker to pick up", async () => {
		const reply = await host().shell.complete("refactor the auth module");
		expect(reply).toMatch(/stored as a dispatch task/u);
	});

	it("points at /about for the explanation", async () => {
		// The reply is three lines; the reasoning behind them lives somewhere
		// a reader can go.
		expect(await host().shell.complete("refactor auth")).toContain("/about");
	});

	it("names the task id it recorded", async () => {
		// A task nobody can find again is the same as no task.
		expect(await host().shell.complete("refactor auth")).toMatch(/task-\w+/u);
	});

	it("reports the status the task landed in", async () => {
		expect(await host().shell.complete("refactor auth")).toMatch(
			/status: \w+/u,
		);
	});

	it("offers the one-shot equivalent", async () => {
		// So a user who wanted a script rather than a session can leave with
		// one, and the shell is never the only way to do the thing.
		expect(await host().shell.complete("refactor auth")).toContain(
			"One-shot equivalent",
		);
	});

	it("quotes the prompt in the one-shot command", async () => {
		expect(await host().shell.complete("refactor auth")).toContain(
			'hobo-code "refactor auth"',
		);
	});

	it("shortens a long prompt in the one-shot line", async () => {
		// The hint is a command to copy, not a transcript; a 400-character
		// prompt pasted back would wrap over the reply it belongs to.
		const long = "refactor ".repeat(40).trim();
		const reply = await host().shell.complete(long);
		const line = reply.split("\n").find((row) => row.includes("One-shot"));
		expect((line ?? "").length).toBeLessThan(120);
	});

	it("escapes a quote inside the prompt", async () => {
		// The hint has to survive being pasted back into a shell. An unescaped
		// quote would end the argument early and run something else.
		const reply = await host().shell.complete('add a "done" flag');
		expect(reply).toContain('\\"done\\"');
	});

	it("marks a truncated prompt with an ellipsis", async () => {
		const reply = await host().shell.complete("refactor ".repeat(40).trim());
		expect(reply).toContain("…");
	});
});

describe("creating from a prompt", () => {
	it("recognises a request for an example", async () => {
		const { shell } = host();
		const reply = await shell.complete("create a hello-world app");
		expect(reply).toMatch(/Created/u);
	});

	it("does not fall through to dispatch when it created something", async () => {
		// The workspace action is tried first precisely so a create does not
		// also become a queued task nobody will ever run.
		const reply = await host().shell.complete("create a hello-world app");
		expect(reply).not.toMatch(/Recorded compute task/u);
	});

	it("names the directory it wrote into", async () => {
		const { shell, cwd } = host();
		expect(await shell.complete("create a hello-world app")).toContain(cwd);
	});

	it("really writes the files", async () => {
		// The reply claims a directory; the directory has to exist.
		const { shell, cwd } = host();
		await shell.complete("create a hello-world app");
		expect(existsSync(join(cwd, "hello-world"))).toBe(true);
	});

	it("lists some of what it wrote", async () => {
		expect(await host().shell.complete("create a hello-world app")).toMatch(
			/Wrote /u,
		);
	});

	it("says what to do next", async () => {
		// A created app with no next step is a directory the user has to guess
		// about.
		expect(await host().shell.complete("create a hello-world app")).toContain(
			"run it",
		);
	});

	it("does not claim to have run anything", async () => {
		const reply = await host().shell.complete("create a hello-world app");
		expect(reply).not.toMatch(/listening|serving|http:\/\//u);
	});
});

describe("prompts that are not workspace actions", () => {
	it("treats a test-shaped prompt as a dispatch", async () => {
		// "test" words deliberately do not trigger a run, because running an
		// app is not what someone asking about tests wants.
		expect(await host().shell.complete("write tests for the parser")).toMatch(
			/Recorded compute task/u,
		);
	});

	it("treats an ordinary question as a dispatch", async () => {
		expect(await host().shell.complete("what does this repo do")).toMatch(
			/Recorded compute task/u,
		);
	});

	it("handles an empty prompt without failing", async () => {
		expect(typeof (await host().shell.complete(""))).toBe("string");
	});

	it("handles a whitespace-only prompt", async () => {
		expect(typeof (await host().shell.complete("   "))).toBe("string");
	});
});

describe("what the host reports about itself", () => {
	it("has no engine label without an engine", async () => {
		// Dispatch-only mode is stated, not implied by an absent field.
		expect(host().shell.engineLabel).toBeUndefined();
	});

	it("takes an engine label when one is wired", () => {
		const { shell } = host({
			engine: {
				id: "pi",
				modelLabel: "local/qwen",
				sandboxRoot: "/tmp/sandbox",
				runId: "run-1",
				turn: async () => ({ text: "" }),
				abort: async () => {},
				dispose: async () => {},
				usage: () => ({}),
			},
		});
		expect(shell.engineLabel).toContain("pi");
	});

	it("names the model in the engine label", () => {
		const { shell } = host({
			engine: {
				id: "pi",
				modelLabel: "local/qwen",
				sandboxRoot: "/tmp/sandbox",
				runId: "run-1",
				turn: async () => ({ text: "" }),
				abort: async () => {},
				dispose: async () => {},
				usage: () => ({}),
			},
		});
		expect(shell.engineLabel).toContain("local/qwen");
	});

	it("explains the sandbox in its about lines", () => {
		// The promise the shell makes about the canonical tree, written where
		// a user can read it rather than assumed.
		const { shell } = host({
			engine: {
				id: "pi",
				modelLabel: "local/qwen",
				sandboxRoot: "/tmp/sandbox",
				runId: "run-1",
				turn: async () => ({ text: "" }),
				abort: async () => {},
				dispose: async () => {},
				usage: () => ({}),
			},
		});
		expect((shell.aboutLines ?? []).join("\n")).toContain("canonical tree");
	});

	it("says promotion is gated", () => {
		const { shell } = host({
			engine: {
				id: "pi",
				modelLabel: "local/qwen",
				sandboxRoot: "/tmp/sandbox",
				runId: "run-1",
				turn: async () => ({ text: "" }),
				abort: async () => {},
				dispose: async () => {},
				usage: () => ({}),
			},
		});
		expect((shell.aboutLines ?? []).join("\n")).toMatch(/gated/u);
	});
});
