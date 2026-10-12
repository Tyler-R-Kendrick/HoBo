/**
 * Launching a command under OpenSesame, so it holds `osr_` surrogates and never
 * a token: `opensesame dev --agent --schema <file> run -- <cmd...>` with the
 * `.env.schema` this adapter rendered from reference-only bindings.
 *
 * `buildLaunch` is pure: it checks what must hold before anything starts (this
 * process is not itself such a child, this Node can send `fetch` through
 * `HTTPS_PROXY`, the env-spec bridge named by OPENSESAME_ENV_PARSE exists) and
 * returns the argv and environment. `runProxied` writes the schema 0600 in a
 * directory of its own, runs it, passes SIGTERM and SIGHUP on to OpenSesame
 * (which revokes the run and stops the child; a parent that simply died would
 * leave the child running), reads how it ended, and always removes the schema.
 *
 * The store passphrase is never read or set here: OpenSesame takes it from the
 * terminal or from OPENSESAME_STORE_PASSWORD in the caller's environment, and
 * strips it from the child itself.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProxiedRunOutcome } from "./_generated/adapter_opensesame_pb.js";
import type { ParsedCredentialBinding } from "./binding.js";
import { createCapture } from "./capture.js";
import { childEnvOf } from "./child-env.js";
import { OpenSesameAdapterError } from "./errors.js";
import { type BinProbe, trustedOpenSesame } from "./opensesame-bin.js";
import { parseOutcome } from "./outcome.js";
import { CHILD_MARKER } from "./run-markers.js";
import { renderEnvSchema } from "./schema.js";

const CAPTURE_LIMIT = 64 * 1024;

export type Launch = Readonly<{
	command: string;
	args: readonly string[];
	env: NodeJS.ProcessEnv;
}>;

export type LaunchInput = Readonly<{
	/** The `opensesame` executable. */
	bin: string;
	/** The generated `.env.schema`. */
	schemaPath: string;
	/** The command to run under it. */
	argv: readonly string[];
	/** The credentials the run brokers: the variables a surrogate goes in, and the providers whose real tokens must not be in `env`. */
	bindings: readonly ParsedCredentialBinding[];
	/** The caller's environment. Only the allowlist in `child-env.ts` and `passEnv` are passed on. */
	env: NodeJS.ProcessEnv;
	/** Variable names, beyond the allowlist, to pass on as they are (the store passphrase, OPENSESAME_STORE_DIR, ...). */
	passEnv?: readonly string[] | undefined;
	/** The platform whose variables are kept. Defaults to this process's. */
	platform?: NodeJS.Platform | undefined;
	/** Node's version, for the `fetch` proxy check. Defaults to this process's. */
	nodeVersion?: string | undefined;
	/** Whether a path exists. Defaults to the filesystem. */
	exists?: ((path: string) => boolean) | undefined;
}>;

function hasNul(text: string): boolean {
	return text.includes("\0");
}

/** `NODE_USE_ENV_PROXY` exists from v22.21.0 and v24.0.0. */
function nodeProxiesFetch(version: string): boolean {
	const [major = 0, minor = 0] = version.split(".").map(Number);
	return major >= 24 || (major === 22 && minor >= 21);
}

export function buildLaunch(input: LaunchInput): Launch {
	if (input.env[CHILD_MARKER] === "1") {
		throw new OpenSesameAdapterError(
			"recursion_guard",
			"this process already runs under OpenSesame; it will not start another proxied run",
		);
	}
	if (input.argv.length === 0) {
		throw new OpenSesameAdapterError(
			"launch_invalid",
			"a proxied run needs a command",
		);
	}
	if ([input.bin, input.schemaPath, ...input.argv].some(hasNul)) {
		throw new OpenSesameAdapterError(
			"launch_invalid",
			"the command, the executable and the schema path cannot hold a NUL byte",
		);
	}
	if (!nodeProxiesFetch(input.nodeVersion ?? process.versions.node)) {
		throw new OpenSesameAdapterError(
			"node_proxy_unsupported",
			"this Node cannot send fetch through HTTPS_PROXY (NODE_USE_ENV_PROXY needs 22.21 or 24): without it fetch ignores HTTPS_PROXY and dials the provider directly with a surrogate only the proxy can redeem",
		);
	}
	const bridge = input.env.OPENSESAME_ENV_PARSE;
	if (bridge !== undefined && !(input.exists ?? existsSync)(bridge)) {
		throw new OpenSesameAdapterError(
			"bridge_missing",
			"OPENSESAME_ENV_PARSE names an env-spec bridge that does not exist",
		);
	}
	return Object.freeze({
		command: input.bin,
		args: Object.freeze([
			"dev",
			"--agent",
			"--schema",
			input.schemaPath,
			"run",
			"--",
			...input.argv,
		]),
		env: Object.freeze({
			...childEnvOf({
				env: input.env,
				passEnv: input.passEnv ?? [],
				bindings: input.bindings,
				platform: input.platform ?? process.platform,
			}),
			NODE_USE_ENV_PROXY: "1",
			[CHILD_MARKER]: "1",
		}),
	});
}

