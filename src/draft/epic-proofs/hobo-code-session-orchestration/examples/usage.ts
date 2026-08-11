import { strict as assert } from "node:assert";
import { parseRequiredSessionCommands, REQUIRED_SESSION_COMMANDS } from "../src/session-command-suite.js";

const parsed = parseRequiredSessionCommands();
assert.deepEqual(parsed, REQUIRED_SESSION_COMMANDS);
console.log(`session-contract commands=${parsed.length}`);
