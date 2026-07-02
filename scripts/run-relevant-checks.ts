import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

import { commandForPlatform } from "./lib/env.ts";
import { selectRelevantChecks, type Check } from "./relevant-check-policy.js";

const args = new Set(process.argv.slice(2));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const base =
	baseArg?.slice("--base=".length) ?? process.env.HOBO_CHECK_BASE ?? "HEAD~1";
const staged = args.has("--staged");
const all = args.has("--all");
const explain = args.has("--explain");
const includeBuild = args.has("--build");
const finalValidation = args.has("--final");
const parallelLimit = Math.max(
	1,
	Number.parseInt(process.env.HOBO_RELEVANT_CHECK_CONCURRENCY ?? "4", 10) || 4,
);

type ChangedFileRecord = {
	path: string;
	status: string;
};

function run(command: string, commandArgs: string[]) {
	const printable = [command, ...commandArgs].join(" ");
	console.log(`\n▶ ${printable}`);
	const platformCommand = commandForPlatform(command, commandArgs);
	const result = spawnSync(platformCommand.command, platformCommand.args, {
		stdio: "inherit",
		shell: false,
	});
	return result.status ?? 1;
}

function runAsync(check: Check): Promise<number> {
	const printable = [check.command, ...check.args].join(" ");
	console.log(`\n▶ ${printable}`);
	const platformCommand = commandForPlatform(check.command, check.args);
	const child = spawn(platformCommand.command, platformCommand.args, {
		stdio: "inherit",
		shell: false,
	});

	return new Promise<number>((resolve) => {
		child.once("error", () => resolve(1));
		child.once("exit", (status) => resolve(status ?? 1));
	});
}

function broadSweepScript(check: Check): string | undefined {
	if (check.command !== "pnpm" || check.args[0] !== "run") return undefined;
	const script = check.args[1];
	return (
		[
			"check:all",
			"test:all",
			"test:contract",
			"test:contract:consumer",
			"test:contract:provider",
			"test:unit",
			"test:unit:quiet",
			"validate:final",
		] as readonly (string | undefined)[]
	).includes(script)
		? script
		: undefined;
}

function assertNoImplicitBroadSweeps(checks: Check[]) {
	if (all || finalValidation) return;

	const broadChecks = checks
		.map((check) => ({ check, script: broadSweepScript(check) }))
		.filter((entry): entry is { check: Check; script: string } =>
			Boolean(entry.script),
		);

	if (broadChecks.length === 0) return;

	console.error(
		"Relevant-check policy selected broad root sweep(s) without --final or --all:",
	);
	for (const { check, script } of broadChecks) {
		console.error(`- pnpm run ${script}: ${check.reason}`);
	}
	console.error(
		"Use changed-scope, workspace-prefix, or root-only checks while iterating.",
	);
	process.exit(1);
}

async function runBounded(
	checks: Check[],
	concurrency: number,
): Promise<number[]> {
	const statuses = new Array<number>(checks.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < checks.length) {
			const index = nextIndex;
			nextIndex += 1;
			statuses[index] = await runAsync(checks[index]!);
		}
	}

	const workerCount = Math.min(concurrency, checks.length);
	await Promise.all(Array.from({ length: workerCount }, worker));
	return statuses;
}

function capture(command: string, commandArgs: string[]) {
	const platformCommand = commandForPlatform(command, commandArgs);
	const result = spawnSync(platformCommand.command, platformCommand.args, {
		encoding: "utf8",
		shell: false,
	});
	if (result.status !== 0) return "";
	return result.stdout.trim();
}

function parseChangedFileRecords(raw: string): ChangedFileRecord[] {
	return raw
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const [status, firstPath, secondPath] = line.split("\t");
			return { status, path: secondPath ?? firstPath };
		})
		.filter((record): record is ChangedFileRecord => Boolean(record.path));
}

function changedFileRecords(): ChangedFileRecord[] {
	if (all) {
		return capture("git", ["ls-files"])
			.split(/\r?\n/)
			.filter(Boolean)
			.map((file) => ({ status: "M", path: file }));
	}
	if (staged) {
		return parseChangedFileRecords(
			capture("git", [
				"diff",
				"--cached",
				"--name-status",
				"--find-renames=100%",
				"--diff-filter=ACMR",
			]),
		);
	}
	return parseChangedFileRecords(
		capture("git", [
			"diff",
			"--name-status",
			"--find-renames=100%",
			"--diff-filter=ACMR",
			diffBase,
			"HEAD",
		]),
	);
}

function workspaceTestFiles(records: ChangedFileRecord[]) {
	return records
		.filter((record) => record.status !== "R100")
		.map((record) => record.path);
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value).sort(([left], [right]) =>
			left.localeCompare(right),
		);
		return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

function rootPackageJsonScriptsOnlyChanged() {
	if (staged || all) return false;
	const beforeRaw = capture("git", ["show", `${diffBase}:package.json`]);
	if (!beforeRaw || !fs.existsSync("package.json")) return false;

	try {
		const before = JSON.parse(beforeRaw) as Record<string, unknown>;
		const after = JSON.parse(fs.readFileSync("package.json", "utf8")) as Record<
			string,
			unknown
		>;
		delete before.scripts;
		delete after.scripts;
		return stableJson(before) === stableJson(after);
	} catch {
		return false;
	}
}

const diffBase = capture("git", ["merge-base", base, "HEAD"]) || base;
const records = changedFileRecords();
const files = records.map((record) => record.path);
if (files.length === 0) {
	console.log("No changed files; skipping relevant checks.");
	process.exit(0);
}

const { checks, scopes } = selectRelevantChecks({
	files,
	base,
	workspaceTestFiles: workspaceTestFiles(records),
	staged,
	all,
	includeBuild,
	includeBroadSweeps: all || finalValidation,
	rootPackageJsonScriptsOnlyChanged: rootPackageJsonScriptsOnlyChanged(),
});

console.log(`Changed files: ${files.length}`);
console.log(`Detected scope: ${scopes.join(", ") || "standard"}`);
for (const check of checks)
	console.log(`- ${check.command} ${check.args.join(" ")} (${check.reason})`);

assertNoImplicitBroadSweeps(checks);

if (explain) process.exit(0);

for (const check of checks.filter((check) => check.serial)) {
	const status = run(check.command, check.args);
	if (status !== 0) process.exit(status);
}

const parallelChecks = checks.filter((check) => !check.serial);
if (parallelChecks.length > 0) {
	console.log(
		`Running ${parallelChecks.length} parallel-capable check(s) with concurrency ${parallelLimit}.`,
	);
}
const statuses = await runBounded(parallelChecks, parallelLimit);
const failed = statuses.find((status) => status !== 0);
if (failed) process.exit(failed);
