#!/usr/bin/env node
import { createComposedHoboCli } from "../cli.js";

// The real composed `hobo` binary. Unlike @hobo/cli's bare bin (which calls
// createHoboCli() un-injected, leaving the cloud verbs as shell stubs), this
// wires the default LOCAL/MOCKED runtimes so collect/plan/up/down/dev run the
// real in-process flow.
const cli = createComposedHoboCli();
const result = await cli.run(process.argv.slice(2));

if (result.stdout) {
	process.stdout.write(result.stdout);
}
if (result.stderr) {
	process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
