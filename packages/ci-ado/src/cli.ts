#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	loadAdoProject,
	renderAzurePipeline,
	runAdoPipeline,
} from "./pipeline.js";

function logText(value: string): string {
	return value.replace(/##vso\[/gi, "##vso%5B").replaceAll("##[", "##%5B");
}

async function main(): Promise<void> {
	const [command, configPath, workspace = ".", ...extra] =
		process.argv.slice(2);
	if ((command !== "run" && command !== "yaml") || !configPath || extra.length)
		throw new Error("usage: hobo-ci-ado <run|yaml> <config-path> [workspace]");
	const root = resolve(workspace);
	const { project, pipeline } = await loadAdoProject(root, configPath);
	if (command === "yaml") {
		process.stdout.write(renderAzurePipeline(project, pipeline, configPath));
		return;
	}
	const stop = new AbortController();
	const cancel = () => stop.abort(new Error("process interrupted"));
	process.on("SIGINT", cancel);
	process.on("SIGTERM", cancel);
	try {
		const result = await runAdoPipeline(root, pipeline, {
			signal: stop.signal,
		});
		for (const step of result.steps) {
			process.stdout.write(`${step.id}: exit ${step.exitCode}\n`);
			// Escape ADO logging commands, which the agent recognizes even after a prefix.
			for (const line of step.stdout.split("\n"))
				if (line) process.stdout.write(`  ${logText(line)}\n`);
			for (const line of step.stderr.split("\n"))
				if (line) process.stderr.write(`  ${logText(line)}\n`);
		}
		process.stdout.write(`HoBo CI: ${result.status} (${result.id})\n`);
		process.exitCode = result.status === "succeeded" ? 0 : 1;
	} finally {
		process.removeListener("SIGINT", cancel);
		process.removeListener("SIGTERM", cancel);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error: Error) => {
		process.stderr.write(
			`HoBo CI ADO: ${logText(error.message.slice(0, 2048)).replaceAll("\n", "\n  ")}\n`,
		);
		process.exitCode = 1;
	});
}
