import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JsonObject } from "../../../../src/json.js";

import { createLocalSessionControl } from "../../../../src/local-session-control.ts";
import type { MuxRunner } from "../../../../src/mux.ts";
import { startSessionControlServer } from "../../../../src/session-control-server.ts";
import type { CommandResult, OptimizexpWorld } from "./world.ts";

const ROOT = process.cwd();
const PACKAGE = path.join(ROOT, "packages/code");
const BIN = "src/bin/hobo-code.ts";
const FEATURE = path.join(PACKAGE, ".optimizexp/features/hobo-code-herdr-mux");

function temporary(world: OptimizexpWorld, prefix: string): string {
	const value = mkdtempSync(path.join(tmpdir(), prefix));
	world.temporaryPaths.push(value);
	return value;
}

function run(
	command: string,
	args: readonly string[],
	options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: Buffer } = {},
): CommandResult {
	const result = spawnSync(command, [...args], {
		cwd: options.cwd ?? ROOT,
		env: options.env ?? process.env,
		encoding: "utf8",
		input: options.input,
		timeout: 60_000,
		maxBuffer: 8 * 1024 * 1024,
	});
	return {
		status: result.status,
		stdout: result.stdout?.toString() ?? "",
		stderr: `${result.stderr?.toString() ?? ""}${result.error ? `\n${result.error.message}` : ""}`,
	};
}

