import { parseRequiredSessionCommands } from "../src/session-command-suite.js";

console.log(JSON.stringify({ acceptedCommands: parseRequiredSessionCommands() }));
