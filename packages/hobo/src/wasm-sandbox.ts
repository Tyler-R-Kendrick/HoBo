/**
 * Real Wasmtime OS-process sandboxes for private Camp components.
 *
 * Framework-agnostic (no Hono / Express / etc. in this package):
 *   - Apps supply wasi:http/proxy **guest adapters** (e.g. `src/adapters/wasm/api-guest.mjs`)
 *   - Local host uses bindle entrypoints as plain `(Request) => Response` (any framework)
 *   - HoBo never imports HTTP frameworks; adapters live with the app or adapter packages
 *
 * Driven through HoBo CLI (Yard component host = isolated-wasm):
 *   - `hobo yard ensure` / `init --host isolated-wasm` / `doctor` → toolchain under HOBO_HOME
 *   - `hobo dev` resolves project guests, componentizes, boots sandboxes
 *   - Camp mesh injects bindle env on every hop (`x-hobo-env-*`)
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	chmodSync,
	rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import type { FetchHandler } from "./bare-metal-host.js";
import { defaultHoboHome } from "./bare-metal-yard.js";

export const PINNED_WASMTIME_VERSION = "46.0.1";

export {
	HOBO_BINDLE_ENV_HEADER,
	HOBO_ENV_HEADER_PREFIX,
	applyHoboMeshEnvHeaders,
} from "./bare-metal-host.js";

export interface WasmtimeBinary {
	readonly binPath: string;
	readonly version: string;
	readonly source: "env" | "tools" | "path" | "downloaded";
}

export interface JcoTool {
	readonly binPath: string;
	readonly version: string;
	readonly source: "package";
}

export interface IsolatedWasmToolchain {
	readonly hoboHome: string;
	readonly wasmtime: WasmtimeBinary;
	readonly jco: JcoTool;
	readonly ready: true;
	readonly notes: readonly string[];
}

export interface ComponentizeResult {
	readonly wasmPath: string;
	readonly guestSourcePath: string;
	readonly workDir: string;
	readonly resourceName: string;
}

export interface WasmtimeSandbox {
	readonly resourceName: string;
	readonly pid: number;
	readonly loopbackUrl: string;
	readonly port: number;
	readonly wasmPath: string;
	readonly wasmtimeBin: string;
	readonly isolateBoundary: "wasmtime_process";
	readonly invoke: FetchHandler;
	readonly terminate: () => Promise<void>;
}

function toolsDir(hoboHome: string): string {
	return join(hoboHome, "tools");
}

function platformTriple(): string {
	const arch =
		process.arch === "x64"
			? "x86_64"
			: process.arch === "arm64"
				? "aarch64"
				: process.arch;
	const os =
		process.platform === "linux"
			? "linux"
			: process.platform === "darwin"
				? "macos"
				: process.platform === "win32"
					? "windows"
					: process.platform;
	return `${arch}-${os}`;
}

function parseVersion(output: string): string | null {
	const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
	return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function tryWasmtime(binPath: string): { version: string } | null {
	if (!existsSync(binPath) && binPath.includes("/")) return null;
	const result = spawnSync(binPath, ["--version"], {
		encoding: "utf8",
		timeout: 10_000,
	});
	if (result.status !== 0) return null;
	const version = parseVersion(result.stdout || result.stderr || "");
	if (!version) return null;
	return { version };
}

function meetsFloor(version: string, floor = PINNED_WASMTIME_VERSION): boolean {
	const parts = version.split(".").map((p) => Number.parseInt(p, 10));
	const floorParts = floor.split(".").map((p) => Number.parseInt(p, 10));
	for (let i = 0; i < floorParts.length; i += 1) {
		const current = parts[i] ?? 0;
		const want = floorParts[i] ?? 0;
		if (current > want) return true;
		if (current < want) return false;
	}
	return true;
}

/**
 * Resolve a wasmtime binary meeting the floor version, downloading into
 * `$HOBO_HOME/tools/wasmtime` when needed. Prefer calling
 * {@link ensureIsolatedWasmToolchain} from CLI surfaces.
 */
