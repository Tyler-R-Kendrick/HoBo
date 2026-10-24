#!/usr/bin/env node
// Register TypeScript bindle sources before composing the CLI so `hobo dev`
// runs the flagship src/bindle.ts authoring path without a separate build.
import { register } from "tsx/esm/api";

register();

import { createCloudflareProvider } from "@hobo/provider-cloudflare";

import { createComposedHoboCli } from "../cli.js";
import {
	bootstrapDefaultProviders,
	createDefaultYardRuntime,
	toRegistrableProvider,
} from "../compose.js";
import {
	relaunchUnderOpenSesame,
	reportingCredentialRefusals,
	wantsOpenSesameRelaunch,
} from "../credentials-opensesame.js";
import { createBareMetalProvider } from "../local-provider.js";

// The real composed `hobo` binary. Unlike @hobo/cli's bare bin (which calls
// createHoboCli() un-injected, leaving the cloud verbs as shell stubs), this
// wires the default LOCAL/MOCKED runtimes so collect/plan/up/down/dev run the
// real in-process flow. `hobo up` goes through the embedded broker-runtime
// (prefer wasm-sandbox yards, auto-create camps). Before dispatch, the default
// provider set is recorded as durable registration + approval facts. Bare-metal
// is bootstrapped alongside cloudflare so local Yards are first-class.
async function runComposed(): Promise<number> {
	const runtime = createDefaultYardRuntime();
	await bootstrapDefaultProviders(runtime, [
		toRegistrableProvider(createCloudflareProvider()),
		createBareMetalProvider(),
	]);
	const cli = createComposedHoboCli({ yardRuntime: runtime });
	const result = await cli.run(process.argv.slice(2));

	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}
	return result.exitCode;
}

// HOBO_CREDENTIALS=opensesame (ADR-0170): before composing anything, run this
// same invocation once more under `opensesame dev --agent run`, and exit as it
// did. The relaunched child carries HOBO_OPENSESAME_CHILD=1 and composes.
process.exitCode = wantsOpenSesameRelaunch(process.env)
	? await relaunchUnderOpenSesame({
			argv: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
			env: process.env,
			cwd: process.cwd(),
		})
	: await reportingCredentialRefusals(runComposed);
