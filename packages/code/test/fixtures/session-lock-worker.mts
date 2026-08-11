import { appendFileSync } from "node:fs";

import type { MuxRunner } from "../../src/mux.js";
import { createResidentSessionRuntime } from "../../src/resident-session-runtime.js";

const [dataDir, marker] = process.argv.slice(2);
if (!dataDir || !marker)
	throw new Error("usage: session-lock-worker <dataDir> <marker>");

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