export async function ensureWasmtimeBinary(options: {
	readonly hoboHome?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly binPath?: string;
	readonly download?: boolean;
	readonly emitProgress?: (message: string) => void;
} = {}): Promise<WasmtimeBinary> {
	const env = options.env ?? process.env;
	const hoboHome = options.hoboHome ?? defaultHoboHome(env);
	const download = options.download ?? true;
	const emit = options.emitProgress ?? (() => {});

	if (options.binPath) {
		const probed = tryWasmtime(options.binPath);
		if (probed && meetsFloor(probed.version)) {
			return {
				binPath: options.binPath,
				version: probed.version,
				source: "env",
			};
		}
		throw new Error(
			`HOBO_WASMTIME_BIN=${options.binPath} is missing or below ${PINNED_WASMTIME_VERSION}`,
		);
	}

	const fromEnv = env.HOBO_WASMTIME_BIN;
	if (typeof fromEnv === "string" && fromEnv.length > 0) {
		const probed = tryWasmtime(fromEnv);
		if (probed && meetsFloor(probed.version)) {
			return { binPath: fromEnv, version: probed.version, source: "env" };
		}
	}

	const toolsPath = join(toolsDir(hoboHome), "wasmtime");
	const toolsProbe = tryWasmtime(toolsPath);
	if (toolsProbe && meetsFloor(toolsProbe.version)) {
		return {
			binPath: toolsPath,
			version: toolsProbe.version,
			source: "tools",
		};
	}

	const pathProbe = tryWasmtime("wasmtime");
	if (pathProbe && meetsFloor(pathProbe.version)) {
		return {
			binPath: "wasmtime",
			version: pathProbe.version,
			source: "path",
		};
	}

	if (!download) {
		throw new Error(
			`wasmtime >= ${PINNED_WASMTIME_VERSION} not found; run \`hobo yard ensure\` (or \`hobo yard init --host isolated-wasm\`)`,
		);
	}

	const triple = platformTriple();
	if (!triple.endsWith("-linux") && !triple.endsWith("-macos")) {
		throw new Error(
			`automatic wasmtime download unsupported for ${triple}; install wasmtime ${PINNED_WASMTIME_VERSION} and set HOBO_WASMTIME_BIN, or run hobo yard ensure on linux/macos`,
		);
	}

	const version = PINNED_WASMTIME_VERSION;
	const archiveName = `wasmtime-v${version}-${triple}.tar.xz`;
	const url = `https://github.com/bytecodealliance/wasmtime/releases/download/v${version}/${archiveName}`;
	const staging = join(tmpdir(), `hobo-wasmtime-${version}-${process.pid}`);
	mkdirSync(staging, { recursive: true });
	const archivePath = join(staging, archiveName);

	emit(`hobo: downloading wasmtime ${version} (${triple}) into ${toolsDir(hoboHome)}`);
	const curl = spawnSync("curl", ["-fsSL", "-o", archivePath, url], {
		encoding: "utf8",
		timeout: 120_000,
	});
	if (curl.status !== 0) {
		throw new Error(
			`failed to download wasmtime ${version} from ${url}: ${curl.stderr || curl.stdout}`,
		);
	}

	const tar = spawnSync("tar", ["-xJf", archivePath, "-C", staging], {
		encoding: "utf8",
		timeout: 60_000,
	});
	if (tar.status !== 0) {
		throw new Error(`failed to extract wasmtime archive: ${tar.stderr}`);
	}

	const extracted = join(
		staging,
		`wasmtime-v${version}-${triple}`,
		"wasmtime",
	);
	if (!existsSync(extracted)) {
		throw new Error(`wasmtime binary missing after extract: ${extracted}`);
	}

	mkdirSync(toolsDir(hoboHome), { recursive: true });
	writeFileSync(toolsPath, readFileSync(extracted));
	chmodSync(toolsPath, 0o755);
	rmSync(staging, { recursive: true, force: true });

	const verified = tryWasmtime(toolsPath);
	if (!verified) {
		throw new Error(`downloaded wasmtime at ${toolsPath} failed --version`);
	}
	emit(`hobo: wasmtime ${verified.version} ready at ${toolsPath}`);
	return {
		binPath: toolsPath,
		version: verified.version,
		source: "downloaded",
	};
}

function packageRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	if (existsSync(join(here, "wit", "wasi-http", "proxy.wit"))) return here;
	if (existsSync(join(here, "..", "wit", "wasi-http", "proxy.wit"))) {
		return join(here, "..");
	}
	if (existsSync(join(here, "..", "..", "wit", "wasi-http", "proxy.wit"))) {
		return join(here, "..", "..");
	}
	return join(here, "..");
}

