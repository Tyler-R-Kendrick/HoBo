#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), ".github");
const workflowDir = join(root, "workflows");
const disabledWorkflowDir = join(root, "workflows-disabled");
const recognizedFiles = existsSync(workflowDir)
	? readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name))
	: [];
const files = existsSync(disabledWorkflowDir)
	? readdirSync(disabledWorkflowDir)
			.filter((name) => /\.ya?ml$/.test(name))
			.sort()
	: [];
const errors: string[] = [];
// The user-authorized manual acceptance recipe is the only enabled workflow.
// Pin its complete reviewed surface rather than accepting arbitrary YAML under
// the approved filename (extra events/jobs/permissions would otherwise bypass
// the disabled-CI policy). Updating it requires an explicit policy review.
const acceptanceFile = "hobo-ci-acceptance.yml";
const acceptanceDigest =
	"cd307e582a3e4157762bd96e51764178f90c4d03f56118a2acf2bb1d84ec302b";
for (const file of recognizedFiles) {
	if (file !== acceptanceFile) {
		errors.push(
			`${file}: enabled workflow is not the approved manual HoBo acceptance workflow`,
		);
		continue;
	}
	const text = readFileSync(join(workflowDir, file), "utf8").replaceAll(
		"\r\n",
		"\n",
	);
	if (createHash("sha256").update(text).digest("hex") !== acceptanceDigest)
		errors.push(
			`${file}: manual HoBo acceptance workflow differs from its reviewed recipe`,
		);
}

for (const file of files) {
	const path = join(disabledWorkflowDir, file);
	const text = readFileSync(path, "utf8");
	const lines = text.split(/\r?\n/);
	const jobsIndex = lines.findIndex((line) => line === "jobs:");
	if (jobsIndex === -1) {
		errors.push(file + ": missing jobs section");
	} else {
		const jobStarts = lines
			.map((line, index) => ({ line, index }))
			.filter(
				(entry) =>
					entry.index > jobsIndex && /^  [A-Za-z0-9_-]+:$/.test(entry.line),
			)
			.map((entry) => entry.index);
		for (const [position, start] of jobStarts.entries()) {
			const end = jobStarts[position + 1] ?? lines.length;
			if (
				!lines
					.slice(start, end)
					.some((line) => line.trim() === "if: ${{ false }}")
			) {
				errors.push(
					file + ":" + (start + 1) + ": hosted Actions job is not disabled",
				);
			}
		}
	}
	const firstCheckout = lines.findIndex((line) =>
		line.includes("actions/checkout@"),
	);
	const firstSetupNode = lines.findIndex((line) =>
		line.includes("actions/setup-node@"),
	);

	if (
		firstSetupNode !== -1 &&
		(firstCheckout === -1 || firstCheckout > firstSetupNode)
	) {
		errors.push(`${file}: actions/checkout must run before actions/setup-node`);
	}
	if (/cache:\s*(npm|yarn)\b/.test(text)) {
		errors.push(`${file}: pnpm repo must not use npm/yarn setup-node cache`);
	}
	if (/\bnpm ci\b|\bnpm install\b|\byarn\b/.test(text)) {
		errors.push(`${file}: workflow must not install with npm/yarn`);
	}
	if (/package-lock\.json|yarn\.lock/.test(text)) {
		errors.push(`${file}: workflow must not reference npm/yarn lockfiles`);
	}
	if (
		/cache:\s*pnpm\b/.test(text) &&
		!/cache-dependency-path:\s*pnpm-lock\.yaml\b/.test(text)
	) {
		errors.push(
			`${file}: pnpm cache must set cache-dependency-path: pnpm-lock.yaml`,
		);
	}
	if (firstSetupNode !== -1 && !/node-version:\s*24\b/.test(text)) {
		errors.push(`${file}: Node version must be explicit and set to 24`);
	}
}

if (errors.length > 0) {
	for (const error of errors) console.error(`ERR ${error}`);
	process.exit(1);
}
console.log(
	`actions lint ok: ${files.length} disabled workflow file(s); ${recognizedFiles.length} reviewed manual HoBo acceptance workflow(s)`,
);
