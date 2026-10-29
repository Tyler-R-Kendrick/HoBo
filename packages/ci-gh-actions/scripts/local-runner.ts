import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	access,
	chmod,
	mkdir,
	open,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import {
	installLocalRunnerArchive,
	LocalRunnerRegistrationUncertainError,
	LocalRunnerShutdownUncertainError,
	parseLocalRunnerEnvironment,
	runLocalRunnerSession,
} from "../src/local-runner.js";
import { acquirePartitionLock } from "../src/partition-lock.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const state = resolve(
	process.env.HOBO_CI_LOCAL_STATE_DIRECTORY ?? join(root, ".hobo", "ci-local"),
);
const socket = join(
	tmpdir(),
	`hobo-ci-${process.getuid?.()}-${createHash("sha256").update(state).digest("hex").slice(0, 16)}.sock`,
);
const reply = z.object({ status: z.string(), detail: z.string() });
let current = {
	status: "starting",
	detail: "Checking local runner prerequisites",
};
const request = (command: string) =>
	new Promise<z.infer<typeof reply>>((done, reject) => {
		const client = createConnection(socket);
		let response = "";
		client.setTimeout(3000, () =>
			client.destroy(new Error("local runner control timeout")),
		);
		client.once("connect", () => client.end(command));
		client.on("data", (data) => {
			response += String(data);
			if (response.length > 4096)
				client.destroy(new Error("invalid control response"));
		});
		client.once("error", reject);
		client.once("end", () => {
			try {
				done(reply.parse(JSON.parse(response)));
			} catch (error) {
				reject(error);
			}
		});
	});