function wasiHttpWitDir(): string {
	const root = packageRoot();
	const wit = join(root, "wit", "wasi-http");
	if (!existsSync(join(wit, "proxy.wit"))) {
		throw new Error(
			`wasi-http WIT not found at ${wit}; package is missing vendored wit/wasi-http`,
		);
	}
	return wit;
}

function resolveJcoBin(): string {
	const require = createRequire(import.meta.url);
	try {
		const jcoPkg = require.resolve("@bytecodealliance/jco/package.json");
		const bin = join(dirname(jcoPkg), "src", "jco.js");
		if (existsSync(bin)) return bin;
	} catch {
		// fall through
	}
	let dir = packageRoot();
	for (let i = 0; i < 6; i += 1) {
		const candidate = join(
			dir,
			"node_modules",
			"@bytecodealliance",
			"jco",
			"src",
			"jco.js",
		);
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(
		"@bytecodealliance/jco not found; reinstall @hobo/hobo dependencies, then run `hobo yard ensure`",
	);
}

function resolveJcoTool(): JcoTool {
	const binPath = resolveJcoBin();
	let version = "unknown";
	// jco.js lives at <pkg>/src/jco.js — package.json is two levels up from the file.
	const pkgJson = join(dirname(binPath), "..", "package.json");
	if (existsSync(pkgJson)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgJson, "utf8")) as {
				version?: string;
			};
			if (typeof pkg.version === "string") version = pkg.version;
		} catch {
			// keep unknown
		}
	}
	return { binPath, version, source: "package" };
}

/**
 * Ensure the isolated-wasm Camp component host can run: wasmtime + jco.
 * Called from `hobo yard ensure|init|doctor` and automatically from `hobo dev`.
 */
export async function ensureIsolatedWasmToolchain(options: {
	readonly hoboHome?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly download?: boolean;
	readonly emitProgress?: (message: string) => void;
} = {}): Promise<IsolatedWasmToolchain> {
	const env = options.env ?? process.env;
	const hoboHome = options.hoboHome ?? defaultHoboHome(env);
	const emit = options.emitProgress ?? (() => {});
	const notes: string[] = [];

	emit(`hobo: ensuring isolated-wasm toolchain under ${hoboHome}`);
	const wasmtime = await ensureWasmtimeBinary({
		hoboHome,
		env,
		download: options.download ?? true,
		emitProgress: emit,
	});
	notes.push(`wasmtime ${wasmtime.version} (${wasmtime.source}) at ${wasmtime.binPath}`);

	const jco = resolveJcoTool();
	notes.push(`jco ${jco.version} at ${jco.binPath}`);
	emit(`hobo: isolated-wasm toolchain ready (wasmtime ${wasmtime.version}, jco ${jco.version})`);

	return {
		hoboHome,
		wasmtime,
		jco,
		ready: true,
		notes,
	};
}

export interface ResolvedPrivateGuest {
	readonly resourceName: string;
	readonly projectDir: string;
	/** Prebuilt wasi:http/proxy component, if the app already componentized. */
	readonly wasmPath: string | null;
	/** App-supplied guest JS (wasi:http fetch-event). Framework-free at the HoBo boundary. */
	readonly guestSourcePath: string | null;
}

/**
 * Resolve a project-supplied wasm guest adapter for a private bindle resource.
 *
 * Convention (first match wins):
 *   - dist/adapters/wasm/<name>.wasm
 *   - src/adapters/wasm/<name>-guest.mjs|.js
 *   - src/adapters/wasm/<name>.mjs|.js
 *   - adapters/wasm/<name>-guest.mjs|.js
 *
 * App code (Hono, etc.) is never loaded by this resolver — only guest adapters.
 */
export function resolvePrivateWasmGuest(options: {
	readonly projectDir: string;
	readonly resourceName: string;
}): ResolvedPrivateGuest {
	const { projectDir, resourceName } = options;
	const name = resourceName;
	const candidatesWasm = [
		join(projectDir, "dist", "adapters", "wasm", `${name}.wasm`),
		join(projectDir, "adapters", "wasm", `${name}.wasm`),
	];
	for (const wasmPath of candidatesWasm) {
		if (existsSync(wasmPath)) {
			return {
				resourceName: name,
				projectDir,
				wasmPath,
				guestSourcePath: null,
			};
		}
	}
	const candidatesJs = [
		join(projectDir, "src", "adapters", "wasm", `${name}-guest.mjs`),
		join(projectDir, "src", "adapters", "wasm", `${name}-guest.js`),
		join(projectDir, "src", "adapters", "wasm", `${name}.mjs`),
		join(projectDir, "src", "adapters", "wasm", `${name}.js`),
		join(projectDir, "adapters", "wasm", `${name}-guest.mjs`),
		join(projectDir, "adapters", "wasm", `${name}-guest.js`),
		join(projectDir, "dist", "adapters", "wasm", `${name}-guest.mjs`),
		join(projectDir, "dist", "adapters", "wasm", `${name}-guest.js`),
	];
	for (const guestSourcePath of candidatesJs) {
		if (existsSync(guestSourcePath)) {
			return {
				resourceName: name,
				projectDir,
				wasmPath: null,
				guestSourcePath,
			};
		}
	}
	return {
		resourceName: name,
		projectDir,
		wasmPath: null,
		guestSourcePath: null,
	};
}

