#!/usr/bin/env node
import { createComposedHoboCli } from "../cli.js";
import {
	bootstrapDefaultProviders,
	createDefaultYardRuntime,
} from "../compose.js";

// The real composed `hobo` binary. Unlike @hobo/cli's bare bin (which calls
// createHoboCli() un-injected, leaving the cloud verbs as shell stubs), this
// wires the default LOCAL/MOCKED runtimes so collect/plan/up/down/dev run the
// real in-process flow. Before dispatch, the default provider set is recorded
// as durable registration + approval facts (walkthrough Part 0/2 — "default
// providers approved" is a fact trail, not config).
const runtime = createDefaultYardRuntime();
await bootstrapDefaultProviders(runtime);
const cli = createComposedHoboCli({ yardRuntime: runtime });
const result = await cli.run(process.argv.slice(2));

if (result.stdout) {
	process.stdout.write(result.stdout);
}
if (result.stderr) {
	process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
