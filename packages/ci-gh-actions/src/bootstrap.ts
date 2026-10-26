import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Official actions/runner release asset SHA-256, retrieved 2026-10-26.
// Re-pin this file and the companion workflow commit together for upgrades.
const RUNNER_VERSION = "2.338.2";
const RUNNER_SHA256 =
	"baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40";

/** Deliberate allowlist: never pass outer job context, tokens or cloud credentials. */
export function runnerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const result: NodeJS.ProcessEnv = {};
	for (const name of [
		"PATH",
		"HOME",
		"USER",
		"SHELL",
		"LANG",
		"LC_ALL",
		"TMPDIR",
		"SSL_CERT_FILE",
		"SSL_CERT_DIR",
		"NODE_EXTRA_CA_CERTS",
		"HTTP_PROXY",
		"HTTPS_PROXY",
		"NO_PROXY",
	]) {
		if (env[name] !== undefined) result[name] = env[name];
	}
	return result;
}
function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`missing ${name}`);
	return value;
}
export function runHostProcess(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
	timeout: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: "inherit",
			detached: true,
		});
		let killed = false;
		let hardStop: NodeJS.Timeout | undefined;
		const signal = (name: NodeJS.Signals) => {
			if (child.pid) {
				try {
					process.kill(-child.pid, name);
				} catch {
					/* Process group already stopped. */
				}
			}
		};
		const stop = () => {
			if (killed) return;
			killed = true;
			signal("SIGTERM");
			hardStop = setTimeout(() => signal("SIGKILL"), 10000);
		};
		const timer = setTimeout(stop, timeout);
		process.once("SIGTERM", stop);
		process.once("SIGINT", stop);
		const cleanup = () => {
			clearTimeout(timer);
			clearTimeout(hardStop);
			process.off("SIGTERM", stop);
			process.off("SIGINT", stop);
		};
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("exit", (code) => {
			cleanup();
			if (code === 0 && !killed) resolve();
			else reject(new Error("runner host process failed or timed out"));
		});
	});
}
async function responseField(
	response: Response,
	field: string,
): Promise<string> {
	if (!response.ok)
		throw new Error(`bootstrap request failed (${response.status})`);
	const json = await response.json();
	if (Object.prototype.toString.call(json) !== "[object Object]")
		throw new Error("invalid bootstrap response");
	const value = Object.getOwnPropertyDescriptor(json, field)?.value;
	if (Object.prototype.toString.call(value) !== "[object String]" || !value)
		throw new Error("invalid bootstrap response field");
	return String(value);
}
export async function bootstrap(): Promise<void> {
	const started = Date.now();
	if (process.platform !== "linux" || process.arch !== "x64")
		throw new Error("initial bridge supports Linux x64 only");
	const relay = new URL(required("HOBO_CI_RELAY_URL"));
	if (
		relay.protocol !== "https:" ||
		relay.username ||
		relay.password ||
		relay.pathname !== "/" ||
		relay.search ||
		relay.hash
	)
		throw new Error("relay must be an HTTPS origin");
	const id = required("HOBO_CI_LEASE_ID");
	if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid lease id");
	const minutes = Number(required("HOBO_CI_TIMEOUT_MINUTES"));
	if (!Number.isSafeInteger(minutes) || minutes < 2 || minutes > 350)
		throw new Error("invalid host timeout");
	const work = await mkdtemp(join(tmpdir(), "hobo-ci-runner-"));
	try {
		const assetUrl = `https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz`;
		const archiveResponse = await fetch(assetUrl, {
			signal: AbortSignal.timeout(120000),
		});
		if (!archiveResponse.ok) throw new Error("runner download failed");
		const archive = Buffer.from(await archiveResponse.arrayBuffer());
		if (createHash("sha256").update(archive).digest("hex") !== RUNNER_SHA256)
			throw new Error("runner archive checksum mismatch");
		await writeFile(join(work, "runner.tar.gz"), archive, { mode: 0o600 });
		await runHostProcess(
			"tar",
			["xzf", "runner.tar.gz"],
			work,
			runnerEnvironment(process.env),
			60000,
		);
		const tokenUrl = new URL(required("ACTIONS_ID_TOKEN_REQUEST_URL"));
		if (
			tokenUrl.protocol !== "https:" ||
			!tokenUrl.hostname.endsWith(".actions.githubusercontent.com")
		)
			throw new Error("unexpected identity endpoint");
		tokenUrl.searchParams.set("audience", relay.origin);
		const identity = await responseField(
			await fetch(tokenUrl, {
				headers: {
					Authorization: `Bearer ${required("ACTIONS_ID_TOKEN_REQUEST_TOKEN")}`,
				},
				redirect: "error",
				signal: AbortSignal.timeout(15000),
			}),
			"value",
		);
		if (identity.includes("\n")) throw new Error("missing identity token");
		const jit = await responseField(
			await fetch(`${relay.origin}/v1/leases/${id}/jit`, {
				method: "POST",
				headers: { Authorization: `Bearer ${identity}` },
				redirect: "error",
				signal: AbortSignal.timeout(30000),
			}),
			"encodedJitConfig",
		);
		if (!jit || !/^[A-Za-z0-9+/=]+$/.test(jit))
			throw new Error("invalid runner configuration");
		process.stdout.write(`::add-mask::${jit}\n`);
		const remaining = minutes * 60000 - (Date.now() - started) - 60000;
		if (remaining <= 0) throw new Error("startup exhausted host timeout");
		await runHostProcess(
			join(work, "run.sh"),
			["--jitconfig", jit],
			work,
			runnerEnvironment(process.env),
			remaining,
		);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
	bootstrap().catch(() => {
		process.stderr.write("HoBo CI runner bootstrap failed.\n");
		process.exitCode = 1;
	});
}
