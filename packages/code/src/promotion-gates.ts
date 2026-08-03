/**
 * Real promotion gates.
 *
 * These used to be hardcoded `pass: true` literals, so "squash-only, gated,
 * audited" was decoration over nothing. Each gate now actually runs the
 * repo's own check and reports what happened — including "could not run",
 * which fails closed rather than silently passing.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PromotionGate } from "./sandbox-promote.js";

/** The checks a promotion must satisfy, mapped to this repo's scripts. */
export const PROJECT_GATES: readonly { name: string; script: string }[] = [
	{ name: "architecture:guard", script: "architecture:guard" },
	{ name: "standards:check", script: "standards:check" },
	{ name: "agent:check", script: "check:relevant" },
	{ name: "docs:freshness", script: "docs:freshness" },
];

function runScript(
	script: string,
	cwd: string,
	timeoutMs: number,
): Promise<{ code: number | null; out: string }> {
	return new Promise((resolve) => {
		const child = spawn("pnpm", ["run", script], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let out = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		const collect = (c: string) => {
			if (out.length < 8000) out += c;
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
		child.on("error", () => {
			clearTimeout(timer);
			resolve({ code: null, out });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, out });
		});
	});
}

/**
 * Run each gate in the target project. A project without a package.json (or
 * without the script) reports the gate as not-run, which `runPromotionGates`
 * treats as a failure — promotion fails closed.
 */
export async function runProjectGates(
	projectDir: string,
	options: { readonly timeoutMs?: number } = {},
): Promise<PromotionGate[]> {
	const timeoutMs = options.timeoutMs ?? 300_000;
	if (!existsSync(join(projectDir, "package.json"))) {
		return PROJECT_GATES.map((g) => ({
			name: g.name,
			pass: false,
			detail: "no package.json in target project — cannot verify",
		}));
	}
	const results: PromotionGate[] = [];
	for (const gate of PROJECT_GATES) {
		const { code, out } = await runScript(gate.script, projectDir, timeoutMs);
		results.push({
			name: gate.name,
			pass: code === 0,
			detail:
				code === 0
					? "ok"
					: `exit ${code ?? "spawn-failed"}: ${out.trim().split("\n").slice(-1)[0] ?? ""}`.slice(
							0,
							200,
						),
		});
	}
	return results;
}