async function status() {
	try {
		return await request("status");
	} catch (error) {
		if (
			!(
				error instanceof Error &&
				"code" in error &&
				["ENOENT", "ECONNREFUSED"].includes(String(error.code))
			)
		)
			return {
				status: "unknown",
				detail:
					"Local runner control is unavailable; shutdown has not been confirmed",
			};
		try {
			const saved = reply.parse(
				JSON.parse(await readFile(join(state, "status.json"), "utf8")),
			);
			if (saved.status === "blocked") return saved;
		} catch {
			/* No saved state yet. */
		}
		try {
			await access(join(state, "registration.json"));
			return {
				status: "blocked",
				detail:
					"Controller is stopped with an unfinished registration; start for cleanup/recovery",
			};
		} catch {
			return { status: "stopped", detail: "Local runner is not running" };
		}
	}
}
async function daemon() {
	await mkdir(state, { recursive: true, mode: 0o700 });
	await chmod(state, 0o700);
	const lock = await acquirePartitionLock(join(state, "service"));
	const stopping = new AbortController();
	const stop = () => stopping.abort();
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
	const update = async (status: string, detail: string) => {
		current = { status, detail };
		await writeFile(
			join(state, "status.json"),
			`${JSON.stringify(current)}\n`,
			{ mode: 0o600 },
		);
		process.stdout.write(`${JSON.stringify(current)}\n`);
	};
	const server = createServer({ allowHalfOpen: true }, (client) => {
		client.setTimeout(3000, () => client.destroy());
		let command = "";
		client.on("data", (data) => {
			command += String(data);
			if (command.length > 16) client.destroy();
		});
		client.on("error", () => {});
		client.once("end", () => {
			client.end(
				JSON.stringify(
					command === "stop"
						? { status: "stopping", detail: "Draining the local runner" }
						: current,
				),
			);
			if (command === "stop") process.kill(process.pid, "SIGTERM");
		});
	});
	try {
		await rm(socket, { force: true });
		await new Promise<void>((done, reject) => {
			server.once("error", reject);
			server.listen(socket, done);
		});
		await chmod(socket, 0o600);
		process.send?.("ready");
		process.disconnect?.();
		while (!stopping.signal.aborted) {
			try {
				if (process.platform !== "linux" || process.arch !== "x64")
					throw new Error(
						"Local HoBo bridge requires Linux x64; use act on other platforms",
					);
				const repository = parseLocalRunnerEnvironment(process.env);
				await update("preparing", `Preparing private repository ${repository}`);
				const archive = await installLocalRunnerArchive(state, stopping.signal);
				if (stopping.signal.aborted) break;
				await runLocalRunnerSession({
					repository,
					state,
					archive,
					signal: stopping.signal,
					registered: () =>
						update(
							"registered",
							`${repository}: hobo-local-host; see runner.log for GitHub connection status`,
						),
				});
			} catch (error) {
				if (
					error instanceof LocalRunnerShutdownUncertainError ||
					error instanceof LocalRunnerRegistrationUncertainError
				) {
					await update("blocked", error.message);
					break;
				}
				if (!stopping.signal.aborted)
					await update(
						"waiting",
						error instanceof Error && !error.message.startsWith("[")
							? error.message
							: "Set HOBO_CI_LOCAL_REPOSITORY=owner/repo and configure gh authentication",
					);
			}
			if (!stopping.signal.aborted)
				await pause(30000, undefined, { signal: stopping.signal }).catch(
					() => {},
				);
		}
	} finally {
		server.close();
		await rm(socket, { force: true });
		if (current.status !== "blocked")
			await update("stopped", "Local runner stopped");
		await lock.release();
		process.off("SIGTERM", stop);
		process.off("SIGINT", stop);
	}
}
async function main() {
	const command = process.argv[2] ?? "status";
	if (command === "daemon") {
		await daemon();
		return;
	}
	if (command === "status" || command === "stop") {
		let observation = await status();
		if (
			command === "stop" &&
			!["stopped", "blocked"].includes(observation.status)
		) {
			await request("stop");
			const deadline = Date.now() + 150000;
			do {
				await pause(100);
				observation = await status();
				if (Date.now() > deadline)
					throw new Error(
						"Local runner stop is unconfirmed; inspect runner.log before rebuilding",
					);
			} while (!["stopped", "blocked"].includes(observation.status));
		}
		process.stdout.write(`${JSON.stringify(observation)}\n`);
		if (command === "stop" && observation.status === "blocked")
			process.exitCode = 1;
		return;
	}
	if (command !== "start")
		throw new Error("Usage: local-runner.ts start|status|stop");
	if (process.env.HOBO_CI_LOCAL_RUNNER === "0") {
		process.stdout.write("Local runner disabled (HOBO_CI_LOCAL_RUNNER=0)\n");
		return;
	}
	const running = await request("status").catch(() => undefined);
	if (running) {
		process.stdout.write(`${JSON.stringify(running)}\n`);
		return;
	}
	await mkdir(state, { recursive: true, mode: 0o700 });
	const log = await open(join(state, "runner.log"), "a", 0o600);
	try {
		const child = spawn(
			process.execPath,
			["--import", "tsx", fileURLToPath(import.meta.url), "daemon"],
			{
				cwd: root,
				env: process.env,
				detached: true,
				stdio: ["ignore", log.fd, log.fd, "ipc"],
			},
		);
		await new Promise<void>((done, reject) => {
			const deadline = setTimeout(() => {
				child.kill("SIGTERM");
				reject(
					new Error(
						"local runner startup timed out; check .hobo/ci-local/runner.log",
					),
				);
			}, 10000);
			child.once("message", () => {
				clearTimeout(deadline);
				done();
			});
			child.once("error", (error) => {
				clearTimeout(deadline);
				reject(error);
			});
			child.once("exit", () => {
				clearTimeout(deadline);
				request("status").then(
					() => done(),
					() =>
						reject(
							new Error(
								"local runner failed to start; check .hobo/ci-local/runner.log",
							),
						),
				);
			});
		});
		child.unref();
		process.stdout.write(`${JSON.stringify(await request("status"))}\n`);
	} finally {
		await log.close();
	}
}
main().catch((error) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : "Local runner failed"}\n`,
	);
	process.exitCode = 1;
});
