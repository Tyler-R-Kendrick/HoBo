/**
 * CLI shell for the last-resort host runner.
 *
 *   node --import tsx src/bin/host-runner.ts [--repo owner/name] [--once]
 *     [--max 10] [--dir <install dir>] [--labels hobo-last-resort]
 *
 * Registers this machine as an ephemeral self-hosted runner for the
 * repository and serves queued jobs until the queue drains (or --once).
 * Needs a token able to mint runner registration tokens (repo admin):
 * HOBO_RB_RUNNER_TOKEN, else VARS_ADMIN_TOKEN, else GITHUB_TOKEN.
 * Linux and macOS only — the Windows runner uses a different bootstrap.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
	pickRunnerAsset,
	queuedRunsPath,
	registrationTokenPath,
	type RunnerAsset,
	runnerConfigArgs,
	runnerDownloadsPath,
	shouldServeAnotherJob,
} from "../host-runner.js";

const API_BASE = process.env.HOBO_RB_API_BASE ?? "https://api.github.com";

interface CliArgs {
	repo: string;
	once: boolean;
	maxIterations: number;
	dir: string;
	labels: string[];
}

function parseArgs(argv: readonly string[]): CliArgs {
	const env = process.env;
	const args: CliArgs = {
		repo: env.HOBO_RB_REPO ?? env.GITHUB_REPOSITORY ?? "",
		once: false,
		maxIterations: 10,
		dir:
			env.HOBO_RB_RUNNER_DIR ??
			path.join(homedir(), ".hobo", "last-resort-runner"),
		labels: ["hobo-last-resort"],
	};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		const value = argv[index + 1];
		if (token === "--repo" && value !== undefined) {
			args.repo = value;
			index += 1;
		} else if (token === "--once") {
			args.once = true;
		} else if (token === "--max" && value !== undefined) {
			const parsed = Number(value);
			if (Number.isInteger(parsed) && parsed > 0) args.maxIterations = parsed;
			index += 1;
		} else if (token === "--dir" && value !== undefined) {
			args.dir = value;
			index += 1;
		} else if (token === "--labels" && value !== undefined) {
			args.labels = value.split(",").filter((label) => label !== "");
			index += 1;
		}
	}
	return args;
}

function apiToken(): string {
	const token =
		process.env.HOBO_RB_RUNNER_TOKEN ??
		process.env.VARS_ADMIN_TOKEN ??
		process.env.GITHUB_TOKEN;
	if (token === undefined || token === "") {
		throw new Error(
			"a token able to mint runner registration tokens is required (HOBO_RB_RUNNER_TOKEN, VARS_ADMIN_TOKEN, or GITHUB_TOKEN)",
		);
	}
	return token;
}

async function api(pathname: string, method = "GET"): Promise<unknown> {
	const response = await fetch(`${API_BASE}${pathname}`, {
		method,
		headers: {
			Authorization: `Bearer ${apiToken()}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "hobo-example-ci-runner-balancing",
		},
	});
	if (!response.ok) {
		throw new Error(`${method} ${pathname} failed with ${response.status}`);
	}
	return response.json();
}

function run(
	command: string,
	commandArgs: readonly string[],
	cwd: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...commandArgs], {
			cwd,
			stdio: "inherit",
			env: {
				...process.env,
				// Agent sandboxes and CI containers often run as root; the
				// runner refuses root without this opt-in.
				RUNNER_ALLOW_RUNASROOT: "1",
			},
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`${command} exited with ${String(code)}`)),
		);
	});
}

async function ensureRunnerInstalled(
	owner: string,
	repo: string,
	dir: string,
): Promise<void> {
	if (existsSync(path.join(dir, "config.sh"))) return;
	if (process.platform !== "linux" && process.platform !== "darwin") {
		throw new Error(
			"last-resort host runner supports linux and macOS only (the Windows runner uses a different bootstrap)",
		);
	}
	const downloads = (await api(runnerDownloadsPath(owner, repo))) as
		| RunnerAsset[]
		| undefined;
	const asset = pickRunnerAsset(
		downloads ?? [],
		process.platform,
		process.arch,
	);
	if (asset === undefined) {
		throw new Error(
			`no actions/runner build for ${process.platform}/${process.arch}`,
		);
	}
	mkdirSync(dir, { recursive: true });
	console.log(`downloading ${asset.filename} ...`);
	const tarball = await fetch(asset.download_url);
	if (!tarball.ok) {
		throw new Error(`runner download failed with ${tarball.status}`);
	}
	const archivePath = path.join(dir, asset.filename);
	writeFileSync(archivePath, Buffer.from(await tarball.arrayBuffer()));
	await run("tar", ["xzf", archivePath], dir);
	console.log(`runner installed in ${dir}`);
}

async function queuedRunCount(owner: string, repo: string): Promise<number> {
	try {
		const body = (await api(queuedRunsPath(owner, repo))) as {
			total_count?: number;
		};
		return typeof body.total_count === "number" ? body.total_count : 0;
	} catch {
		return 0;
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (!args.repo.includes("/")) {
		throw new Error("--repo owner/name (or HOBO_RB_REPO) is required");
	}
	const [owner = "", repo = ""] = args.repo.split("/", 2);

	await ensureRunnerInstalled(owner, repo, args.dir);

	for (let iteration = 0; ; iteration += 1) {
		const queued = await queuedRunCount(owner, repo);
		if (
			!shouldServeAnotherJob({
				queued,
				iteration,
				maxIterations: args.maxIterations,
				once: args.once,
			})
		) {
			console.log(
				`drain complete after ${iteration} job(s); ${queued} run(s) still queued`,
			);
			return;
		}

		const registration = (await api(
			registrationTokenPath(owner, repo),
			"POST",
		)) as { token?: string };
		if (typeof registration.token !== "string") {
			throw new Error("registration-token response had no token");
		}
		const name = `hobo-last-resort-${hostname()}-${process.pid}-${iteration}`;
		console.log(
			`registering ephemeral runner ${name} (labels: ${args.labels.join(",")}; ${queued} queued)`,
		);
		await run(
			"./config.sh",
			runnerConfigArgs({
				repoUrl: `https://github.com/${owner}/${repo}`,
				token: registration.token,
				name,
				labels: args.labels,
			}),
			args.dir,
		);
		// Ephemeral: serves exactly one job, then deregisters and exits.
		await run("./run.sh", [], args.dir);
	}
}

await main();
