/**
 * Runnable example for hobo-code-harness-experience.
 * Executed by draft:artifacts; stdout must match usage.expected.txt.
 */
import { strict as assert } from "node:assert";

import { runHoboCodeHarnessExperience } from "../src/hobo-code-harness-experience.js";

const result = runHoboCodeHarnessExperience();
assert.equal(result.templateOk, true);
assert.equal(result.visualOk, true);
assert.equal(result.evidenceOk, true);
assert.equal(result.isolationClean, true);
assert.equal(result.orphans.length, 0);

console.log("hobo-code-harness-experience: ok");
console.log(
	`template=${result.templateOk} visual=${result.visualOk} evidence=${result.evidenceOk} isolationClean=${result.isolationClean}`,
);
