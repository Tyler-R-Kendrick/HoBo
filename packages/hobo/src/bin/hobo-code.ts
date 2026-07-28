#!/usr/bin/env node
/**
 * Composition-root `hobo-code` binary: wires identity FeatureFlagStore + full
 * HOBO_HOME defaults. Core logic lives in @hobo/code (dispatch default).
 */
import {
	formatHoboCodeResult,
	runHoboCodeCli,
} from "@hobo/code";
import { createContractAssertedHarnessFixtures } from "@hobo/identity";

import { featurePortFromStore } from "../code-command.js";

const env = process.env;
const tenant =
	(typeof env.HOBO_TENANT === "string" && env.HOBO_TENANT) || "local";
const store = createContractAssertedHarnessFixtures({ tenant }).store;
const features = featurePortFromStore(store);

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const result = await runHoboCodeCli(argv, { env, features, json });
process.stdout.write(formatHoboCodeResult(result, json));
process.exitCode = result.exitCode;
