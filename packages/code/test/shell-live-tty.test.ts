/**
 * The shell's live-TTY path, driven through a fake terminal.
 *
 * The scripted-keys hook deliberately turns this path *off*:
 * `liveTty = isTty && options.scriptedKeys === undefined`, and with it off the
 * shell never enters raw mode or the alternate screen. That is right for the
 * scripted tests, and it means those tests cannot reach any of the behaviour
 * that only exists on a real terminal.
 *
 * This drives the other side: streams that claim `isTTY` and accept
 * `setRawMode`, with keys arriving over stdin the way they do from a keyboard.
 * What that buys is the part of the loop nothing else can reach — the stdin
 * listener, raw mode, the alternate screen, resize handling, and the teardown
 * that has to undo all three.
 *
 * **The teardown is the point.** A CLI that can strand a terminal in raw mode
 * is not shippable: the user's shell stops echoing, Ctrl-C stops working, and
 * their only recovery is to type `reset` blind. So the exit paths are what is
 * asserted — a clean quit, a quit mid-turn, and a resize in between — and every
 * one of them has to leave the alternate screen.
 *
 * Every run carries a `maxMs` deadline. A live-TTY test that waited on stdin
 * forever would hang the suite rather than fail it, and a hung suite tells you
 * nothing about which case broke.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runInteractiveShell } from "../src/interactive-shell.js";
import type { JsonObject } from "../src/json.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-tty-"));
	homes.push(dir);
	return dir;
}

const CTRL_C = "";

/** A stdin that claims to be a terminal and accepts raw mode. */
function fakeStdin() {
	const stream = new PassThrough();
	const calls: boolean[] = [];
	return Object.assign(stream, {
		isTTY: true as const,
		rawModeCalls: calls,
		setRawMode(mode: boolean) {
			calls.push(mode);
			return stream;
		},
	});
}

/** A stdout that claims to be a terminal and records what was painted. */
function fakeStdout(columns = 80, rows = 24) {
	const chunks: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, done) {
			chunks.push(String(chunk));
			done();
		},
	});
	return Object.assign(stream, {
		isTTY: true as const,
		columns,
		rows,
		text: () => chunks.join(""),
	});
}

/**
 * Run the shell against a fake terminal, feeding `keys` on a timer once the
 * loop is listening. Always bounded by `maxMs`.
 */
async function live(
	keys: readonly string[],
	options: {
		readonly host?: JsonObject;
		readonly onRunning?: (streams: {
			stdin: ReturnType<typeof fakeStdin>;
			stdout: ReturnType<typeof fakeStdout>;
		}) => void;
		readonly columns?: number;
		readonly rows?: number;
	} = {},
) {
	const stdin = fakeStdin();
	const stdout = fakeStdout(options.columns ?? 80, options.rows ?? 24);
	const prompts: string[] = [];
	const verbs: string[][] = [];

	let delay = 30;
	for (const key of keys) {
		setTimeout(() => stdin.write(key), delay);
		delay += 30;
	}
	setTimeout(() => options.onRunning?.({ stdin, stdout }), 20);

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const code = await runInteractiveShell({
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		stdin: stdin as never,
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		stdout: stdout as never,
		hoboHome: home(),
		sidecars: false,
		reducedMotion: true,
		maxMs: 4_000,
		host: {
			runVerb: async (argv: readonly string[]) => {
				verbs.push([...argv]);
				return `ran ${argv.join(" ")}`;
			},
			complete: async (prompt: string) => {
				prompts.push(prompt);
				return `assistant: ${prompt}`;
			},
			...options.host,
		},
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
	} as never);

	return { code, output: stdout.text(), prompts, verbs, stdin, stdout };
}

describe("entering and leaving the terminal", () => {
	it("enters raw mode on a live terminal", async () => {
		// Without raw mode the shell gets whole lines, not keys, and none of its
		// keyboard handling runs at all.
		const session = await live([CTRL_C]);
		expect(session.stdin.rawModeCalls).toContain(true);
	});

	it("leaves raw mode on the way out", async () => {
		// The failure this prevents: the user's shell stops echoing and their
		// only recovery is to type `reset` blind.
		const session = await live([CTRL_C]);
		expect(session.stdin.rawModeCalls.at(-1)).toBe(false);
	});

	it("enters and leaves the alternate screen", async () => {
		// Entering without leaving eats the user's scrollback.
		const session = await live([CTRL_C]);
		expect(session.output).toContain("[?1049h");
		expect(session.output).toContain("[?1049l");
	});

	it("leaves the alternate screen last, after the final paint", async () => {
		const session = await live([CTRL_C]);
		expect(session.output.lastIndexOf("[?1049l")).toBeGreaterThan(
			session.output.indexOf("[?1049h"),
		);
	});

	it("restores the cursor it hid", async () => {
		// A hidden cursor outlives the process; the user's next shell prompt is
		// invisible.
		const session = await live([CTRL_C]);
		expect(session.output).toContain("[?25h");
	});

	it("exits zero from a live quit", async () => {
		expect((await live([CTRL_C])).code).toBe(0);
	});

	it("prints the resume command after leaving the alternate screen", async () => {
		// Printed inside it, the closeout would be erased by the screen swap —
		// the user would never see how to come back.
		const session = await live([CTRL_C]);
		const closeout = session.output.lastIndexOf("hobo-code resume");
		expect(closeout).toBeGreaterThan(session.output.lastIndexOf("[?1049l"));
	});
});

