import { spawnSync } from "node:child_process";

const staged = spawnSync(
	"git",
	["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
	{ encoding: "utf8" },
);
if (staged.status !== 0) process.exit(staged.status ?? 1);
const files = staged.stdout.split(/\r?\n/).filter(Boolean);
const generated = files.filter((file) =>
	/(^|\/)(generated|_generated|src\/gen)(\/|$)/.test(file),
);
if (generated.length === 0) process.exit(0);
const schema = files.some((file) => /\.(proto|cue|wit)$/.test(file));
const generator = files.some(
	(file) =>
		/(^|\/)buf(\.gen)?\.yaml$/.test(file) ||
		/^src\/draft\/technical-proofs\/s0-04-protobuf-cue-codegen\/packages\/schema-tools\/(src\/(?!_generated\/)|package\.json)/.test(
			file,
		) ||
		/^packages\/schema-tools\/(src\/(?!_generated\/)|package\.json)/.test(
			file,
		) ||
		/^packages\/wit\/(src\/(?!generated\/)|scripts\/|wit-lock\.json)/.test(
			file,
		),
);
if (schema || generator) process.exit(0);
console.error(
	"Generated outputs changed without matching protobuf/CUE source or generator change:",
);
for (const file of generated) console.error(`- ${file}`);
console.error(
	"Edit schema/generator sources, then run the relevant codegen command.",
);
process.exit(1);