/**
 * Componentize an **app-supplied** wasi:http/proxy guest into .wasm for wasmtime serve.
 * Does not invent application routes or frameworks — guestSourcePath is required.
 * Env is not part of the artifact — HoBo injects it on the mesh hop.
 */
export async function componentizePrivateGuest(options: {
	readonly resourceName: string;
	readonly guestSourcePath: string;
	readonly workDir?: string;
	readonly hoboHome?: string;
	readonly jcoBin?: string;
	readonly emitProgress?: (message: string) => void;
}): Promise<ComponentizeResult> {
	const emit = options.emitProgress ?? (() => {});
	if (!existsSync(options.guestSourcePath)) {
		throw new Error(
			`private wasm guest not found: ${options.guestSourcePath} (resource ${options.resourceName})`,
		);
	}
	const guestBytes = readFileSync(options.guestSourcePath);
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	const hash = createHash("sha256")
		.update(options.resourceName)
		.update("\0")
		.update(options.guestSourcePath)
		.update("\0")
		.update(guestBytes)
		.digest("hex")
		.slice(0, 16);
	const workDir =
		options.workDir ??
		join(hoboHome, "sandboxes", options.resourceName, hash);
	mkdirSync(workDir, { recursive: true });

	const guestSourcePath = join(workDir, "guest.mjs");
	const wasmPath = join(workDir, "guest.wasm");
	// Copy app guest into the work dir so componentize inputs are self-contained.
	writeFileSync(guestSourcePath, guestBytes);

	if (existsSync(wasmPath) && existsSync(join(workDir, ".componentize-ok"))) {
		emit(`hobo: reusing componentized ${options.resourceName} at ${wasmPath}`);
		return {
			wasmPath,
			guestSourcePath,
			workDir,
			resourceName: options.resourceName,
		};
	}

	const jco = options.jcoBin ?? resolveJcoBin();
	const witDir = wasiHttpWitDir();
	emit(
		`hobo: componentizing private ${options.resourceName} from app adapter ${options.guestSourcePath}`,
	);
	const args = [
		jco,
		"componentize",
		guestSourcePath,
		"-w",
		witDir,
		"-n",
		"proxy",
		"-o",
		wasmPath,
		// Disable stdio so wasmtime serve can link (no terminal-input import).
		// Camp config is injected by HoBo mesh headers, not WASI env/stdio.
		"--disable",
		"stdio",
	];
	const result = spawnSync(process.execPath, args, {
		encoding: "utf8",
		timeout: 180_000,
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(
			`jco componentize failed for ${options.resourceName}: ${result.stderr || result.stdout}`,
		);
	}
	if (!existsSync(wasmPath)) {
		throw new Error(`jco componentize produced no wasm at ${wasmPath}`);
	}
	writeFileSync(join(workDir, ".componentize-ok"), `${Date.now()}\n`, "utf8");
	emit(`hobo: wrote ${wasmPath}`);
	return {
		wasmPath,
		guestSourcePath,
		workDir,
		resourceName: options.resourceName,
	};
}

/**
 * Resolve + componentize (if needed) a private resource for isolated-wasm.
 */
export async function preparePrivateWasmComponent(options: {
	readonly projectDir: string;
	readonly resourceName: string;
	readonly hoboHome?: string;
	readonly jcoBin?: string;
	readonly emitProgress?: (message: string) => void;
}): Promise<ComponentizeResult> {
	const resolved = resolvePrivateWasmGuest({
		projectDir: options.projectDir,
		resourceName: options.resourceName,
	});
	if (resolved.wasmPath !== null) {
		options.emitProgress?.(
			`hobo: using prebuilt wasm for private ${options.resourceName} at ${resolved.wasmPath}`,
		);
		return {
			wasmPath: resolved.wasmPath,
			guestSourcePath: resolved.guestSourcePath ?? resolved.wasmPath,
			workDir: dirname(resolved.wasmPath),
			resourceName: options.resourceName,
		};
	}
	if (resolved.guestSourcePath === null) {
		throw new Error(
			`isolated-wasm: no wasm guest adapter for private resource '${options.resourceName}' in ${options.projectDir}. ` +
				`Add a framework-free wasi:http guest at src/adapters/wasm/${options.resourceName}-guest.mjs ` +
				`(HTTP frameworks like Hono belong in app entrypoints for the local host, not in @hobo/* core).`,
		);
	}
	return componentizePrivateGuest({
		resourceName: options.resourceName,
		guestSourcePath: resolved.guestSourcePath,
		...(options.hoboHome !== undefined ? { hoboHome: options.hoboHome } : {}),
		...(options.jcoBin !== undefined ? { jcoBin: options.jcoBin } : {}),
		...(options.emitProgress !== undefined
			? { emitProgress: options.emitProgress }
			: {}),
	});
}

async function freeLoopbackPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr === null || typeof addr === "string") {
				server.close();
				reject(new Error("failed to allocate loopback port"));
				return;
			}
			const port = addr.port;
			server.close((error) => {
				if (error) reject(error);
				else resolve(port);
			});
		});
		server.once("error", reject);
	});
}

