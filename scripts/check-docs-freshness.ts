import { execFileSync } from "node:child_process";
import path from "node:path";

const CODE_PATTERNS = [
  /^src\//,
  /^scripts\//,
  /^test\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.github\/workflows\//,
  /^\.codex\//,
  /^\.claude\//,
  /^\.cursor\//,
  /^\.mcp\.json$/,
];

const DOC_PATTERNS = [
  /(^|\/)README\.md$/,
  /^docs\//,
  /^archive\//,
  /^competitors\//,
  /^patterns\//,
  /^plans\//,
  /^standards\//,
  /^technologies\//,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^CONTRIBUTING\.md$/,
  /^SECURITY\.md$/,
  /^SUPPORT\.md$/,
  /^CODE_OF_CONDUCT\.md$/,
  /^\.github\/pull_request_template\.md$/,
];

const ALLOW_DOCLESS_PATTERNS = [
  /^docs\//,
  /(^|\/)README\.md$/,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)CONTRIBUTING\.md$/,
  /(^|\/)SECURITY\.md$/,
  /(^|\/)SUPPORT\.md$/,
  /(^|\/)CODE_OF_CONDUCT\.md$/,
  /^\.github\/pull_request_template\.md$/,
  /^\.gitignore$/,
  /^LICENSE$/,
];

const args = new Set(process.argv.slice(2));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedFiles() {
  if (args.has("--staged")) {
    return split(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]));
  }

  const base = baseArg?.slice("--base=".length) ?? process.env.HOBO_DOCS_BASE;
  if (base) {
    return split(git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]));
  }

  return unique([
    ...split(git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])),
    ...split(git(["ls-files", "--others", "--exclude-standard"])),
  ]);
}

function split(output) {
  return output ? output.split(/\r?\n/).map((file) => file.split(path.sep).join("/")) : [];
}

function unique(values) {
  return [...new Set(values)];
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

const files = changedFiles();
const codeFiles = files.filter(
  (file) => matchesAny(file, CODE_PATTERNS) && !matchesAny(file, ALLOW_DOCLESS_PATTERNS),
);
const docFiles = files.filter((file) => matchesAny(file, DOC_PATTERNS));

if (codeFiles.length > 0 && docFiles.length === 0) {
  console.error("Code changed without docs updates.");
  console.error("Update README.md, AGENTS.md, docs/, or another maintained documentation file so docs reflect current state.");
  console.error("Code files:");
  for (const file of codeFiles) console.error(`- ${file}`);
  process.exit(1);
}

console.log(
  codeFiles.length > 0
    ? `Docs freshness OK: ${codeFiles.length} code file(s), ${docFiles.length} doc file(s).`
    : "Docs freshness OK: no code changes detected.",
);
