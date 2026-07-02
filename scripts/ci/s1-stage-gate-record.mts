import { writeFile } from "node:fs/promises";

import {
	isValidGreenRecord,
	toRecordJson,
} from "../../src/draft/technical-proofs/s1-stage-gate/src/record.js";
import { runS1StageGateRecord } from "../../src/draft/technical-proofs/s1-stage-gate/src/stage-gate.js";

const workflowRunUrl =
	process.env.GITHUB_SERVER_URL &&
	process.env.GITHUB_REPOSITORY &&
	process.env.GITHUB_RUN_ID
		? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
		: "";

const record = await runS1StageGateRecord({
	commitSha: process.env.GITHUB_SHA ?? "local",
	workflowRunUrl,
});

if (!isValidGreenRecord(record)) {
	console.error("StageGateS1Record failed green validation");
	process.exit(1);
}

const outputPath = "s1-stage-gate-record.json";
await writeFile(
	outputPath,
	`${JSON.stringify(toRecordJson(record), null, 2)}\n`,
	"utf8",
);
console.log(`wrote ${outputPath}`);
