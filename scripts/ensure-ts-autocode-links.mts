import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;
const marker = join(
	root,
	"external/ts-autocode/packages/training/node_modules/@agentv/core/package.json",
);

async function linked(): Promise<boolean> {
	try {
		await access(marker);
		return true;
	} catch {
		return false;
	}
}

if (!(await linked())) {
	await exec(
		"pnpm",
		[
			"install",
			"--filter",
			"ts-autocode-training...",
			"--config.confirmModulesPurge=false",
			"--prefer-offline",
		],
		{ cwd: root, env: process.env },
	);
	if (!(await linked())) {
		throw new Error(
			"ts-autocode-training dependencies are not linked; run pnpm install after pins:fetch",
		);
	}
}
