/**
 * Shared fixtures for the sibling-pin tests: scratch directories, manifests,
 * the real script run as a child process, and a loopback HTTP server that
 * counts requests. The git fixtures are `pins-git-support.ts`, re-exported here.
 *
 * Nothing here touches the network beyond 127.0.0.1, the user's git
 * configuration, or the real `external/ts-autocode` submodule.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
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

import { type GitConfig, gitEnv } from "./pins-git-support.ts";

export * from "./pins-git-support.ts";

export const SCRIPT = join(REPO_ROOT, "scripts/bootstrap-siblings.mts");

const made: string[] = [];
/** What `mkdtemp` makes of `pins-<label>-`: six random characters. */
const SCRATCH_NAME = /^pins-[a-z-]+-[A-Za-z0-9]{6}$/u;
const STALE_AFTER_MS = 10 * 60_000;

/** Directories an earlier run leaked (a killed one); young ones may be live runs. */
function sweepStale(): void {
	for (const name of readdirSync(tmpdir())) {
		if (!SCRATCH_NAME.test(name)) continue;
		const path = join(tmpdir(), name);
		try {
			const info = statSync(path);
			const mine = info.uid === process.getuid?.();
			if (
				mine &&
				info.isDirectory() &&
				Date.now() - info.mtimeMs > STALE_AFTER_MS
			) {
				rmSync(path, { recursive: true, force: true });
			}
		} catch {
			// Gone already, or not ours to read: leave it.
		}
	}
}

function removeMade(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
}

/**
 * A fresh temp directory that is removed when this process exits. Stale ones
 * left by an earlier run are swept the first time it is called.
 */
export function scratch(label: string): string {
	if (made.length === 0) {
		sweepStale();
		process.once("exit", removeMade);
	}
	const dir = mkdtempSync(join(tmpdir(), `pins-${label}-`));
	made.push(dir);
	return dir;
}

export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** A root with only a manifest: no git pins, the given `assets` section. */
export function writeManifest(
	root: string,
	assets: string,
	vendor = "{}",
): void {
	mkdirSync(join(root, "tools/pins"), { recursive: true });
	const manifest = {
		schemaVersion: 1,
		git: {},
		assets: JSON.parse(assets),
		vendor: JSON.parse(vendor),
	};
	writeFileSync(
		join(root, "tools/pins/siblings.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
}

export interface ScriptRun {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

function scriptCall(
	root: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv,
	more: GitConfig,
) {
	return {
		argv: ["--experimental-strip-types", SCRIPT, "--root", root, ...args],
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
	};
}

/** Runs the real script under Node's native type stripping, no loader. */
export function runBootstrap(
	root: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv = {},
	more: GitConfig = [],
): ScriptRun {
	const call = scriptCall(root, args, env, more);
	const result = spawnSync(process.execPath, call.argv, {
		cwd: root,
		encoding: "utf8",
		env: call.env,
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/**
 * The same, without blocking this process: a test that serves the script's
 * downloads from an in-process HTTP server must not freeze its own event loop.
 */
export function runBootstrapAsync(
	root: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv = {},
): Promise<ScriptRun> {
	const call = scriptCall(root, args, env, []);
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, call.argv, {
			cwd: root,
			env: call.env,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (status) => resolve({ status, stdout, stderr }));
	});
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
