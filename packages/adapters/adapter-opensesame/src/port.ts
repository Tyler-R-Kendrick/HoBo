/**
 * The OpenSesame SecretsPort (ADR-0113 residual port, ADR-0027 ladder rank
 * `provider-federation`): the credential HoBo holds is the run's `osr_`
 * surrogate, which OpenSesame's proxy swaps for the real token at the
 * provider's own host. The real credential never enters HoBo.
 *
 * `access` reads the variable a binding names from the environment the process
 * was started with under `opensesame dev --agent run`, and serves it only when
 * it is shaped like a surrogate. A placeholder (`ostest_`), an absent variable
 * and a plain token the person exported are all denied as `placeholders_only`:
 * a run without the plugin exits 0 and hands the child a placeholder, and
 * against an emulator that accepts any token that is a false green.
 *
 * Secrets enter by a person's `opensesame pass insert`, never through HoBo, so
 * `put` is read-only.
 */

import type { SecretsAccessResult, SecretsPort } from "@hobo/identity";

import type { ParsedCredentialBinding } from "./binding.js";
import { OpenSesameAdapterError } from "./errors.js";

/** `osr_` and 32 lower-case hex digits: what OpenSesame's plugin issues. */
export const SURROGATE_PATTERN = "^osr_[0-9a-f]{32}$";
const surrogateRe = new RegExp(SURROGATE_PATTERN, "u");

const VERSION = "surrogate";

export type OpenSesamePortOptions = Readonly<{
	bindings: readonly ParsedCredentialBinding[];
	/** The environment the process was started with; read at each call. */
	env: NodeJS.ProcessEnv;
	id?: string | undefined;
}>;

function valueRefOf(binding: ParsedCredentialBinding): string {
	return `opensesame://${binding.connection.slice("conn://".length)}#${VERSION}`;
}

export function createOpenSesameSecretsPort(
	options: OpenSesamePortOptions,
): SecretsPort {
	const find = (locator: string) =>
		options.bindings.find((binding) => binding.locator === locator);

	function serve(locator: string): SecretsAccessResult {
		const binding = find(locator);
		if (binding === undefined) {
			return {
				status: "denied",
				reason: "no binding for this credential reference",
				code: "secret-not-found",
			};
		}
		const value = options.env[binding.envName];
		if (value === undefined || !surrogateRe.test(value)) {
			return {
				status: "denied",
				reason: `${binding.envName} holds a placeholder or nothing, not a surrogate: the run did not deliver one (is the surrogate-proxy plugin installed and on, and the token sealed?)`,
				code: "placeholders_only",
			};
		}
		return {
			status: "ok",
			valueRef: valueRefOf(binding),
			material: value,
			versionId: VERSION,
			source: "provider-federation",
		};
	}

	return {
		id: options.id ?? "secrets:opensesame",
		kind: "opensesame",
		put() {
			return Promise.reject(
				new OpenSesameAdapterError(
					"read_only",
					"secrets enter OpenSesame by `opensesame pass insert`, never through HoBo",
				),
			);
		},
		access(name) {
			return Promise.resolve(serve(name));
		},
		accessVersion(name, versionId) {
			if (versionId !== VERSION) {
				return Promise.resolve({
					status: "denied",
					reason: "only the run's surrogate has a version",
					code: "secret-version-not-found",
				});
			}
			return Promise.resolve(serve(name));
		},
		listVersions(name) {
			return Promise.resolve(find(name) === undefined ? [] : [VERSION]);
		},
	};
}
