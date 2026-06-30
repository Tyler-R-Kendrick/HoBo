import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMPLEMENTATION_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".cue",
  ".js",
  ".json",
  ".mjs",
  ".mts",
  ".proto",
  ".ts",
  ".wit",
]);

const DOC_ONLY_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);

const TEXT_EXTENSIONS = new Set([
  ".cue",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".proto",
  ".ts",
  ".wit",
]);

const REQUIRED_CHECKS = [
  {
    code: "missing-pact-contract",
    message: "Add an executable PACT contract for each changed service boundary.",
    passes: (evidence) => evidence.hasPactContract,
  },
  {
    code: "missing-protobuf-definition",
    message: "Define changed records, messages, data shapes, and objects in protobuf.",
    passes: (evidence) => evidence.hasProtobufDefinition,
  },
  {
    code: "missing-cue-constraints",
    message: "Add CUE constraints for every protobuf type in the changed package.",
    passes: (evidence) => evidence.hasCueConstraints,
  },
  {
    code: "missing-parse-derived-type",
    message: "Document or implement parse-don't-validate derived types for constrained values.",
    passes: (evidence) => evidence.hasParseDerivedTypes,
  },
  {
    code: "missing-event-architecture",
    message:
      "Name command/event, actor, event-store, materialized-view/projection, snapshot, and read-store behavior.",
    passes: (evidence) => evidence.hasEventArchitecture,
  },
];

export async function checkArchitectureGuardrails({ root = process.cwd(), files } = {}) {
  const normalizedFiles = unique((files ?? []).map(normalizePath));
  const packageRoots = implementationPackageRoots(normalizedFiles);
  const problems = [];

  for (const packageRoot of packageRoots) {
    const evidence = await collectEvidence(root, packageRoot);

    for (const check of REQUIRED_CHECKS) {
      if (!check.passes(evidence)) {
        problems.push({
          code: check.code,
          message: check.message,
          packageRoot,
        });
      }
    }
  }

  return { packageRoots, problems };
}

export function implementationPackageRoots(files) {
  const roots = [];

  for (const file of files) {
    const normalized = normalizePath(file);
    if (!isImplementationFile(normalized)) continue;
    const root = implementationPackageRoot(normalized);
    if (!root) continue;
    roots.push(root);
  }

  return unique(roots);
}

async function collectEvidence(root, packageRoot) {
  const absolutePackageRoot = path.join(root, ...packageRoot.split("/"));
  const files = existsSync(absolutePackageRoot)
    ? await listFiles(absolutePackageRoot, absolutePackageRoot)
    : [];
  const text = [];
  const protoTypes = new Set();
  const cueTexts = [];
  let hasPactContract = false;
  let hasProtobufDefinition = false;

  for (const file of files) {
    const normalized = normalizePath(file);
    const ext = path.extname(file).toLowerCase();

    if (/\.pact\.json$/i.test(normalized) || /(^|\/)pacts?\//i.test(normalized)) {
      hasPactContract = hasPactContract || (await isPactContract(path.join(absolutePackageRoot, file)));
    }
    if (ext === ".proto") {
      hasProtobufDefinition = true;
      for (const typeName of protoTypeNames(await readFile(path.join(absolutePackageRoot, file), "utf8"))) {
        protoTypes.add(typeName);
      }
    }
    if (ext === ".cue") {
      cueTexts.push(await readFile(path.join(absolutePackageRoot, file), "utf8"));
    }

    if (TEXT_EXTENSIONS.has(ext)) {
      text.push(await readFile(path.join(absolutePackageRoot, file), "utf8"));
    }
  }

  const combinedText = text.join("\n");
  const combinedCueText = cueTexts.join("\n");

  return {
    hasPactContract,
    hasProtobufDefinition,
    hasCueConstraints:
      protoTypes.size > 0 && [...protoTypes].every((typeName) => cueDefinesType(combinedCueText, typeName)),
    hasParseDerivedTypes:
      /parse,?\s+don['’]?t\s+validate/i.test(combinedText) &&
      /\b(derived|parsed)\s+(?:domain\s+)?types?\b/i.test(combinedText),
    hasEventArchitecture:
      /\bcommand/i.test(combinedText) &&
      /\bevents?\b/i.test(combinedText) &&
      /\bactors?\b/i.test(combinedText) &&
      /\bevent[-\s]?stores?\b/i.test(combinedText) &&
      /\b(materialized\s+views?|projections?)\b/i.test(combinedText) &&
      /\bsnapshots?\b/i.test(combinedText) &&
      /\bread\s+stores?\b/i.test(combinedText),
  };
}

function protoTypeNames(content) {
  return [...content.matchAll(/\b(?:message|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(
    (match) => match[1],
  );
}

function cueDefinesType(content, typeName) {
  const escaped = escapeRegExp(typeName);
  return new RegExp(`(^|\\n)\\s*#?${escaped}\\s*:`, "m").test(content);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function isPactContract(file) {
  if (!/\.pact\.json$/i.test(file)) return false;

  try {
    const pact = JSON.parse(await readFile(file, "utf8"));
    return Boolean(pact.consumer && pact.provider && Array.isArray(pact.interactions));
  } catch {
    return false;
  }
}

async function listFiles(base, current) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(base, absolute)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, absolute));
    }
  }

  return files;
}

