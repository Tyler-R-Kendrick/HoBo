/**
 * Which `opensesame` a run starts, settled before the store passphrase goes
 * anywhere near it. The executable is handed OPENSESAME_STORE_PASSWORD, so a
 * program that is not OpenSesame and answers to the name is handed the key to
 * the store. Two things stand between a bare name and that:
 *
 * - The name is looked up on the absolute entries of PATH only. An empty entry,
 *   `.` or any relative entry means "the working directory", which is where a
 *   checked-out repository or a download puts a planted `opensesame`; they are
 *   ignored, not searched last. The first executable file found is the one, as a
 *   shell finds it, and one that group or others can write is refused rather than
 *   skipped for a later one, because a program that anyone can rewrite is not the
 *   one the person installed. A path with a separator in it is the caller's own
 *   explicit choice: used as given, not held to the write check.
 * - It is then asked `--version` with PATH alone in its environment (no
 *   passphrase, nothing the caller listed) and must answer `opensesame X.Y.Z`.
 *   That stops running the wrong program by accident or by a stray earlier entry
 *   on PATH. It is a shape check, not authentication: a program that prints that
 *   line passes, and one the caller's own user installed on an absolute PATH entry
 *   is the caller's to trust.
 *
 * What the program says is never repeated in an error: it is not trusted text.
 */

import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve, sep } from "node:path";

import { OpenSesameAdapterError } from "./errors.js";

/** What `--version` returned: how it ended and what it wrote to stdout. */
export type BinProbe = (
	bin: string,
	env: NodeJS.ProcessEnv,
) => Readonly<{ status: number | null; stdout: string }>;

export type TrustInput = Readonly<{
	/** A bare name (looked up on PATH) or a path (used as given). */
	bin: string;
	/** The caller's environment; only its PATH is read. */
	env: NodeJS.ProcessEnv;
	/** Runs `bin --version`. Defaults to doing so. */
	probe?: BinProbe | undefined;
}>;

const IDENTITY = /^opensesame \d+\.\d+\.\d+/u;
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_OUTPUT_LIMIT = 4096;
const GROUP_OR_OTHERS_WRITE = 0o022;

const nodeProbe: BinProbe = (bin, env) => {
	const result = spawnSync(bin, ["--version"], {
		env,
		encoding: "utf8",
		timeout: PROBE_TIMEOUT_MS,
		maxBuffer: PROBE_OUTPUT_LIMIT,
		stdio: ["ignore", "pipe", "ignore"],
	});
	return { status: result.status, stdout: result.stdout ?? "" };
};

type Found = Readonly<{ path: string; mode: number }>;

/** The file at `path` if it is a regular file this process can execute. */
function executableFile(path: string): Found | undefined {
	try {
		const stats = statSync(path);
		if (!stats.isFile()) return undefined;
		accessSync(path, constants.X_OK);
		return { path, mode: stats.mode };
	} catch {
		return undefined;
	}
}

/** The absolute entries of a PATH, in order. */
export function absolutePathEntries(pathValue: string | undefined): string[] {
	return (pathValue ?? "")
		.split(delimiter)
		.filter((entry) => entry !== "" && isAbsolute(entry));
}

function missing(name: string): OpenSesameAdapterError {
	return new OpenSesameAdapterError(
		"opensesame_bin_missing",
		`no executable file named ${name} on an absolute entry of PATH (empty and relative entries are not searched); give the path to opensesame as bin`,
	);
}

function untrusted(why: string): OpenSesameAdapterError {
	return new OpenSesameAdapterError("opensesame_bin_untrusted", why);
}

function locate(bin: string, dirs: readonly string[]): Found {
	if (bin.includes(sep) || bin.includes("/")) {
		const explicit = executableFile(resolve(bin));
		if (explicit === undefined) throw missing(bin);
		return explicit;
	}
	for (const dir of dirs) {
		const found = executableFile(resolve(dir, bin));
		if (found === undefined) continue;
		if ((found.mode & GROUP_OR_OTHERS_WRITE) !== 0) {
			throw untrusted(
				`${found.path} is writable by group or others, so it is not run with the store passphrase; fix its mode, or give the path to opensesame as bin`,
			);
		}
		return found;
	}
	throw missing(bin);
}

/** The `opensesame` to start: found, checked and identified, or a typed refusal. */
export function trustedOpenSesame(input: TrustInput): string {
	const dirs = absolutePathEntries(input.env.PATH);
	const { path } = locate(input.bin, dirs);
	const answer = (input.probe ?? nodeProbe)(path, {
		PATH: dirs.join(delimiter),
	});
	if (answer.status !== 0 || !IDENTITY.test(answer.stdout)) {
		throw untrusted(
			`${path} did not answer --version as opensesame X.Y.Z, so it is not started with the store passphrase`,
		);
	}
	return path;
}
