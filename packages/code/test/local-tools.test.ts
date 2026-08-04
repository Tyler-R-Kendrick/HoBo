/**
 * Sandbox confinement and adaptive model choice.
 *
 * The local engine was a chatbot: zero tool calls, so it could never edit a
 * file or reach the promotion gate. Giving a 26M model hands makes the
 * sandbox boundary load-bearing, so it is tested directly.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveInSandbox, runLocalTool } from "../src/local-tools.js";
import { parseBridgeLine } from "../src/needle-tools.js";
import { parseParameterSize, selectChatModel } from "../src/ollama-engine.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function sandbox(): string {
	const d = mkdtempSync(join(tmpdir(), "local-tools-"));
	dirs.push(d);
	writeFileSync(join(d, "a.txt"), "alpha\n");
	return d;
}

describe("sandbox confinement", () => {
	it("refuses traversal instead of touching the real tree", () => {
		const root = sandbox();
		expect(resolveInSandbox(root, "../../etc/passwd")).toBeNull();
		expect(resolveInSandbox(root, "/etc/passwd")).toBeNull();
		expect(resolveInSandbox(root, "ok/nested.txt")).not.toBeNull();

		const escaped = runLocalTool(root, "read_file", {
			path: "../../etc/passwd",
		});
		expect(escaped.ok).toBe(false);
		expect(escaped.content).toMatch(/outside the sandbox/);

		const written = runLocalTool(root, "write_file", {
			path: "../escape.txt",
			content: "nope",
		});
		expect(written.ok).toBe(false);
		expect(existsSync(join(root, "..", "escape.txt"))).toBe(false);
	});

	it("reads, writes and lists within the sandbox", () => {
		const root = sandbox();
		expect(runLocalTool(root, "read_file", { path: "a.txt" }).content).toBe(
			"alpha\n",
		);
		expect(runLocalTool(root, "list_files", { path: "." }).content).toContain(
			"a.txt",
		);
		const w = runLocalTool(root, "write_file", {
			path: "deep/new.ts",
			content: "export const x = 1;\n",
		});
		expect(w.ok).toBe(true);
		expect(readFileSync(join(root, "deep/new.ts"), "utf8")).toContain("x = 1");
	});

	it("reports unknown tools rather than silently doing nothing", () => {
		const root = sandbox();
		const r = runLocalTool(root, "rm_rf", { path: "." });
		expect(r.ok).toBe(false);
		expect(r.content).toMatch(/unknown tool/);
	});
});

describe("adaptive model choice", () => {
	it("parses reported parameter sizes", () => {
		expect(parseParameterSize("1.5B")).toBe(1.5e9);
		expect(parseParameterSize("137M")).toBe(1.37e8);
		expect(parseParameterSize("weird")).toBeNull();
		expect(parseParameterSize(undefined)).toBeNull();
	});

	it("defaults to the smallest pulled chat model, for responsiveness", () => {
		const details = [
			{ name: "qwen2.5-coder:1.5b", parameters: 1.5e9, family: "qwen2" },
			{ name: "qwen2.5:0.5b", parameters: 5e8, family: "qwen2" },
			{
				name: "nomic-embed-text:latest",
				parameters: 1.37e8,
				family: "nomic-bert",
			},
		];
		// Smallest *chat* model wins; the embedder is never a chat engine even
		// though it is the smallest thing on the box.
		expect(
			selectChatModel(
				details.map((d) => d.name),
				undefined,
				details,
			),
		).toBe("qwen2.5:0.5b");
	});

	it("still honours an explicit choice over the fast default", () => {
		const details = [
			{ name: "qwen2.5-coder:1.5b", parameters: 1.5e9, family: "qwen2" },
			{ name: "qwen2.5:0.5b", parameters: 5e8, family: "qwen2" },
		];
		expect(
			selectChatModel(
				details.map((d) => d.name),
				"qwen2.5-coder:1.5b",
				details,
			),
		).toBe("qwen2.5-coder:1.5b");
	});
});

describe("needle bridge protocol", () => {
	it("parses ready, calls and errors; never throws on junk", () => {
		expect(parseBridgeLine('{"ok":true,"ready":true}')).toEqual({
			ready: true,
		});
		expect(
			parseBridgeLine(
				'{"ok":true,"calls":[{"name":"read_file","arguments":{"path":"a"}}]}',
			),
		).toEqual({ calls: [{ name: "read_file", arguments: { path: "a" } }] });
		expect(parseBridgeLine('{"ok":false,"error":"boom"}')).toEqual({
			error: "boom",
		});
		expect(parseBridgeLine("not json")).toBeNull();
		expect(parseBridgeLine("")).toBeNull();
		// Malformed call entries are dropped, not crashed on.
		expect(parseBridgeLine('{"ok":true,"calls":[1,{"nope":true}]}')).toEqual({
			calls: [],
		});
	});
});
