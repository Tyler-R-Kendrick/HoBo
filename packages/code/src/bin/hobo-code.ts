#!/usr/bin/env node
/**
 * hobo-code — standalone coding harness CLI (ADR-0139).
 * Default verb: dispatch.
 *
 * Bare `hobo-code` (or `hobo-code chat`) on a TTY opens the **HoBo-owned
 * InteractiveShell** (Bo + chat + slash + tasks/status) — NOT stock Pi Agent
 * chrome. Pi remains an optional engine only:
 *   HOBO_CODE_TUI=pi  or  hobo-code --pi
 *
 * Piped stdout, --json, or any other verb stays one-shot.
 *
 * Note: the separate `hobo` binary is the control-plane shell (up/dev/plan),
 * not this coding harness.
 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatHoboCodeResult, runHoboCodeCli } from "../cli.js";
import { resolveShellEngine } from "../engine-resolve.js";
import {
	HOBO_AGENT_INSTRUCTIONS,
	HOBO_AGENT_MODEL,
} from "../harness-customization.js";
import { runInteractiveShell } from "../interactive-shell.js";
import { cleanupIsolation, createIsolationContext } from "../isolation.js";
import { startSessionControlServer } from "../session-control-server.js";
import type { ShellEngine } from "../shell-engine.js";
import { createDefaultShellHost } from "../shell-host.js";

const rawArgv = process.argv.slice(2);
const json = rawArgv.includes("--json");
const dense =
	rawArgv.includes("--dense") ||
	rawArgv.includes("-D") ||
	process.env.HOBO_CODE_DENSE === "1" ||
	process.env.HOBO_CODE_DENSE === "true";
const wantPiTui =
	rawArgv.includes("--pi") ||
	process.env.HOBO_CODE_TUI === "pi" ||
	process.env.HOBO_CODE_TUI === "pi-tui";
// Strip shell-only flags before CLI / chat detection
const argv = rawArgv.filter((a) => a !== "--pi");
const interactive =
	process.stdout.isTTY === true && process.stdin.isTTY === true;
const chatVerb = argv[0] === "chat";
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Legacy escape hatch: spawn stock Pi TUI with HoBo extension.
 * Not the product default — use only for engine experiments.
 */
function launchPiHarness(): Promise<number> {
	const piEntry = fileURLToPath(
		import.meta.resolve("@earendil-works/pi-coding-agent"),
	);
	const piBin = join(dirname(piEntry), "cli.js");
	const args = [
		piBin,
		"--no-extensions",
		"-e",
		join(pkgRoot, "pi", "extensions", "hobo.ts"),
		"--append-system-prompt",
		HOBO_AGENT_INSTRUCTIONS,
	];
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal === "SIGINT") resolve(130);
			else resolve(code ?? 1);
		});
	});
}