function requireSuccess(result: CommandResult, label: string): void {
	if (result.status !== 0) {
		throw new Error(
			`${label} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
		);
	}
}

export function runCurrentCli(
	world: OptimizexpWorld,
	args: readonly string[],
): void {
	const home = temporary(world, "oxp-hobo-code-home-");
	world.command = run("node", ["--import", "tsx", BIN, ...args], {
		cwd: PACKAGE,
		env: { ...process.env, HOBO_HOME: home },
	});
}

export function assertCurrentSessionHelp(world: OptimizexpWorld): void {
	const result = world.command;
	if (!result) throw new Error("session help was not run");
	requireSuccess(result, "current session help");
	for (const term of [
		"resident tmux agent sessions",
		"tab",
		"pane",
		"agent-start",
		"checkpoint",
		"commit | push | pr | stack | merge",
		"session serve",
	]) {
		if (!result.stdout.includes(term))
			throw new Error(`current session help does not expose ${term}`);
	}
}

export function assertDetachHelp(world: OptimizexpWorld): void {
	const output = world.command?.stdout ?? "";
	if (
		!/attach \| switch \| detach/.test(output) ||
		!/detach\/reattach/.test(output)
	)
		throw new Error("session help does not explain detach and reattach");
}

export function assertActionableMissingSession(world: OptimizexpWorld): void {
	const result = world.command;
	if (!result || result.status === 0)
		throw new Error("missing session unexpectedly succeeded");
	const output = `${result.stdout}\n${result.stderr}`;
	if (!/session missing-session does not exist/.test(output))
		throw new Error(`missing-session error is unclear: ${output}`);
	if (!/session --help/.test(output) || !/session list/.test(output))
		throw new Error(`missing-session error has no recovery action: ${output}`);
}

function git(cwd: string, args: readonly string[]): void {
	const result = run("git", args, { cwd });
	requireSuccess(result, `git ${args.join(" ")}`);
}

function repository(world: OptimizexpWorld): string {
	const root = temporary(world, "oxp-hobo-code-project-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "optimizexp@example.com"]);
	git(root, ["config", "user.name", "OptimizeXP"]);
	writeFileSync(path.join(root, "README.md"), "browser acceptance\n");
	git(root, ["add", "README.md"]);
	git(root, ["commit", "-qm", "base"]);
	return root;
}

function fakeTmux(commands: string[]): MuxRunner {
	let pane = 0;
	let exists = false;
	let activePane = "";
	const paneCommands = new Map<string, string>();
	return {
		async run(args) {
			commands.push(args.join(" "));
			if (args[0] === "has-session")
				return { code: exists ? 0 : 1, stdout: "" };
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				exists = true;
				const id = `%${++pane}`;
				activePane = id;
				paneCommands.set(id, args.at(-1) ?? "");
				return { code: 0, stdout: `${id}\n` };
			}
			if (args[0] === "select-pane") {
				activePane = args[args.indexOf("-t") + 1] ?? activePane;
				return { code: 0, stdout: "" };
			}
			if (args[0] === "list-panes")
				return {
					code: 0,
					stdout: [...paneCommands]
						.map(([id, command], index) => {
							const nested = paneCommands.size > 3;
							const left = nested && index > 1 ? "90" : "0";
							const top = nested && index === 3 ? "20" : "0";
							const width = nested
								? index === 0
									? "120"
									: index === 1
										? "90"
										: "30"
								: "120";
							const height = nested && index > 1 ? "20" : "40";
							return [
								id,
								id === activePane ? "1" : "0",
								"1",
								left,
								top,
								width,
								height,
								"120",
								"40",
								command,
								"",
								"",
							].join("\t");
						})
						.join("\n"),
				};
			if (args[0] === "capture-pane")
				return { code: 0, stdout: "browser journey output\n" };
			if (args[0] === "kill-session") exists = false;
			return { code: 0, stdout: "" };
		},
	};
}

export async function startBrowserJourney(
	world: OptimizexpWorld,
): Promise<void> {
	const hoboHome = temporary(world, "oxp-hobo-code-browser-home-");
	const projectRoot = repository(world);
	const commands: string[] = [];
	const control = createLocalSessionControl({
		hoboHome,
		tmux: fakeTmux(commands),
	});
	const server = await startSessionControlServer({
		hoboHome,
		projectRoot,
		token: "optimizexp-browser-token",
		control,
	});
	if (!server.url.startsWith("http://127.0.0.1:"))
		throw new Error(`browser server is not loopback-only: ${server.url}`);
	const unauthorized = await fetch(
		`http://127.0.0.1:${server.port}/code/sessions`,
	);
	if (unauthorized.status !== 401)
		throw new Error("browser API accepted a request without its bearer token");
	world.browser = {
		server,
		headers: {
			authorization: `Bearer ${server.token}`,
			"content-type": "application/json",
		},
		html: "",
		commands,
	};
}

export async function openBrowserJourney(
	world: OptimizexpWorld,
): Promise<void> {
	if (!world.browser) throw new Error("browser server was not started");
	const response = await fetch(world.browser.server.url);
	if (response.status !== 200)
		throw new Error(`authenticated browser returned ${response.status}`);
	world.browser.html = await response.text();
}

async function browserCommand(
	world: OptimizexpWorld,
	sessionId: string,
	revision: string,
	name: string,
	value: JsonObject,
): Promise<JsonObject> {
	const browser = world.browser;
	if (!browser) throw new Error("browser server was not started");
	const response = await fetch(
		`http://127.0.0.1:${browser.server.port}/code/commands`,
		{
			method: "POST",
			headers: browser.headers,
			body: JSON.stringify({
				command: {
					schemaVersion: "hobo.code.session-command/v1",
					commandId: randomUUID(),
					actorId: "browser",
					sessionId,
					expectedRevision: revision,
					[name]: value,
				},
			}),
		},
	);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const body = (await response.json()) as JsonObject;
	if (!response.ok) throw new Error(String(body.error ?? response.statusText));
	return body;
}

export async function exerciseBrowserControls(
	world: OptimizexpWorld,
): Promise<void> {
	const browser = world.browser;
	if (!browser) throw new Error("browser page was not opened");
	for (const marker of [
		'id="create"',
		"'reattach'",
		"'detach'",
		"'stop-session'",
		"'focus-pane'",
		"'prompt-pane'",
	]) {
		if (!browser.html.includes(marker))
			throw new Error(`browser page is missing ${marker}`);
	}

	const sessionId = `browser-${randomUUID().slice(0, 8)}`;
	let snapshot = await browserCommand(world, sessionId, "0", "createSession", {
		name: "Browser acceptance",
		projectRoot:
			world.temporaryPaths.find((value) =>
				value.includes("oxp-hobo-code-project-"),
			) ?? "",
		branch: `code/${sessionId}`,
		clientId: "browser",
	});
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const session = snapshot.session as { projectRoot?: string } | undefined;
	if (!session?.projectRoot)
		throw new Error("browser create did not return a session");
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const panes = snapshot.panes as { id: string }[];
	const paneId = panes[0]?.id;
	if (!paneId) throw new Error("browser create did not return a pane");
	const next = async (name: string, value: JsonObject) => {
		snapshot = await browserCommand(
			world,
			sessionId,
			String(snapshot.revision),
			name,
			value,
		);
	};
	await next("focusPane", { paneId });
	await next("sendInput", { paneId, input: "continue the review\n" });
	await next("detachSession", { clientId: "browser" });
	if (
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		((snapshot.attachedClientIds as string[] | undefined) ?? []).includes(
			"browser",
		)
	)
		throw new Error("browser detach did not detach the client");
	await next("reattachSession", { clientId: "browser" });
	if (
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		!((snapshot.attachedClientIds as string[] | undefined) ?? []).includes(
			"browser",
		)
	)
		throw new Error("browser reattach did not restore the client");
	const listed = await fetch(
		`http://127.0.0.1:${browser.server.port}/code/sessions`,
		{ headers: browser.headers },
	);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const sessions = (await listed.json()) as { session?: { id?: string } }[];
	if (!sessions.some((item) => item.session?.id === sessionId))
		throw new Error("browser list did not return the created session");
	await next("stopSession", { removeWorktree: false });
	if (!browser.commands.some((command) => command.startsWith("select-pane")))
		throw new Error("browser focus did not reach tmux");
	if (!browser.commands.some((command) => command.startsWith("send-keys")))
		throw new Error("browser prompt did not reach tmux");
}

export function assertStationExplanation(world: OptimizexpWorld): void {
	const html = world.browser?.html ?? "";
	if (
		!html.includes(
			"forward this loopback port through a declared Station machine",
		)
	)
		throw new Error("browser page does not explain Station forwarding");
	if (!html.includes("never binds publicly"))
		throw new Error("browser page does not explain its public-bind refusal");
}

export function assertScenarioEvidenceExists(world: OptimizexpWorld): void {
	const slug = world.scenarioName
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-|-$/gu, "");
	const evidence = path.join(FEATURE, "evidence", slug);
	if (
		!existsSync(evidence) ||
		!existsSync(path.join(evidence, "manifest.json"))
	)
		throw new Error(`scenario evidence is missing: ${evidence}`);
}

export async function cleanup(world: OptimizexpWorld): Promise<void> {
	await world.browser?.server.close();
	world.browser = null;
	for (const value of world.temporaryPaths.reverse())
		rmSync(value, { recursive: true, force: true });
	world.temporaryPaths = [];
}