async function waitForListen(
	port: number,
	child: ChildProcess,
	timeoutMs = 30_000,
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (child.exitCode !== null) {
			throw new Error(
				`wasmtime exited before listen (code ${child.exitCode})`,
			);
		}
		try {
			const response = await fetch(`http://127.0.0.1:${port}/`, {
				signal: AbortSignal.timeout(500),
			});
			void response.arrayBuffer().catch(() => {});
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error(`wasmtime serve did not listen on 127.0.0.1:${port} in time`);
}

/**
 * Spawn a sandboxed `wasmtime serve` process for a wasi-http proxy component.
 */
export async function bootWasmtimeSandbox(options: {
	readonly resourceName: string;
	readonly wasmPath: string;
	readonly wasmtimeBin: string;
	readonly port?: number;
	readonly emitProgress?: (message: string) => void;
}): Promise<WasmtimeSandbox> {
	const emit = options.emitProgress ?? (() => {});
	const port = options.port ?? (await freeLoopbackPort());
	const addr = `127.0.0.1:${port}`;
	const loopbackUrl = `http://${addr}`;

	const args = [
		"serve",
		"--addr",
		addr,
		"-Sinherit-network=n",
		"-Sallow-ip-name-lookup=n",
		"-Stcp=n",
		"-Sudp=n",
		options.wasmPath,
	];

	emit(
		`hobo: spawning wasmtime sandbox for private ${options.resourceName} on ${loopbackUrl}`,
	);

	const child = spawn(options.wasmtimeBin, args, {
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
	});

	let stderr = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString("utf8");
	});
	child.stdout?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString("utf8");
	});

	try {
		await waitForListen(port, child);
	} catch (error) {
		child.kill("SIGTERM");
		const detail = stderr.trim() || String(error);
		throw new Error(
			`wasmtime sandbox failed for ${options.resourceName}: ${detail}`,
		);
	}

	const pid = child.pid ?? 0;
	emit(
		`hobo: wasmtime sandbox ready pid=${pid} component=${options.resourceName}`,
	);

	const invoke: FetchHandler = async (request) => {
		const url = new URL(request.url);
		const target = `${loopbackUrl}${url.pathname}${url.search}`;
		const method = request.method;
		// Forward HoBo mesh-injected env headers into the sandbox process.
		const headers = Object.fromEntries(request.headers.entries());
		const init: RequestInit = { method, headers };
		if (method !== "GET" && method !== "HEAD") {
			init.body = await request.arrayBuffer();
		}
		return fetch(target, init);
	};

	let terminated = false;
	const terminate = async () => {
		if (terminated) return;
		terminated = true;
		if (child.exitCode !== null) return;
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 3_000);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	};

	return {
		resourceName: options.resourceName,
		pid,
		loopbackUrl,
		port,
		wasmPath: options.wasmPath,
		wasmtimeBin: options.wasmtimeBin,
		isolateBoundary: "wasmtime_process",
		invoke,
		terminate,
	};
}

