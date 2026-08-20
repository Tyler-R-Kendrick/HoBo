import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCliDocs } from "./check-cli-docs.ts";
import { checkCompetitorDocs } from "./check-competitor-docs.ts";
import { checkDesignDocs } from "./check-design-docs.ts";

type Problem = {
	file: string;
	line: number;
	code?: string;
	command?: string;
	message: string;
};

const args = new Set(process.argv.slice(2));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base =
	baseArg?.slice("--base=".length) ??
	process.env.HOBO_LINT_BASE ??
	"origin/main";
const staged = args.has("--staged");
const all = args.has("--all");

function capture(command: string, commandArgs: string[]) {
	const result = spawnSync(command, commandArgs, {
		encoding: "utf8",
		shell: false,
	});
	if (result.status !== 0) return "";
	return result.stdout.trim();
}

function splitFiles(output: string) {
	return output
		.split(/\r?\n/)
		.map((file) => file.trim().split(path.sep).join("/"))
		.filter(Boolean);
}

function changedFiles() {
	if (all) return splitFiles(capture("git", ["ls-files"]));
	if (staged)
		return splitFiles(
			capture("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]),
		);
	const mergeBase = capture("git", ["merge-base", base, "HEAD"]) || base;
	return splitFiles(
		capture("git", [
			"diff",
			"--name-only",
			"--diff-filter=ACMR",
			mergeBase,
			"HEAD",
		]),
	);
}

function isMarkdown(file: string) {
	return file.endsWith(".md") && !file.includes("/node_modules/");
}

function cliFiles(markdownFiles: string[]) {
	if (markdownFiles.includes("docs/design/cli-spec.md")) return undefined;
	return markdownFiles.filter((file) => {
		return (
			file === "README.md" ||
			file === "CLAUDE.md" ||
			file === "docs/implementation-plan.md" ||
			file.startsWith("docs/design/")
		);
	});
}

function designFiles(markdownFiles: string[]) {
	const fullScanInputs = new Set([
		"docs/design/glossary.md",
		"docs/design/adr/index.md",
		"docs/design/event-families.md",
		"docs/design/traceability.md",
	]);
	if (markdownFiles.some((file) => fullScanInputs.has(file))) return undefined;
	return markdownFiles.filter((file) => {
		return (
			file === "README.md" ||
			file === "CLAUDE.md" ||
			file === "docs/index.md" ||
			file === "docs/agent-tooling.md" ||
			file.startsWith("docs/design/")
		);
	});
}

function competitorTouched(markdownFiles: string[]) {
	return markdownFiles.some((file) => file.startsWith("docs/competitors/"));
}

function printProblems(label: string, problems: Problem[]) {
	for (const problem of problems) {
		const target = problem.command ?? problem.code ?? label;
		console.error(
			`${problem.file}:${problem.line} ${target} - ${problem.message}`,
		);
	}
}

const files = changedFiles();
const markdownFiles = [...new Set(files.filter(isMarkdown))].sort();

if (markdownFiles.length === 0) {
	console.log("lint: no changed markdown files; skipping docs linters.");
	process.exit(0);
}

const cliTargets = cliFiles(markdownFiles);
const designTargets = designFiles(markdownFiles);
const cliProblems =
	cliTargets?.length === 0
		? []
		: (await checkCliDocs({ root, files: cliTargets })).problems;
const designProblems =
	designTargets?.length === 0
		? []
		: (await checkDesignDocs({ root, files: designTargets })).problems;
// The corpus is cross-referential — one changed capture can invalidate a category
// page or the generated matrix — so any touch re-checks the whole of it.
const competitorProblems = competitorTouched(markdownFiles)
	? (await checkCompetitorDocs({ root })).problems
	: [];

console.log(
	[
		`lint: markdown changed=${markdownFiles.length}`,
		`cli=${cliTargets ? cliTargets.length : "full"}`,
		`design=${designTargets ? designTargets.length : "full"}`,
		`competitors=${competitorTouched(markdownFiles) ? "full" : "skipped"}`,
	].join(" "),
);

printProblems("cli-docs", cliProblems);
printProblems("design-docs", designProblems);
printProblems("competitor-docs", competitorProblems);

if (
	cliProblems.length > 0 ||
	designProblems.length > 0 ||
	competitorProblems.length > 0
) {
	process.exit(1);
}
