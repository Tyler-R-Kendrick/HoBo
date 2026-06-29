import { readdir, readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCAN_PATHS = ["docs", "README.md", "CLAUDE.md"];

export async function checkDesignDocs({ root, files } = {}) {
  const targetFiles = files ?? (await collectMarkdownFiles(root));
  const markdownByFile = new Map();
  const anchorsByFile = new Map();
  const problems = [];

  for (const file of targetFiles) {
    const absolute = path.isAbsolute(file) ? file : path.join(root, file);
    const relative = normalizePath(path.relative(root, absolute));
    const content = await readFile(absolute, "utf8");
    markdownByFile.set(relative, content);
    anchorsByFile.set(relative, extractAnchors(content));
  }

  for (const [file, content] of markdownByFile) {
    problems.push(...checkRelativeLinks({ root, file, content, anchorsByFile }));
  }
  problems.push(...(await checkGlossary({ root })));
  problems.push(...(await checkAdrReferences({ root, markdownByFile })));
  problems.push(...checkSdkDisambiguation({ markdownByFile }));
  problems.push(...(await checkEventFamilies({ root, markdownByFile })));

  return { problems };
}

async function checkEventFamilies({ root, markdownByFile }) {
  const catalogPath = path.join(root, "docs", "design", "event-families.md");
  if (!fs.existsSync(catalogPath)) {
    return [
      {
        code: "missing-event-catalog",
        file: "docs/design/event-families.md",
        line: 1,
        message: "canonical event-family catalog is missing",
      },
    ];
  }

  const catalog = await readFile(catalogPath, "utf8");
  const allowedFamilies = new Set(
    [...catalog.matchAll(/`([a-z][a-z0-9-]*)\.(?:\*|[A-Z][A-Za-z0-9*]*)`/g)].map(
      (match) => match[1],
    ),
  );
  const problems = [];

  for (const [file, content] of markdownByFile) {
    if (file === "docs/design/event-families.md") continue;

    for (const match of content.matchAll(
      /`([a-z][a-z0-9-]*)\.(?:\*|[A-Z][A-Za-z0-9*]*)`/g,
    )) {
      const family = match[1];
      if (!allowedFamilies.has(family)) {
        problems.push({
          code: "unknown-event-family",
          file,
          line: lineNumberAt(content, match.index),
          target: match[0].replace(/`/g, ""),
          message: `event family ${family}.* is not listed in docs/design/event-families.md`,
        });
      }
    }
  }

  return problems;
}

function checkSdkDisambiguation({ markdownByFile }) {
  const problems = [];

  for (const [file, content] of markdownByFile) {
    if (!content.includes("hobo:sdk") || !content.includes("@hobo/sdk")) {
      continue;
    }

    const namesWitContract = /\bhobo:sdk\b[\s\S]{0,160}\bWIT (?:contract|package)\b|\bWIT (?:contract|package)\b[\s\S]{0,160}\bhobo:sdk\b/i.test(
      content,
    );
    const namesOperatorSdk = /@hobo\/sdk[\s\S]{0,160}\boperator(?:\/self-host)? SDK\b|\boperator(?:\/self-host)? SDK\b[\s\S]{0,160}@hobo\/sdk/i.test(
      content,
    );

    if (!namesWitContract || !namesOperatorSdk) {
      problems.push({
        code: "missing-sdk-disambiguation",
        file,
        line: firstLineContaining(content, "hobo:sdk"),
        target: "hobo:sdk/@hobo/sdk",
        message:
          "docs mentioning both hobo:sdk and @hobo/sdk must disambiguate WIT contract/package vs operator SDK",
      });
    }
  }

  return problems;
}

async function checkAdrReferences({ root, markdownByFile }) {
  const adrIndexPath = path.join(root, "docs", "design", "adr", "README.md");
  if (!fs.existsSync(adrIndexPath)) return [];

  const adrIndex = await readFile(adrIndexPath, "utf8");
  const documentedGaps = documentedAdrGaps(
    markdownByFile.get("docs/design/traceability.md") ?? "",
  );
  const indexed = new Set(
    [...adrIndex.matchAll(/\|\s*(\d{4})\s*\|/g)].map(
      (match) => `ADR-${match[1]}`,
    ),
  );
  const problems = [];

  for (const [file, content] of markdownByFile) {
    for (const match of content.matchAll(/\bADR-(\d{4})\b/g)) {
      const adrId = `ADR-${match[1]}`;
      if (file === "docs/design/traceability.md" && documentedGaps.has(adrId)) {
        continue;
      }

      if (!indexed.has(adrId)) {
        problems.push({
          code: "unknown-adr-reference",
          file,
          line: lineNumberAt(content, match.index),
          target: adrId,
          message: `${adrId} is not listed in docs/design/adr/README.md`,
        });
      }
    }
  }

  return problems;
}

function documentedAdrGaps(traceability) {
  const gapLines = [];
  const lines = traceability.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("Explicit numbering gaps")) continue;

    gapLines.push(line);
    for (const continuation of lines.slice(index + 1)) {
      if (!/^\s+ADR-/.test(continuation)) break;
      gapLines.push(continuation);
    }
    break;
  }

  return new Set(gapLines.join(" ").match(/\bADR-\d{4}\b/g) ?? []);
}

async function checkGlossary({ root }) {
  const glossaryPath = path.join(root, "docs", "design", "glossary.md");
  if (!fs.existsSync(glossaryPath)) {
    return [
      {
        code: "missing-glossary",
        file: "docs/design/glossary.md",
        line: 1,
        message: "canonical glossary is missing",
      },
    ];
  }

  const content = await readFile(glossaryPath, "utf8");
  const seen = new Map();
  const problems = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim().startsWith("|")) return;
    if (/^\|\s*-+/.test(line)) return;
    if (/^\|\s*term\s*\|/i.test(line)) return;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.replace(/`/g, "").trim());
    const [term, definition] = cells;
    if (!term || !definition) return;

    const key = term.toLowerCase();
    if (seen.has(key)) {
      problems.push({
        code: "duplicate-glossary-term",
        file: "docs/design/glossary.md",
        line: index + 1,
        target: term,
        message: `duplicate canonical glossary term: ${term}`,
      });
      return;
    }

    seen.set(key, { term, definition });
  });

  return problems;
}

function checkRelativeLinks({ root, file, content, anchorsByFile }) {
  const problems = [];
  const linkPattern = /!?\[[^\]]*]\((?!https?:\/\/|mailto:|#)([^)\s]+)(#[^)]+)?\)/g;
  const localAnchorPattern = /!?\[[^\]]*]\(#([^)]+)\)/g;
  let match;

  while ((match = localAnchorPattern.exec(content)) !== null) {
    const expectedAnchor = match[1].toLowerCase();
    const fileAnchors = anchorsByFile.get(file) ?? extractAnchors(content);

    if (!fileAnchors.has(expectedAnchor)) {
      problems.push({
        code: "broken-anchor",
        file,
        line: lineNumberAt(content, match.index),
        target: match[0],
        message: `missing anchor #${expectedAnchor} in ${file}`,
      });
    }
  }

  while ((match = linkPattern.exec(content)) !== null) {
    const [raw, target, anchor = ""] = match;
    const line = lineNumberAt(content, match.index);
    const cleanTargetWithFragment = decodeURI(target.replace(/^<|>$/g, ""));
    const [cleanTarget, inlineFragment = ""] = cleanTargetWithFragment.split("#");
    const linkAnchor = anchor || (inlineFragment ? `#${inlineFragment}` : "");

    if (!cleanTarget.endsWith(".md")) {
      continue;
    }

    const absoluteTarget = path.resolve(path.dirname(path.join(root, file)), cleanTarget);
    const relativeTarget = normalizePath(path.relative(root, absoluteTarget));

    if (!fs.existsSync(absoluteTarget)) {
      problems.push({
        code: "broken-link",
        file,
        line,
        target: cleanTarget,
        message: `missing markdown link target: ${cleanTarget}`,
      });
      continue;
    }

    if (linkAnchor) {
      const targetAnchors =
        anchorsByFile.get(relativeTarget) ??
        extractAnchors(fs.readFileSync(absoluteTarget, "utf8"));
      const expectedAnchor = linkAnchor.slice(1).toLowerCase();

      if (!targetAnchors.has(expectedAnchor)) {
        problems.push({
          code: "broken-anchor",
          file,
          line,
          target: raw,
          message: `missing anchor ${linkAnchor} in ${cleanTarget}`,
        });
      }
    }
  }

  return problems;
}

function extractAnchors(markdown) {
  const anchors = new Set();

  markdown.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) return;
    anchors.add(slugifyHeading(heading[2]));
  });

  return anchors;
}

function slugifyHeading(heading) {
  return heading
    .replace(/`([^`]+)`/g, "$1")
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function firstLineContaining(content, needle) {
  const index = content.indexOf(needle);
  return index === -1 ? 1 : lineNumberAt(content, index);
}

async function collectMarkdownFiles(root) {
  const files = [];

  for (const scanPath of DEFAULT_SCAN_PATHS) {
    const absolute = path.join(root, scanPath);
    if (!fs.existsSync(absolute)) continue;

    if (scanPath.endsWith(".md")) {
      files.push(scanPath);
      continue;
    }

    files.push(...(await walkMarkdown(root, absolute)));
  }

  return files;
}

async function walkMarkdown(root, dir) {
  const found = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkMarkdown(root, absolute)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(normalizePath(path.relative(root, absolute)));
    }
  }

  return found;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await checkDesignDocs({ root });

  for (const problem of result.problems) {
    console.error(
      `${problem.file}:${problem.line} ${problem.code} - ${problem.message}`,
    );
  }

  if (result.problems.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
