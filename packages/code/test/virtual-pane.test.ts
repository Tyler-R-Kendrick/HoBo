/**
 * The pane REPL is where the two isolation layers meet a user. These tests
 * drive it the way tmux does — bytes on stdin, bytes on stdout — because the
 * interesting behaviour is what it *answers*, and a pane that refused nothing
 * would look identical from the inside until it was too late.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
	runVirtualPane,
	VIRTUAL_PANE_COMMANDS,
	virtualPaneCommand,
} from "../src/virtual-pane.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function workspace(): { root: string; outside: string } {
	const parent = mkdtempSync(join(tmpdir(), "vpane-"));
	dirs.push(parent);
	const root = join(parent, "ws");
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src", "app.ts"), "export const answer = 42;\n");
	const outside = join(parent, "credentials.txt");
	writeFileSync(outside, "AKIA-SECRET\n");
	return { root, outside };
}

/** Feed the pane a script and collect everything it printed. */
async function drive(root: string, script: string): Promise<string> {
	const output = new PassThrough();
	let text = "";
	output.on("data", (c: Buffer) => {
		text += c.toString();
	});
	await runVirtualPane({
		agentId: "claude",
		workspace: root,
		input: Readable.from([script]),
		output,
	});
	return text;
}

describe("driving a virtual pane", () => {
	it("answers ordinary work against the real tree", async () => {
		const { root } = workspace();
		const out = await drive(root, "ls\ngrep -n answer src/app.ts\nexit\n");
		expect(out).toContain("src");
		expect(out).toContain("1:export const answer = 42;");
		expect(out).toContain("claude:~$");
	});

	it("says a refusal is policy, not a missing install", async () => {
		// Otherwise the obvious next move is to try to install the thing, which
		// is a worse failure than a clear no.
		const { root } = workspace();
		const out = await drive(root, "curl https://example.com\nrm -rf /\nexit\n");
		expect(out).toContain("allow-list, not a missing binary");
		expect(out.match(/allow-list/gu)).toHaveLength(2);
	});

	it("cannot reach outside the mounted workspace", async () => {
		const { root, outside } = workspace();
		const out = await drive(root, `cat ${outside}\ncat ../credentials.txt\nexit\n`);
		expect(out).not.toContain("AKIA");
		expect(readFileSync(outside, "utf8")).toContain("AKIA");
	});

	it("keeps writes off the checkout", async () => {
		const { root } = workspace();
		const out = await drive(root, "echo probe >> src/app.ts\ncat src/app.ts\nexit\n");
		expect(out).toContain("probe");
		expect(readFileSync(join(root, "src", "app.ts"), "utf8")).not.toContain("probe");
	});

	it("lists what exists here, and the banner counts it", async () => {
		const { root } = workspace();
		const out = await drive(root, "commands\nexit\n");
		expect(out).toContain(`${VIRTUAL_PANE_COMMANDS} commands available`);
		expect(out).toContain("grep");
		expect(out).not.toMatch(/\brm\b/u);
	});

	it("ends on stdin closing, not only on an explicit exit", async () => {
		const { root } = workspace();
		const out = await drive(root, "echo done\n");
		expect(out).toContain("done");
	});

	it("ignores blank input rather than running an empty command", async () => {
		const { root } = workspace();
		const out = await drive(root, "\n\n\nexit\n");
		expect(out).not.toContain("command not found");
	});
});

describe("the command tmux is given", () => {
	it("names the pane and its workspace, quoted", () => {
		const cmd = virtualPaneCommand("claude", "/ws/my repo/merged");
		expect(cmd).toContain("hobo-code vshell");
		expect(cmd).toContain("--name 'claude'");
		expect(cmd).toContain("'/ws/my repo/merged'");
	});

	it("survives a path containing a quote", () => {
		// A real rift path is a real directory name and may contain anything a
		// directory name may contain.
		expect(virtualPaneCommand("a", "/ws/o'brien")).toContain("'/ws/o'\\''brien'");
	});
});