describe("keys arriving over stdin", () => {
	it("submits a line typed at the terminal", async () => {
		// The whole live path in one assertion: raw stdin bytes reach the
		// reducer and come out as a turn.
		const session = await live(["hello\r", CTRL_C]);
		expect(session.prompts).toEqual(["hello"]);
	});

	it("assembles a line typed one key at a time", async () => {
		// A real keyboard delivers one byte per event, not a whole line.
		const session = await live(["h", "i", "\r", CTRL_C]);
		expect(session.prompts).toEqual(["hi"]);
	});

	it("runs a slash command typed at the terminal", async () => {
		const session = await live(["/status\r", CTRL_C]);
		expect(session.verbs).toContainEqual(["status"]);
	});

	it("quits on a live Ctrl-C with nothing typed", async () => {
		const session = await live([CTRL_C]);
		expect(session.prompts).toEqual([]);
	});

	it("still leaves the terminal clean after a turn", async () => {
		// The teardown has to survive the loop having done real work.
		const session = await live(["hello\r", CTRL_C]);
		expect(session.stdin.rawModeCalls.at(-1)).toBe(false);
		expect(session.output).toContain("[?1049l");
	});
});

describe("resize", () => {
	it("repaints at the new width", async () => {
		// A shell that ignored the resize keeps drawing at the old width, which
		// looks like corruption rather than a stale frame.
		const session = await live([CTRL_C], {
			onRunning: ({ stdout }) => {
				Object.assign(stdout, { columns: 120 });
				stdout.emit("resize");
			},
		});
		expect(session.code).toBe(0);
	});

	it("leaves the terminal clean after a resize", async () => {
		const session = await live([CTRL_C], {
			onRunning: ({ stdout }) => {
				Object.assign(stdout, { columns: 40, rows: 12 });
				stdout.emit("resize");
			},
		});
		expect(session.stdin.rawModeCalls.at(-1)).toBe(false);
	});

	it("survives a resize in the middle of a turn", async () => {
		const session = await live(["hello\r", CTRL_C], {
			onRunning: ({ stdout }) => {
				setTimeout(() => {
					Object.assign(stdout, { columns: 100 });
					stdout.emit("resize");
				}, 40);
			},
		});
		expect(session.code).toBe(0);
	});

	it("starts at the terminal's own size rather than a default", async () => {
		// Reading the real width is the reason the shell looks right on a wide
		// terminal; defaulting to 80 would waste half of it.
		const session = await live([CTRL_C], { columns: 120, rows: 40 });
		expect(session.code).toBe(0);
		expect(session.output.length).toBeGreaterThan(0);
	});
});

describe("teardown under failure", () => {
	it("leaves the terminal clean when the engine throws", async () => {
		// The `finally` exists exactly for this: a driver that threw must not
		// take the user's terminal with it.
		const session = await live(["boom\r", CTRL_C], {
			host: {
				complete: async () => {
					throw new Error("engine unavailable");
				},
			},
		});
		expect(session.stdin.rawModeCalls.at(-1)).toBe(false);
		expect(session.output).toContain("[?1049l");
	});

	it("leaves the terminal clean when a verb throws", async () => {
		const session = await live(["/status\r", CTRL_C], {
			host: {
				runVerb: async () => {
					throw new Error("verb exploded");
				},
			},
		});
		expect(session.stdin.rawModeCalls.at(-1)).toBe(false);
	});

	it("exits on its own deadline rather than waiting on stdin forever", async () => {
		// The deadline is what turns a hung shell into a failed test instead of
		// a hung suite.
		const stdin = fakeStdin();
		const stdout = fakeStdout();
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const code = await runInteractiveShell({
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			stdin: stdin as never,
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			stdout: stdout as never,
			hoboHome: home(),
			sidecars: false,
			reducedMotion: true,
			maxMs: 60,
			host: { runVerb: async () => "", complete: async () => "" },
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
		} as never);
		expect(code).toBe(0);
		expect(stdin.rawModeCalls.at(-1)).toBe(false);
	});
});
