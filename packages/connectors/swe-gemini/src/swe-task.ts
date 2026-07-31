import {
	buildSandboxAccessReport,
	extractSweTaskReport,
	runSweTask as runSweTaskShared,
	SANDBOX_REPORT_SCHEMA,
	SWE_TASK_REPORT_SCHEMA,
	sweTaskPolicy,
	type SandboxAccessReport,
	type SweTask,
	type SweTaskReport,
	type SweTaskRunInput as SharedSweTaskRunInput,
	type SweTaskRunResult,
} from "@hobo/swe-shared";

import { SWE_GEMINI_CONNECTOR } from "./connector.js";

// Thin vendor facade: shared SWE-task engine + this package's connector id.

export {
	buildSandboxAccessReport,
	extractSweTaskReport,
	SANDBOX_REPORT_SCHEMA,
	SWE_TASK_REPORT_SCHEMA,
	sweTaskPolicy,
	type SandboxAccessReport,
	type SweTask,
	type SweTaskReport,
	type SweTaskRunResult,
};

export type SweTaskRunInput = Omit<SharedSweTaskRunInput, "connector">;

export async function runSweTask(
	input: SweTaskRunInput,
): Promise<SweTaskRunResult> {
	return runSweTaskShared({ ...input, connector: SWE_GEMINI_CONNECTOR });
}