function changedFiles(args) {
  const baseArg = [...args].find((arg) => arg.startsWith("--base="));
  const base = baseArg?.slice("--base=".length) ?? process.env.HOBO_ARCHITECTURE_BASE;

  if (args.has("--staged")) {
    return filterExistingBasePackages(
      split(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])),
      base,
    );
  }

  if (base) {
    return filterExistingBasePackages(
      split(git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`])),
      base,
    );
  }

  return unique([
    ...split(git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])),
    ...split(git(["ls-files", "--others", "--exclude-standard"])),
  ]);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function filterExistingBasePackages(files, base) {
  if (!base) return files;

  return files.filter((file) => {
    const packageRoot = implementationPackageRoot(file);
    return !packageRoot || !gitSucceeds(["cat-file", "-e", `${base}:${packageRoot}`]);
  });
}

function implementationPackageRoot(file) {
  const parts = normalizePath(file).split("/");
  if (parts[0] !== "src" || parts[1] !== "draft" || !parts[2]) return undefined;

  return parts[2] === "epic-reference-implementations" && parts[3]
    ? parts.slice(0, 4).join("/")
    : parts.slice(0, 3).join("/");
}

function split(output) {
  return output ? output.split(/\r?\n/).map(normalizePath) : [];
}

function isImplementationFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (DOC_ONLY_EXTENSIONS.has(ext)) return false;

  const basename = path.basename(file);
  if (basename === "package.json" || basename === "pnpm-lock.yaml" || basename === "pnpm-workspace.yaml") return true;

  return IMPLEMENTATION_EXTENSIONS.has(ext);
}

function normalizePath(file) {
  return file.split(path.sep).join("/");
}

function unique(values) {
  return [...new Set(values)];
}

function formatProblems(problems) {
  const lines = [
    "HoBo architecture guardrails failed for changed implementation packages.",
    "Each changed package must provide PACT, protobuf, CUE, parse-don't-validate, and event architecture evidence before CI.",
  ];

  for (const problem of problems) {
    lines.push(`- ${problem.packageRoot}: ${problem.code} - ${problem.message}`);
  }

  return lines.join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await checkArchitectureGuardrails({ files: changedFiles(args) });

  if (result.problems.length > 0) {
    console.error(formatProblems(result.problems));
    process.exit(1);
  }

  console.log(
    result.packageRoots.length > 0
      ? `Architecture guardrails OK: ${result.packageRoots.length} changed implementation package(s).`
      : "Architecture guardrails OK: no changed implementation packages.",
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}
