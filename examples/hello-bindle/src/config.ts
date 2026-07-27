/**
 * Bindle-injected configuration (camp intermediary).
 *
 * Values are declared on resources in `bindle.ts` via
 * `.with({ provider: "local", option: "env", config: { KEY: "value" } })`.
 * The bare-metal Yard host (and other camps) inject those keys into the
 * process environment before entrypoints run. App code only *reads* them —
 * it never hardcodes the configured strings.
 */

export type ConfigEnv = Readonly<Record<string, string | undefined>>;

/** public-contract: env key the api resource expects from the bindle. */
export const API_GREETING_PREFIX_KEY = "GREETING_PREFIX";

/** public-contract: env key the web resource expects from the bindle. */
export const WEB_APP_TITLE_KEY = "APP_TITLE";

/**
 * Resolve a bindle-configured env value. Fails closed when the host has not
 * injected it — that is the proof the intermediary camp ran.
 */
export function resolveBindleConfig(
	key: string,
	env: ConfigEnv = process.env,
): string {
	const raw = env[key];
	if (typeof raw !== "string" || raw.trim().length === 0) {
		throw new Error(
			`unresolved bindle config ${key}: the camp must inject env values ` +
				`declared on the resource via .with({ option: "env", config: { ${key}: ... } })`,
		);
	}
	return raw;
}
