import { spawnSync } from "node:child_process";

const staged = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" });
if (staged.status !== 0) process.exit(staged.status ?? 1);
const files = staged.stdout.split(/\r?\n/).filter(Boolean);
const generated = files.filter((file) => /(^|\/)(generated|src\/gen)(\/|$)/.test(file) || /^contracts\/data-models\/data-models\.(proto|cue)$/.test(file));
if (generated.length === 0) process.exit(0);
const schema = files.some((file) => /\.(proto|cue)$/.test(file) || /^scripts\/generate-data-model-contracts\.ts$/.test(file));
if (schema) process.exit(0);
console.error("Generated outputs changed without matching protobuf/CUE source or generator change:");
for (const file of generated) console.error(`- ${file}`);
console.error("Edit schema/generator sources, then run the relevant codegen command.");
process.exit(1);
