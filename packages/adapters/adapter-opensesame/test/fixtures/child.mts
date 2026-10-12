// The proxied command in tests: record what it was given, exit as told.
//   node child.mts <out file> [exit code]
import { writeFileSync } from "node:fs";

const [out, code] = process.argv.slice(2);
if (out !== undefined) {
	writeFileSync(
		out,
		JSON.stringify({ env: process.env, argv: process.argv.slice(2) }),
	);
}
process.exit(Number(code ?? 0));
