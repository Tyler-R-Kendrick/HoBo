// Composes what the composed binaries compose, and selects the live Pulumi
// lane over it, then ends the way it is told:
//   node --import tsx composed-temp-dirs.mts <normal|throw|wait> <ready file> <data dir|default>
// With `default` the runtime makes its own event-store directory. The live lane
// is pointed at a pulumi that is not there: it is built, never run.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createDefaultYardRuntime,
	selectPulumiEstateAdapter,
} from "../../src/compose.ts";

const [mode, ready, dataDir] = process.argv.slice(2);
const runtime = createDefaultYardRuntime(
	dataDir === undefined || dataDir === "default" ? {} : { dataDir },
);
selectPulumiEstateAdapter({
	store: runtime.store,
	env: { HOBO_PULUMI_LIVE: "1", HOBO_PULUMI_BIN: join(tmpdir(), "no-pulumi") },
});

if (mode === "throw") throw new Error("the composed run failed");
if (mode === "wait") {
	setInterval(() => {}, 1000);
	if (ready !== undefined) writeFileSync(ready, "ready");
}
