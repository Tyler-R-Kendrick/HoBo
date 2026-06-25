import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs", "design");
const contractPath = path.join(docsRoot, "sdk-contracts.md");
const designIndexPath = path.join(docsRoot, "README.md");

const requiredSurfaces = [
  {
    heading: "### `.allow(...verbs)`",
    implementation: "HOBO-70",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "narrow", "dynamic", "deny-ceiling"],
  },
  {
    heading: "### `crossApp(name)`",
    implementation: "HOBO-43",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "inferred", "policy deny-ceiling"],
  },
  {
    heading: "### `CrossAppBinding.token()`",
    implementation: "HOBO-235",
    conformance: "HOBO-54",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "escape hatch", "subset"],
  },
  {
    heading: "### `approveDefaults(...)`",
    implementation: "HOBO-62",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "approved default providers"],
  },
  {
    heading: "### `autoApprove(...)`",
    implementation: "HOBO-133",
    conformance: "HOBO-223",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "off by default", "production"],
  },
  {
    heading: "### `camp(name, options)`",
    implementation: "HOBO-62",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "idiom-layer-only", "semantics annex"],
  },
  {
    heading: "### `yard(name, options)`",
    implementation: "HOBO-62",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "idiom-layer-only", "semantics annex"],
  },
  {
    heading: "### `junction(name, options)`",
    implementation: "HOBO-62",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "idiom-layer-only", "semantics annex"],
  },
  {
    heading: "### `agent()` name collision",
    implementation: "HOBO-88",
    conformance: "HOBO-32",
    requiredTerms: ["Signature.", "Semantics.", "Default.", "@hobo/runtime", "@hobo/sdk", "alias"],
  },
];

const importOwners = new Map([
  ["api", "@hobo/bindles"],
  ["auth", "@hobo/bindles"],
  ["bindle", "@hobo/bindles"],
  ["bucket", "@hobo/bindles"],
  ["crossApp", "@hobo/bindles"],
  ["experiment", "@hobo/bindles"],
  ["flag", "@hobo/bindles"],
  ["kv", "@hobo/bindles"],
  ["rollout", "@hobo/bindles"],
  ["slo", "@hobo/bindles"],
  ["trainable", "@hobo/bindles"],
  ["websocket", "@hobo/bindles"],
  ["camp", "@hobo/camps"],
  ["yard", "@hobo/yards"],
  ["junction", "@hobo/junctions"],
  ["defineResource", "@hobo/sdk"],
  ["dispatcher", "@hobo/sdk"],
  ["generateProvider", "@hobo/sdk"],
  ["policyPack", "@hobo/sdk"],
  ["rule", "@hobo/sdk"],
  ["runbook", "@hobo/sdk"],
  ["runner", "@hobo/sdk"],
  ["waiver", "@hobo/sdk"],
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(entryPath);
    }
    return entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function sectionFor(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const next = markdown.indexOf("\n### ", start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

function importedBindingName(specifier) {
  return specifier
    .trim()
    .replace(/^type\s+/, "")
    .split(/\s+as\s+/i)[0]
    .trim();
}

function validateContractDoc() {
  if (!fs.existsSync(contractPath)) {
    fail("docs/design/sdk-contracts.md is missing");
    return;
  }

  const contract = read(contractPath);
  const designIndex = read(designIndexPath);

  if (!designIndex.includes("./sdk-contracts.md")) {
    fail("docs/design/README.md does not link docs/design/sdk-contracts.md");
  }

  for (const surface of requiredSurfaces) {
    const section = sectionFor(contract, surface.heading);
    if (!section) {
      fail(`${surface.heading} section missing from sdk-contracts.md`);
      continue;
    }

    for (const label of ["Signature.", "Semantics.", "Default.", "Implementation issue.", "Conformance issue."]) {
      if (!section.includes(`**${label}**`)) {
        fail(`${surface.heading} missing ${label}`);
      }
    }

    for (const term of surface.requiredTerms) {
      if (!section.includes(term)) {
        fail(`${surface.heading} missing required term: ${term}`);
      }
    }

    if (!section.includes(surface.implementation)) {
      fail(`${surface.heading} missing implementation issue ${surface.implementation}`);
    }

    if (!section.includes(surface.conformance)) {
      fail(`${surface.heading} missing conformance issue ${surface.conformance}`);
    }
  }

  if (!contract.includes("Inferred-Camp approval is both")) {
    fail("sdk-contracts.md must record the canonical inferred-Camp approval decision");
  }
}

function validateImportOwners() {
  const importPattern = /import\s*\{\s*([^}]+?)\s*\}\s*from\s*["']([^"']+)["']/g;

  for (const filePath of listMarkdownFiles(docsRoot)) {
    const relativePath = path.relative(root, filePath);
    const markdown = read(filePath);
    const runtimeAgentImports = [];
    const sdkAgentImports = [];

    for (const match of markdown.matchAll(importPattern)) {
      const specifiers = match[1].split(",").map((specifier) => specifier.trim()).filter(Boolean);
      const packageName = match[2];

      for (const specifier of specifiers) {
        const bindingName = importedBindingName(specifier);
        const expectedPackage = importOwners.get(bindingName);

        if (expectedPackage && packageName !== expectedPackage) {
          fail(`${relativePath}: ${bindingName} imported from ${packageName}; expected ${expectedPackage}`);
        }

        if (bindingName === "agent" && packageName === "@hobo/runtime") {
          runtimeAgentImports.push(specifier);
        }

        if (bindingName === "agent" && packageName === "@hobo/sdk") {
          sdkAgentImports.push(specifier);
        }
      }
    }

    if (runtimeAgentImports.length > 0 && sdkAgentImports.length > 0) {
      const allAgentImports = [...runtimeAgentImports, ...sdkAgentImports];
      const allAliased = allAgentImports.every((specifier) => /\s+as\s+/i.test(specifier));
      if (!allAliased) {
        fail(`${relativePath}: files importing both runtime and operator agent() must alias both imports`);
      }
    }
  }
}

function validateDefaultGuards() {
  const markdown = listMarkdownFiles(docsRoot).map((filePath) => read(filePath)).join("\n");
  const forbiddenAutoApproveDefaults = [
    /autoApprove[^.\n]{0,120}(default|defaults)[^.\n]{0,40}(prod|production)/i,
    /autoApprove[^.\n]{0,120}(prod|production)[^.\n]{0,40}(default|defaults)/i,
  ];

  for (const pattern of forbiddenAutoApproveDefaults) {
    if (pattern.test(markdown)) {
      fail("autoApprove docs imply a production default; contract requires explicit opt-in");
    }
  }
}

validateContractDoc();
validateImportOwners();
validateDefaultGuards();

if (!process.exitCode) {
  console.log(`sdk contracts ok: ${requiredSurfaces.length} surfaces, ${importOwners.size} import-owner rules`);
}