/** The part of a spawned process the run reads. A `ChildProcess` is one. */
export interface SpawnedProcess {
	readonly stderr: {
		on(event: "data", listener: (chunk: Buffer | string) => void): void;
	} | null;
	on(event: "error", listener: (error: Error) => void): void;
	on(
		event: "close",
		listener: (code: number | null, signal: NodeJS.Signals | null) => void,
	): void;
	kill(signal: NodeJS.Signals): boolean;
}

export type SpawnFn = (
	command: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv,
) => SpawnedProcess;

/** Where signals come from. `process` is one. */
export interface SignalSource {
	on(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
	off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
}

export interface StderrSink {
	write(chunk: string): void;
}

export type RunInput = Readonly<{
	bin: string;
	bindings: readonly ParsedCredentialBinding[];
	argv: readonly string[];
	env?: NodeJS.ProcessEnv;
	passEnv?: readonly string[] | undefined;
	platform?: NodeJS.Platform | undefined;
	spawn?: SpawnFn;
	signals?: SignalSource;
	stderr?: StderrSink;
	nodeVersion?: string | undefined;
	exists?: ((path: string) => boolean) | undefined;
	tmpRoot?: string | undefined;
	/** Runs `opensesame --version` for the identity check. Defaults to doing so. */
	probe?: BinProbe | undefined;
}>;

/** Stdin and stdout are the person's; stderr is read as well as shown. */
const nodeSpawn: SpawnFn = (command, args, env) =>
	spawn(command, [...args], { env, stdio: ["inherit", "inherit", "pipe"] });

const FORWARDED: readonly NodeJS.Signals[] = ["SIGTERM", "SIGHUP"];

function wait(
	child: SpawnedProcess,
	sink: StderrSink,
	signals: SignalSource,
): Promise<ProxiedRunOutcome> {
	return new Promise((resolve, reject) => {
		const capture = createCapture(CAPTURE_LIMIT);
		const forward = (signal: NodeJS.Signals) => {
			child.kill(signal);
		};
		for (const name of FORWARDED) signals.on(name, forward);
		const release = () => {
			for (const name of FORWARDED) signals.off(name, forward);
		};
		child.stderr?.on("data", (chunk) => {
			const text = String(chunk);
			sink.write(text);
			capture.push(text);
		});
		child.on("error", (error) => {
			release();
			reject(
				new OpenSesameAdapterError(
					"opensesame_bin_missing",
					`the opensesame executable could not be started (${"code" in error ? String(error.code) : "error"})`,
				),
			);
		});
		child.on("close", (code, signal) => {
			release();
			resolve(parseOutcome(code, signal, capture.text()));
		});
	});
}

/**
 * Run `argv` under OpenSesame with `bindings` and say how it ended. The command
 * is not started unless the launch is valid; the schema is gone when this returns.
 */
export async function runProxied(input: RunInput): Promise<ProxiedRunOutcome> {
	const env = input.env ?? process.env;
	const checks = {
		bin: input.bin,
		argv: input.argv,
		bindings: input.bindings,
		env,
		passEnv: input.passEnv,
		platform: input.platform,
		nodeVersion: input.nodeVersion,
		exists: input.exists,
	};
	// Refuse before anything is written: a launch that cannot happen leaves no schema.
	buildLaunch({ ...checks, schemaPath: "" });
	// Found, checked and identified before the passphrase can reach it.
	const bin = trustedOpenSesame({ bin: input.bin, env, probe: input.probe });
	const dir = await mkdtemp(
		join(input.tmpRoot ?? tmpdir(), "hobo-opensesame-"),
	);
	try {
		const schemaPath = join(dir, ".env.schema");
		const launch = buildLaunch({ ...checks, bin, schemaPath });
		await writeFile(schemaPath, renderEnvSchema(input.bindings), {
			mode: 0o600,
			flag: "wx",
		});
		const child = (input.spawn ?? nodeSpawn)(
			launch.command,
			launch.args,
			launch.env,
		);
		return await wait(
			child,
			input.stderr ?? process.stderr,
			input.signals ?? process,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
