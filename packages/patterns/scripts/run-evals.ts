import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPatternCatalog } from "../src/catalog.js";
import { evaluatePatternRetrieval, parseEvalCases } from "../src/validate.js";
import { buildHoboVocabulary } from "../src/vocabulary.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = parseEvalCases(readFileSync(join(root, "evals", "cases.jsonl"), "utf8"));
const catalog = loadPatternCatalog({ root: join(root, "patterns") });
const vocabulary = buildHoboVocabulary({
	aliasPath: join(root, "vocabulary", "aliases.json"),
});
const report = evaluatePatternRetrieval({ catalog, vocabulary, cases });
process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
