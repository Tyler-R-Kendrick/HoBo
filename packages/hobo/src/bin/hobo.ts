#!/usr/bin/env node
// Enable TypeScript bindle sources (src/bindle.ts) when tsx is available so
// `hobo dev` can load the flagship authoring path without a separate build.
try {
	// Dynamic string keeps tsc from requiring a tsx type package.
	const specifier = ["tsx", "esm"].join("/");
	await import(specifier);
} catch {
	// optional — projects with dist/bindle.js still load
}

import { createCloudflareProvider } from "@hobo/provider-cloudflare";

import { createComposedHoboCli } from "../cli.js";
import {
	bootstrapDefaultProviders,
	createDefaultYardRuntime,
	toRegistrableProvider,
} from "../compose.js";
import { createBareMetalProvider } from "../local-provider.js";

// The real composed `hobo` binary. Unlike @hobo/cli's bare bin (which calls
// createHoboCli() un-injected, leaving the cloud verbs as shell stubs), this
// wires the default LOCAL/MOCKED runtimes so collect/plan/up/down/dev run the
// real in-process flow. Before dispatch, the default provider set is recorded
// as durable registration + approval facts (walkthrough Part 0/2 — "default
// providers approved" is a fact trail, not config). Bare-metal is bootstrapped
// alongside cloudflare so `hobo yard` / `hobo dev` have a local camp host.
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
process.exitCode = result.exitCode;
