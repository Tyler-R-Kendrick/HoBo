import {
	appendFileSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";

import type { MuxRunner } from "../../src/mux.js";

const [dataDir, marker, role, deadOwner] = process.argv.slice(2);
if (!dataDir || !marker)
	throw new Error("usage: session-lock-worker <dataDir> <marker>");

if (role && deadOwner) {
	const fs = createRequire(import.meta.url)(
		"node:fs",
	) as typeof import("node:fs");
	const originalReadFile = fs.readFileSync;
	const originalUnlink = fs.unlinkSync;
	const originalLink = fs.linkSync;
	const originalRename = fs.renameSync;
	const observed = `${marker}.observed`;
	const firstLeading = `${marker}.first-leading`;
	const acquired = `${marker}.first-acquired`;
	let sawDeadOwner = false;
	const waitFor = (condition: () => boolean): void => {
		const sleep = new Int32Array(new SharedArrayBuffer(4));
		const deadline = Date.now() + 5_000;
		while (!condition()) {
			if (Date.now() >= deadline)
				throw new Error("lock race fixture timed out");
			Atomics.wait(sleep, 0, 0, 10);
		}
	};
	fs.readFileSync = ((path, ...args) => {
		const value = originalReadFile(path, ...args);
		if (
			String(path).endsWith(".lock") &&
			String(value) === deadOwner &&
			!sawDeadOwner
		) {
			sawDeadOwner = true;
			appendFileSync(observed, `${role}\n`);
			if (role === "second") waitFor(() => existsSync(firstLeading));
		}
		return value;
	}) as typeof fs.readFileSync;
	fs.unlinkSync = ((path) => {
		if (sawDeadOwner && String(path).endsWith(".lock")) {
			if (role === "first") writeFileSync(firstLeading, "1");
			waitFor(
				() => readFileSync(observed, "utf8").trim().split("\n").length === 2,
			);
			if (role === "second") {
				waitFor(
					() => existsSync(acquired) && readFileSync(acquired, "utf8") === "1",
				);
			}
		}
		return originalUnlink(path);
	}) as typeof fs.unlinkSync;
	fs.linkSync = ((existingPath, newPath) => {
		const result = originalLink(existingPath, newPath);
		if (sawDeadOwner && role === "first" && String(newPath).endsWith(".lock")) {
			writeFileSync(acquired, "1");
		}
		return result;
	}) as typeof fs.linkSync;
	fs.renameSync = ((oldPath, newPath) => {
		const result = originalRename(oldPath, newPath);
		if (
			sawDeadOwner &&
			role === "first" &&
			String(newPath).includes(".reclaim-")
		) {
			writeFileSync(firstLeading, "1");
		}
		return result;
	}) as typeof fs.renameSync;
	syncBuiltinESMExports();
}

const { createResidentSessionRuntime } = await import(
	"../../src/resident-session-runtime.js"
);

const tmux: MuxRunner = {
	run: async (args) => {
		if (args[0] === "new-window") {
			appendFileSync(marker, `${process.pid}\n`, "utf8");
			await new Promise((resolve) => setTimeout(resolve, 200));
			return { code: 0, stdout: `%${process.pid}\n` };
		}
		return { code: 0, stdout: "" };
	},
};
const runtime = createResidentSessionRuntime({ dataDir, tmux });
try {
	await runtime.createTab("task-process-lock", 1n, `worker-${process.pid}`);
} catch (error) {
	if (
		!(error instanceof Error) ||
		!/(busy|expected revision)/u.test(error.message)
	)
		throw error;
	process.exitCode = 2;
} finally {
	runtime.close();
}
