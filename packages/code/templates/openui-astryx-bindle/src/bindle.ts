/**
 * High-value Bindle entry (template).
 * Generated apps inherit budget / OpenFeature / Harness controls.
 */
export const BINDLE_NAME = "openui-astryx-demo";

export const openFeatureFlags = {
	"app.visual.primary": {
		key: "app.visual.primary",
		defaultVariant: "on",
		description: "Primary OpenUI visual surface",
	},
} as const;

export function createBindleManifest() {
	return {
		name: BINDLE_NAME,
		ui: "openui+astryx",
		flags: Object.keys(openFeatureFlags),
		gherkin: ["features/visual.feature"],
	};
}
