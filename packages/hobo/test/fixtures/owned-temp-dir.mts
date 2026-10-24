// Makes an owned temp dir (src/owned-temp-dir.ts), says where on stdout, and
// then ends the way it is told:
//   node --import tsx owned-temp-dir.mts <normal|throw|wait|graceful> <ready file>
// `wait` and `graceful` write the ready file and wait for a signal; `graceful`
// first installs a SIGTERM handler of its own, as a server's graceful stop does,
// which records whether the directory is still there, then exits 0.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ownedTempDir } from "../../src/owned-temp-dir.ts";

const [mode, ready] = process.argv.slice(2);
const dir = ownedTempDir("hobo-yard-");
writeFileSync(join(dir, "eventstore.sqlite"), "");
process.stdout.write(`${dir}\n`);

if (mode === "throw") throw new Error("the composed run failed");
if (mode === "graceful") {
	process.once("SIGTERM", () => {
		process.stdout.write(`dir during stop: ${existsSync(dir)}\n`);
		setTimeout(() => process.exit(0), 50);
	});
}
if (mode === "wait" || mode === "graceful") {
	setInterval(() => {}, 1000);
	if (ready !== undefined) writeFileSync(ready, "ready");
}
