import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parsePipeline } from "@hobo/ci/execution";
import { localConfig, localParams } from "../src/local-config.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		source: { type: "string" },
		pipeline: { type: "string" },
		ref: { type: "string", default: "HEAD" },
		directory: { type: "string" },
		"work-root": { type: "string" },
	},
});
const [action] = positionals;
const work = values["work-root"]
	? resolve(values["work-root"])
	: join(packageRoot, ".hobo", "work");
const latest = join(work, "latest");

function git(args: string[]): string {
	const env = { ...process.env };
	// A hook's repository selectors must not redirect --source to its own checkout.
	for (const name of [
		"GIT_DIR",
		"GIT_WORK_TREE",
		"GIT_COMMON_DIR",
		"GIT_INDEX_FILE",
		"GIT_OBJECT_DIRECTORY",
		"GIT_ALTERNATE_OBJECT_DIRECTORIES",
		"GIT_PREFIX",
		"GIT_SHALLOW_FILE",
		"GIT_NAMESPACE",
	])
		delete env[name];
	const result = spawnSync("git", args, { encoding: "utf8", env });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr || "Git failed");
	return result.stdout.trim();
}

if (action === "prepare") {
	if (!values.source || !values.pipeline)
		throw new Error(
			"prepare requires --source <Git repo> --pipeline <JSON file>",
		);
	const source = resolve(values.source);
	const pipeline = parsePipeline(
		readFileSync(resolve(values.pipeline), "utf8"),
	);
	const sha = git([
		"-C",
		source,
		"rev-parse",
		"--verify",
		"--end-of-options",
		`${values.ref}^{commit}`,
	]);
	// Fresh directories keep retained Workflow history tied to its original image.
	mkdirSync(work, { recursive: true });
	const directory = mkdtempSync(join(work, "local-"));
	git([
		"-C",
		source,
		"archive",
		"--format=tar.gz",
		"--prefix=source/",
		`--output=${join(directory, "source.tar.gz")}`,
		sha,
	]);
	const base = readFileSync(
		join(packageRoot, "examples/worker/Dockerfile"),
		"utf8",
	);
	writeFileSync(
		join(directory, "Dockerfile"),
		`${base.trim()}\nCOPY source.tar.gz /opt/hobo-ci/source.tar.gz\n`,
	);
	writeFileSync(
		join(directory, ".dockerignore"),
		"*\n!source.tar.gz\n!Dockerfile\n",
	);
	writeFileSync(
		join(directory, "wrangler.jsonc"),
		`${JSON.stringify(localConfig(pipeline, sha, basename(directory)), null, 2)}\n`,
	);
	writeFileSync(
		join(directory, "params.json"),
		`${JSON.stringify(localParams(sha, basename(directory)))}\n`,
	);
	writeFileSync(latest, directory);
	console.log(`Prepared Git commit ${sha} in ${directory}`);
	console.log(
		"Only committed files are included; submodule and Git LFS content must be materialized separately.",
	);
	console.log("Start: pnpm --filter @hobo/ci-cf local:dev");
	console.log("Then:  pnpm --filter @hobo/ci-cf local:trigger");
} else if (action === "dev" || action === "trigger") {
	const directory = values.directory
		? resolve(values.directory)
		: readFileSync(latest, "utf8").trim();
	const config = join(directory, "wrangler.jsonc");
	const args =
		action === "dev"
			? [
					"dev",
					"--local",
					"--ip",
					"127.0.0.1",
					"--persist-to",
					join(directory, "state"),
				]
			: [
					"workflows",
					"trigger",
					"hobo-ci-cf-local",
					"--local",
					"--params",
					readFileSync(join(directory, "params.json"), "utf8"),
				];
	// No pass-through flags, remote mode, deployment or cloud fallback.
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("../bin/wrangler.js", import.meta.resolve("wrangler")),
			),
			...args,
			"--config",
			config,
		],
		{
			stdio: "inherit",
			env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
		},
	);
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} else {
	throw new Error("Use prepare, dev or trigger");
}
