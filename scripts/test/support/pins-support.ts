/**
 * Shared fixtures for the sibling-pin tests: a hermetic git environment, a
 * throwaway "remote" repository, a work tree whose submodule has not been
 * initialised yet, and a loopback HTTP server that counts requests.
 *
 * Nothing here touches the network beyond 127.0.0.1, the user's git
 * configuration, or the real `external/ts-autocode` submodule.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

export const SCRIPT = join(REPO_ROOT, "scripts/bootstrap-siblings.mts");

export function scratch(label: string): string {
	return mkdtempSync(join(tmpdir(), `pins-${label}-`));
}

export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export type GitConfig = readonly (readonly [string, string])[];

/**
 * git with the user's configuration (signing, hooks, identity) switched off, a
 * fixed identity, and the file transport allowed so a local repository can be
 * a submodule remote. Child processes inherit it, so the script under test
 * sees exactly the same git.
 */
export function gitEnv(
	extra: NodeJS.ProcessEnv = {},
	more: GitConfig = [],
): NodeJS.ProcessEnv {
	const config: GitConfig = [
		["protocol.file.allow", "always"],
		["init.defaultBranch", "main"],
		["commit.gpgsign", "false"],
		...more,
	];
	const env: NodeJS.ProcessEnv = {};
	for (const [index, [key, value]] of config.entries()) {
		env[`GIT_CONFIG_KEY_${index}`] = key;
		env[`GIT_CONFIG_VALUE_${index}`] = value;
	}
	return {
		...process.env,
		NODE_OPTIONS: "",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_COUNT: String(config.length),
		GIT_TERMINAL_PROMPT: "0",
		GIT_AUTHOR_NAME: "Pins Test",
		GIT_AUTHOR_EMAIL: "pins@example.invalid",
		GIT_COMMITTER_NAME: "Pins Test",
		GIT_COMMITTER_EMAIL: "pins@example.invalid",
		...env,
		...extra,
	};
}

export function git(
	cwd: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv = gitEnv(),
): string {
	return execFileSync("git", [...args], {
		cwd,
		env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

export interface Remote {
	readonly dir: string;
	readonly url: string;
	/** Full commit ids, oldest first. */
	readonly shas: readonly string[];
}

/** A repository with three commits, each rewriting the same four files. */
export function makeRemote(parent: string): Remote {
	const dir = join(parent, "remote");
	mkdirSync(dir, { recursive: true });
	git(dir, ["init", "-q"]);
	const shas: string[] = [];
	for (const revision of ["1", "2", "3"]) {
		for (const file of [
			"README.md",
			"packages/a/x.txt",
			"packages/b/y.txt",
			"docs/z.txt",
		]) {
			mkdirSync(dirname(join(dir, file)), { recursive: true });
			writeFileSync(join(dir, file), `revision ${revision}\n`);
		}
		git(dir, ["add", "-A"]);
		git(dir, ["commit", "-q", "-m", `revision ${revision}`]);
		shas.push(git(dir, ["rev-parse", "HEAD"]));
	}
	return { dir, url: `file://${dir}`, shas };
}

export interface PinsFileOptions {
	readonly path?: string;
	readonly repo?: string;
	readonly sparse?: readonly string[] | null;
	/** Raw JSON of the manifest's `assets` section. */
	readonly assets?: string;
}

export function pinsJson(
	remoteUrl: string,
	options: PinsFileOptions = {},
): string {
	const manifest = {
		schemaVersion: 1,
		git: {
			lib: {
				path: options.path ?? "external/lib",
				repo: options.repo ?? remoteUrl,
				branch: "main",
				sparse: options.sparse ?? null,
			},
		},
		assets: JSON.parse(options.assets ?? '{"tool":null}'),
		vendor: {},
	};
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * A work tree shaped like a fresh clone: `external/lib` is a gitlink at
 * `remote.shas[pinned]`, `.gitmodules` names the remote, and the submodule has
 * not been initialised.
 */
export function makeWork(
	parent: string,
	remote: Remote,
	pinned: number,
	options: PinsFileOptions = {},
): string {
	const stage = join(parent, "stage");
	mkdirSync(stage, { recursive: true });
	git(stage, ["init", "-q"]);
	const path = options.path ?? "external/lib";
	git(stage, ["submodule", "add", "-q", remote.url, path]);
	git(join(stage, path), ["checkout", "-q", remote.shas[pinned] ?? ""]);
	mkdirSync(join(stage, "tools/pins"), { recursive: true });
	writeFileSync(
		join(stage, "tools/pins/siblings.json"),
		pinsJson(remote.url, options),
	);
	git(stage, ["add", "-A"]);
	git(stage, ["commit", "-q", "-m", "super"]);
	const work = join(parent, "work");
	git(parent, ["clone", "-q", stage, work]);
	return work;
}

/** A full clone to lend objects: `--reference` against it needs no download. */
export function makeReference(parent: string, remote: Remote): string {
	const dir = join(parent, "reference");
	git(parent, ["clone", "-q", "--no-hardlinks", remote.dir, dir]);
	return dir;
}

export interface ScriptRun {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/** Runs the real script under Node's native type stripping, no loader. */
export function runBootstrap(
	root: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv = {},
	more: GitConfig = [],
): ScriptRun {
	const result = spawnSync(
		process.execPath,
		["--experimental-strip-types", SCRIPT, "--root", root, ...args],
		{
			cwd: root,
			encoding: "utf8",
			env: gitEnv(
				{
					NODE_NO_WARNINGS: "1",
					HOME: join(root, ".home"),
					XDG_CACHE_HOME: join(root, ".cache"),
					HOBO_PINS_ALLOW_LOCAL: "1",
					...env,
				},
				more,
			),
		},
	);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

export interface FileServer {
	readonly origin: string;
	/** `METHOD path` of every request, in order. */
	readonly hits: string[];
	setFile(path: string, bytes: Uint8Array | string): void;
	setRedirect(path: string, location: string): void;
	close(): Promise<void>;
}

/** Loopback HTTP server over an in-memory file table. */
export async function startServer(): Promise<FileServer> {
	const files = new Map<string, Uint8Array>();
	const redirects = new Map<string, string>();
	const hits: string[] = [];
	const server = createServer(
		(request: IncomingMessage, response: ServerResponse) => {
			const path = request.url ?? "/";
			hits.push(`${request.method ?? "GET"} ${path}`);
			const location = redirects.get(path);
			if (location !== undefined) {
				response.writeHead(302, { location });
				response.end();
				return;
			}
			const bytes = files.get(path);
			if (bytes === undefined) {
				response.writeHead(404);
				response.end("not found");
				return;
			}
			response.writeHead(200, { "content-length": String(bytes.byteLength) });
			response.end(bytes);
		},
	);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	// SAFETY: listen(0, host) binds a TCP socket, so address() is an AddressInfo.
	const { port } = server.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		hits,
		setFile(path, bytes) {
			files.set(path, bytes instanceof Uint8Array ? bytes : Buffer.from(bytes));
		},
		setRedirect(path, location) {
			redirects.set(path, location);
		},
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) =>
					error === undefined ? resolve() : reject(error),
				);
			}),
	};
}