if (interactive && !json && (argv.length === 0 || chatVerb)) {
	if (wantPiTui) {
		process.stderr.write(
			"hobo-code: HOBO_CODE_TUI=pi / --pi — launching stock Pi TUI (escape hatch; not product default)\n",
		);
		process.exitCode = await launchPiHarness();
	} else {
		// Engine turns run in a mediated isolation sandbox (ADR-0139): the
		// canonical tree stays read-only; promotion is the audited mutation path.
		const hoboHome =
			process.env.HOBO_HOME && process.env.HOBO_HOME.length > 0
				? process.env.HOBO_HOME
				: join(process.env.HOME ?? tmpdir(), ".hobo");
		// Local first: a locally hosted SLM is the default engine so the shell
		// thinks without a cloud account; BYOK is the fallback, not the price
		// of entry. Turns run inside a mediated sandbox (ADR-0139).
		let engine: ShellEngine | null = null;
		const isolation = await createIsolationContext({
			projectRoot: process.cwd(),
			hoboHome,
		});
		const resolved = await resolveShellEngine({
			sandboxRoot: isolation.rootPath,
			runId: isolation.runId,
			modelSpec: HOBO_AGENT_MODEL,
			instructions: HOBO_AGENT_INSTRUCTIONS,
			env: process.env,
		});
		if (resolved.engine) {
			engine = resolved.engine;
		} else {
			await cleanupIsolation(isolation.runId, {
				hoboHome,
				ok: true,
				gates: ["engine:unavailable"],
			});
			process.stderr.write(
				`hobo-code: no completion engine — ${resolved.reason} (dispatch-only shell)\n`,
			);
		}

		// Bounded session for evidence capture: a TUI claim needs a real TTY
		// recording, and a recording needs the session to end through the normal
		// quit path (not a kill mid-frame). Opt-in only; unset = runs until quit.
		const maxMs = Number.parseInt(process.env.HOBO_CODE_SHELL_MAX_MS ?? "", 10);
		// Scripted keys let interactive paths (slash palette, focus cycling) be
		// captured as real recordings instead of being claimed without evidence.
		// `\n`/`\t`/`\e` escapes are decoded so shells can pass them literally.
		const scriptedKeys = process.env.HOBO_CODE_SHELL_KEYS
			? process.env.HOBO_CODE_SHELL_KEYS.replace(/\\n/g, "\n")
					.replace(/\\r/g, "\r")
					.replace(/\\t/g, "\t")
					.replace(/\\e/g, "\u001b")
			: undefined;
		const host = createDefaultShellHost({ dense, engine });
		process.exitCode = await runInteractiveShell({
			host,
			dense,
			reducedMotion:
				process.env.HOBO_CODE_REDUCED_MOTION === "1" ||
				process.env.HOBO_CODE_REDUCED_MOTION === "true",
			...(Number.isFinite(maxMs) && maxMs > 0 ? { maxMs } : {}),
			...(scriptedKeys !== undefined ? { scriptedKeys } : {}),
		});
		if (engine) {
			await engine.dispose();
			// Sandbox stays open so un-promoted edits survive the session.
			process.stdout.write(
				`sandbox kept: ${engine.sandboxRoot}\npromote (audited): hobo-code promote --run ${engine.runId}\n`,
			);
		}
	}
} else {
	const result = await runHoboCodeCli(argv, { json, dense });
	process.stdout.write(formatHoboCodeResult(result, { json, dense }));
	const action =
		result.data && typeof result.data === "object"
			? (
					result.data as {
						readonly terminalAction?: {
							readonly kind?: string;
							readonly sessionName?: string;
							readonly hoboHome?: string;
							readonly projectRoot?: string;
						};
					}
				).terminalAction
			: undefined;
	if (result.ok && action?.kind === "attach-session" && action.sessionName) {
		const args = process.env.TMUX
			? ["switch-client", "-t", action.sessionName]
			: ["attach-session", "-t", action.sessionName];
		process.exitCode = await new Promise<number>((resolve) => {
			const child = spawn("tmux", args, { stdio: "inherit" });
			child.once("error", () => resolve(1));
			child.once("exit", (code, signal) =>
				resolve(signal === "SIGINT" ? 130 : (code ?? 1)),
			);
		});
	} else if (
		result.ok &&
		action?.kind === "detach-session" &&
		process.env.TMUX
	) {
		process.exitCode = await new Promise<number>((resolve) => {
			const child = spawn("tmux", ["detach-client"], { stdio: "inherit" });
			child.once("error", () => resolve(1));
			child.once("exit", (code) => resolve(code ?? 1));
		});
	} else if (result.ok && action?.kind === "serve-sessions") {
		const hoboHome =
			action.hoboHome ??
			(process.env.HOBO_HOME && process.env.HOBO_HOME.length > 0
				? process.env.HOBO_HOME
				: join(process.env.HOME ?? tmpdir(), ".hobo"));
		const requestedPort = Number.parseInt(
			process.env.HOBO_CODE_SESSION_PORT ?? "0",
			10,
		);
		const server = await startSessionControlServer({
			hoboHome,
			projectRoot: action.projectRoot ?? process.cwd(),
			port:
				Number.isSafeInteger(requestedPort) && requestedPort > 0
					? requestedPort
					: 0,
		});
		process.stdout.write(
			`browser: ${server.url}\nremote: forward 127.0.0.1:${server.port} through a declared Station machine; the server never binds publicly\n`,
		);
		await new Promise<void>((resolve) => {
			process.once("SIGINT", resolve);
			process.once("SIGTERM", resolve);
		});
		await server.close();
		process.exitCode = 0;
	} else {
		process.exitCode = result.exitCode;
	}
}
