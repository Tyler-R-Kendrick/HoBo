import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fromJsonString } from "@bufbuild/protobuf";
import { parseRelativePath } from "@hobo/ci/execution";
import { type CheckConfig, CheckConfigSchema } from "./_generated/checks_pb.js";

/** Immutable refinement of the protobuf configuration, parsed once at the edge. */
export type DaggerCheckConfig = Readonly<
	Omit<CheckConfig, "filters" | "skip">
> & {
	readonly filters: readonly string[];
	readonly skip: readonly string[];
};

/** Native 1.x checks deliberately accept only operator-owned engines. */
export function parseDaggerCheckConfig(json: string): DaggerCheckConfig {
	const config = fromJsonString(CheckConfigSchema, json);
	config.engine ||= "local";
	config.workspace ||= ".";
	if (!/^1\.[0-9]+\.[0-9]+(?:-beta\.[0-9]+)?$/.test(config.cliVersion))
		throw new Error("cliVersion must pin a Dagger 1.x CLI version");
	if (
		config.engine.includes("\0") ||
		(config.engine !== "local" &&
			!/^(?:image|container|unix|tcp|tls|ssh|kube-pod):\/\/\S+$/.test(
				config.engine,
			))
	)
		throw new Error("engine must be local or an explicit non-Cloud engine URI");
	if (config.workspace !== ".") parseRelativePath(config.workspace);
	for (const filter of [...config.filters, ...config.skip]) {
		if (!/^[^-\s][^\s]*$/.test(filter) || filter.includes("\0"))
			throw new Error("check selectors must be nonempty links, not flags");
	}
	if (config.parallel > 256)
		throw new Error("parallel must be between 0 and 256");
	return Object.freeze({
		...config,
		filters: Object.freeze([...config.filters]),
		skip: Object.freeze([...config.skip]),
	});
}

/** Reviewable argv; no process, engine, or network side effects. */
export function daggerCheckArgs(
	config: DaggerCheckConfig,
	cwd = process.cwd(),
): string[] {
	const engine =
		config.engine === "local"
			? `image://registry.dagger.io/engine:v${config.cliVersion}`
			: config.engine;
	return [
		"check",
		`--engine=${engine}`,
		`--workspace=${resolve(cwd, config.workspace)}`,
		"--progress=plain",
		`--parallel=${config.parallel}`,
		...(config.failFast ? ["--fail-fast"] : []),
		...config.skip.map((link) => `--skip=${link}`),
		"--",
		...config.filters,
	];
}

export interface DaggerCheckRunOptions {
	readonly cwd?: string;
	/** Operator-selected executable; never read from repository configuration. */
	readonly executable?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
}

/**
 * Runs native checks and forwards their logs and exit code. This is a local CLI
 * entrypoint, not a scheduled pipeline session or a remote stop acknowledgment.
 */
export async function runDaggerChecks(
	config: DaggerCheckConfig,
	options: DaggerCheckRunOptions = {},
): Promise<number> {
	options.signal?.throwIfAborted();
	const cwd = resolve(options.cwd ?? process.cwd());
	const executable = options.executable ?? "dagger";
	const settings = await mkdtemp(join(tmpdir(), "hobo-dagger-checks-"));
	try {
		// Tokens alone are insufficient: the CLI also reads a saved Cloud login.
		// Keep proxy, CA, Docker and other toolchain settings in the child only.
		const env: NodeJS.ProcessEnv = {
			...(options.env ?? process.env),
			XDG_CONFIG_HOME: settings,
		};
		for (const key of Object.keys(env)) {
			if (
				key.startsWith("DAGGER_CLOUD_") ||
				key.startsWith("DAGGER_SESSION_") ||
				key === "DAGGER_ENGINE" ||
				key === "_EXPERIMENTAL_DAGGER_RUNNER_HOST"
			)
				delete env[key];
		}
		// Avoid inherited per-user module settings; the workspace remains canonical.
		env.DAGGER_CONFIG = join(settings, "config.toml");
		await writeFile(env.DAGGER_CONFIG, "");
		const { stdout } = await promisify(execFile)(executable, ["version"], {
			cwd,
			env,
			signal: options.signal,
			timeout: 10_000,
			killSignal: "SIGKILL",
			maxBuffer: 16 * 1024,
		});
		if (stdout.split(/\s+/)[1] !== `v${config.cliVersion}`)
			throw new Error(
				`Install Dagger CLI v${config.cliVersion} to match cliVersion`,
			);
		options.signal?.throwIfAborted();
		return await new Promise<number>((done, reject) => {
			const child = spawn(executable, daggerCheckArgs(config, cwd), {
				cwd,
				env,
				signal: options.signal,
				stdio: "inherit",
				shell: false,
			});
			let failure: Error | undefined;
			let escalation: ReturnType<typeof setTimeout> | undefined;
			const escalate = () => {
				escalation ??= setTimeout(() => child.kill("SIGKILL"), 5000);
				escalation.unref();
			};
			options.signal?.addEventListener("abort", escalate, { once: true });
			if (options.signal?.aborted) escalate();
			child.once("error", (error) => {
				failure = error;
			});
			child.once("close", (code, signal) => {
				clearTimeout(escalation);
				options.signal?.removeEventListener("abort", escalate);
				if (failure) reject(failure);
				else if (signal) reject(new Error(`Dagger CLI stopped by ${signal}`));
				else done(code ?? 1);
			});
		});
	} finally {
		await rm(settings, { recursive: true, force: true });
	}
}
