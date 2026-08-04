/**
 * Tools the local SLM may call, confined to the mediated sandbox.
 *
 * Without tools the local engine could only talk: it reported zero tool calls,
 * never touched a file, and could therefore never reach the promotion gate —
 * so "local by default" meant "local chatbot by default". These give it hands,
 * with the sandbox as the hard boundary: every path is resolved and rejected
 * if it escapes the sandbox root, so a confused 1.5B model cannot wander into
 * the canonical tree. Promotion remains the only way work leaves the sandbox
 * (ADR-0139).
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// public-contract: tool names the local engine advertises to the model.
export const LOCAL_TOOL_NAMES = [
	"list_files",
	"read_file",
	"write_file",
] as const;

export type LocalToolName = (typeof LOCAL_TOOL_NAMES)[number];

/** JSON-schema tool definitions in ollama's OpenAI-compatible shape. */
export const LOCAL_TOOL_SCHEMA = [
	{
		type: "function",
		function: {
			name: "list_files",
			description:
				"List files in the project, relative to the project root. Use before reading or writing to discover what exists.",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							"Directory relative to the project root. Defaults to the root.",
					},
				},
			},
		},
	},
	{
		type: "function",
		function: {
			name: "read_file",
			description: "Read a UTF-8 text file relative to the project root.",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "File path relative to the project root.",
					},
				},
				required: ["path"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "write_file",
			description:
				"Create or overwrite a UTF-8 text file relative to the project root. Parent directories are created.",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "File path relative to the project root.",
					},
					content: {
						type: "string",
						description: "Full new contents of the file.",
					},
				},
				required: ["path", "content"],
			},
		},
	},
] as const;

export interface ToolOutcome {
	readonly ok: boolean;
	/** Text handed back to the model. */
	readonly content: string;
	/** One-line summary for the transcript. */
	readonly summary: string;
}

/** Resolve inside the sandbox or refuse. The only security boundary here. */
export function resolveInSandbox(
	sandboxRoot: string,
	candidate: string,
): string | null {
	const root = resolve(sandboxRoot);
	const target = resolve(root, candidate ?? ".");
	const rel = relative(root, target);
	if (rel.startsWith("..") || resolve(root, rel) !== target) return null;
	return target;
}

const MAX_READ_BYTES = 64_000;
const MAX_LISTED = 200;

export function runLocalTool(
	sandboxRoot: string,
	name: string,
	args: Record<string, unknown>,
): ToolOutcome {
	const rawPath = typeof args.path === "string" ? args.path : "";
	const target = resolveInSandbox(sandboxRoot, rawPath);
	if (target === null) {
		return {
			ok: false,
			content: `refused: "${rawPath}" is outside the sandbox`,
			summary: `refused ${rawPath || "(empty)"} — outside sandbox`,
		};
	}
	const shown = rawPath || ".";

	if (name === "list_files") {
		if (!existsSync(target)) {
			return {
				ok: false,
				content: `no such directory: ${shown}`,
				summary: `missing ${shown}`,
			};
		}
		const walk = (dir: string, depth: number): string[] => {
			if (depth > 3) return [];
			const out: string[] = [];
			for (const entry of readdirSync(dir)) {
				if (entry === ".git" || entry === "node_modules") continue;
				const full = join(dir, entry);
				const rel = relative(resolve(sandboxRoot), full);
				if (statSync(full).isDirectory()) out.push(...walk(full, depth + 1));
				else out.push(rel);
				if (out.length > MAX_LISTED) break;
			}
			return out;
		};
		const files = statSync(target).isDirectory() ? walk(target, 0) : [shown];
		return {
			ok: true,
			content:
				files.length > 0 ? files.slice(0, MAX_LISTED).join("\n") : "(empty)",
			summary: `${files.length} file(s)`,
		};
	}

	if (name === "read_file") {
		if (!existsSync(target) || statSync(target).isDirectory()) {
			return {
				ok: false,
				content: `no such file: ${shown}`,
				summary: `missing ${shown}`,
			};
		}
		const text = readFileSync(target, "utf8").slice(0, MAX_READ_BYTES);
		return { ok: true, content: text, summary: `read ${shown}` };
	}

	if (name === "write_file") {
		const content = typeof args.content === "string" ? args.content : "";
		if (rawPath.length === 0) {
			return {
				ok: false,
				content: "refused: path is required",
				summary: "refused — no path",
			};
		}
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content, "utf8");
		return {
			ok: true,
			content: `wrote ${content.length} bytes to ${shown}`,
			summary: `wrote ${shown}`,
		};
	}

	return {
		ok: false,
		content: `unknown tool: ${name}`,
		summary: `unknown tool ${name}`,
	};
}
