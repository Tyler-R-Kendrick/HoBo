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

export function describeCodeHarnessHealth(input: {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly features?: CodeFeaturePort;
}): {
	readonly present: true;
	readonly station: ReturnType<typeof composeCodePlatform>["station"];
	readonly features: ReturnType<typeof composeCodePlatform>["features"];
	readonly provider: ReturnType<typeof composeCodePlatform>["provider"];
	readonly orphans: number;
	readonly monetizationDefault: "on";
	readonly distributedDefault: "on";
	readonly binary: "hobo-code";
	readonly defaultVerb: "dispatch";
	readonly adr: "ADR-0139";
} {
	const features =
		input.features ??
		featurePortFromStore(
			createContractAssertedHarnessFixtures({
				tenant:
					(typeof input.env?.HOBO_TENANT === "string" &&
						input.env.HOBO_TENANT) ||
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
