/**
 * Identity FeatureFlagStore bridge for `hobo-code` composition (doctor/health
 * checks). The `hobo-code` binary itself is owned by `@hobo/code`
 * (bin/hobo-code.mjs); CLI surface is `runHoboCodeCli` in `@hobo/code`
 * (flat verbs; dispatch default).
 */
import {
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	type CodeFeaturePort,
} from "@hobo/code";
import {
	createContractAssertedHarnessFixtures,
	type FeatureFlagStore,
} from "@hobo/identity";

export interface CodeCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	readonly features?: CodeFeaturePort;
	readonly store?: FeatureFlagStore;
}

/**
 * Build CodeFeaturePort over identity FeatureFlagStore (OpenFeature only).
 * Seeds ALL code.* flags ON by default.
 */
export function featurePortFromStore(store: FeatureFlagStore): CodeFeaturePort {
	for (const key of Object.values(CODE_FEATURE_FLAGS)) {
		const def = CODE_FEATURE_DEFAULTS[key];
		if (!store.get(key)) {
			store.define({
				key,
				defaultValue: def,
				percentage: 100,
				enabled: true,
				state: "ENABLED",
				variants: { on: true, off: false },
				defaultVariant: "on",
				killSwitch: false,
				autoAbortOnDualFailure: false,
				metadata: { surface: "hobo-code", adr: "ADR-0139", defaults: "on" },
			});
		}
	}

	return {
		evaluateBoolean(key, context) {
			const fallback =
				CODE_FEATURE_DEFAULTS[key as keyof typeof CODE_FEATURE_DEFAULTS] ??
				true;
			const result = store.evaluateBoolean(
				key,
				{
					targetingKey: context.targetingKey,
					...(context.attributes !== undefined
						? { attributes: context.attributes }
						: {}),
				},
				fallback,
			);
			return {
				value: result.value,
				reason: String(result.reason ?? "default"),
				variant: String(result.variant ?? (result.value ? "on" : "off")),
			};
		},
		listKeys() {
			return store.list().map((f) => f.key);
		},
	};
}

/** Resolve features for tests / doctor. */
export function resolveCodeFeatures(
	deps: CodeCommandDeps = {},
): CodeFeaturePort {
	if (deps.features) return deps.features;
	const env = deps.env ?? process.env;
	const tenant =
		(typeof env.HOBO_TENANT === "string" && env.HOBO_TENANT) || "local";
	const store =
		deps.store ?? createContractAssertedHarnessFixtures({ tenant }).store;
	return featurePortFromStore(store);
}
