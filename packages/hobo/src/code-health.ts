/**
 * Lightweight doctor-facing code harness health (ADR-0139).
 * Kept separate from code-command so diagnostics stay injectable and thin.
 */

import {
	type CodeFeaturePort,
	composeCodePlatform,
	listSandboxOrphans,
} from "@hobo/code";
import { createContractAssertedHarnessFixtures } from "@hobo/identity";
import { featurePortFromStore } from "./code-command.js";
import { isJsonString } from "./json.js";

export function describeCodeHarnessHealth(input: {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly features?: CodeFeaturePort;
}) {
	const features =
		input.features ??
		featurePortFromStore(
			createContractAssertedHarnessFixtures({
				tenant:
					(isJsonString(input.env?.HOBO_TENANT) && input.env.HOBO_TENANT) ||
					"local",
			}).store,
		);
	const platform = composeCodePlatform({
		hoboHome: input.hoboHome,
		autoInitStation: false,
		features,
	});
	return {
		present: true,
		station: platform.station,
		features: platform.features,
		provider: platform.provider,
		orphans: listSandboxOrphans(input.hoboHome).length,
		/** Product defaults are ON for all code.* flags (monetization + distributed). */
		monetizationDefault: "on",
		distributedDefault: "on",
		binary: "hobo-code",
		defaultVerb: "dispatch",
		adr: "ADR-0139",
	};
}
