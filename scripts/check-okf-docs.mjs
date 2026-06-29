import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(root, "docs");
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    if (entry.isFile() && entry.name.endsWith(".md")) checkFile(absolute);
  }
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function checkFile(file) {
  const name = path.basename(file);
  const content = fs.readFileSync(file, "utf8");

  if (name === "index.md") {
    if (content.startsWith("---\n")) problems.push(`${rel(file)}: OKF index files must not use concept frontmatter`);
    return;
  }

  if (name === "log.md") {
    if (content.startsWith("---\n")) problems.push(`${rel(file)}: OKF log files must not use concept frontmatter`);
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (line.startsWith("## ") && !/^## \d{4}-\d{2}-\d{2}$/.test(line)) {
        problems.push(`${rel(file)}:${index + 1}: OKF log date headings must use YYYY-MM-DD`);
      }
    }
    return;
  }

  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    problems.push(`${rel(file)}: OKF concept documents need YAML frontmatter`);
    return;
  }

  if (!/^type:\s*\S/m.test(match[1])) {
    problems.push(`${rel(file)}: OKF concept frontmatter needs non-empty type`);
  }
}

if (!fs.existsSync(docsRoot)) {
  problems.push("docs/: OKF bundle root is missing");
} else {
  walk(docsRoot);
}

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log("OKF docs conformance ok");
