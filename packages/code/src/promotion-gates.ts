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

/**
 * Gate children run detached so their whole tree can be killed as a group,
 * which also means a terminal Ctrl-C no longer reaches them. We therefore own
 * their lifetime: kill any live group if this process is going away.
 */
const live = new Set<number>();
let reaperInstalled = false;

function reapAll(): void {
	for (const pid of live) {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			/* group already gone */
		}
	}
	live.clear();
}

function ensureReaper(): void {
	if (reaperInstalled) return;
	reaperInstalled = true;
	process.once("exit", reapAll);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.once(signal, () => {
			reapAll();
			process.exit(130);
		});
	}
}

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
): Promise<{ code: number | null; out: string; timedOut: boolean }> {
	return new Promise((resolve) => {
		// `detached` gives the child its own process group so a gate script that
		// spawns a grandchild (watcher, dev server) can be reaped as a group.
		ensureReaper();
		const child = spawn("pnpm", ["run", script], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		});
		if (child.pid) live.add(child.pid);
		let out = "";
		let settled = false;
		let timedOut = false;
		const collect = (c: string) => {
			if (out.length < 8000) out += c;
		};
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);

		// Settle on `exit`, never on `close`: a grandchild inherits the stdio
		// pipes, so `close` may never fire and the timeout would be decorative.
		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (child.pid) live.delete(child.pid);
			// Releasing the pipes is what actually lets the process exit: a
			// grandchild inherits them, so resolving alone leaves the handles
			// ref'd and `hobo-code promote` prints its result then hangs.
			child.stdout?.destroy();
			child.stderr?.destroy();
			resolve({ code, out, timedOut });
		};
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				if (child.pid) process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
			// Guarantee settlement even if the group kill leaves nothing to wait on.
			finish(null);
		}, timeoutMs);
		timer.unref?.();

		child.on("error", () => finish(null));
		child.on("exit", (code) => finish(code));
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
		const { code, out, timedOut } = await runScript(
			gate.script,
			projectDir,
			timeoutMs,
		);
		const lastLine = out.trim().split("\n").slice(-1)[0] ?? "";
		results.push({
			name: gate.name,
			pass: code === 0,
			// A timeout must not masquerade as a spawn failure — the operator
			// needs to know the gate ran and was cut off, not that it never started.
			detail: timedOut
				? `timed out after ${Math.round(timeoutMs / 1000)}s: ${lastLine}`.slice(
						0,
						200,
					)
				: code === 0
					? "ok"
					: `exit ${code ?? "spawn-failed"}: ${lastLine}`.slice(0, 200),
		});
	}
	return results;
}
