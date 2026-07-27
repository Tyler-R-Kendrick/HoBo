/**
 * Contract-asserted config fixtures for `hobo dev` (ADR-0027 + ADR-0070).
 * Same schema contracts as can-deploy; agents only ever see schemaOnlyView.
 */
import type { ConfigSchema, SecretSourceRank } from "./config-types.js";
import {
	createMemorySecretsPort,
	type SecretsPort,
} from "./secrets-port.js";

export type DevConfigFixture = Readonly<{
	/** Schema hash the fixture is asserted against. */
	schemaHash: string;
	campValues: Readonly<Record<string, unknown>>;
	/** Memory secrets port pre-seeded for residual provider-federation paths. */
	secretsPort: SecretsPort;
	/** Bound-resource token factories (short-lived fixtures). */
	boundTokens: Readonly<Record<string, () => Promise<string>>>;
	/** Static hatch materials only when schema explicitly opts in. */
	staticMaterials: Readonly<Record<string, string>>;
	/** Production-like default: forbid static-escape in local parity mode. */
	forbidStaticEscape: boolean;
	allowedSources: readonly SecretSourceRank[];
}>;

/**
 * Build contract-asserted fixtures from a Bindle config schema.
 * Sensitive fields never receive plaintext defaults into agent-visible maps.
 */
export async function createContractAssertedConfigFixtures(
	schema: ConfigSchema,
	options?: {
		/** Override non-secret camp values. */
		campValues?: Readonly<Record<string, unknown>>;
		/** Pre-seed residual secret names (values stay broker-local). */
		seedSecrets?: Readonly<Record<string, string>>;
		/** Allow static-escape for local hatch testing (default false). */
		allowStaticEscape?: boolean;
	},
): Promise<DevConfigFixture> {
	const secretsPort = createMemorySecretsPort({
		id: `secrets:dev-fixture:${schema.schemaHash.slice(0, 16)}`,
	});
	const seed = options?.seedSecrets ?? {};
	for (const [name, value] of Object.entries(seed)) {
		await secretsPort.put(name, value);
	}

	const campValues: Record<string, unknown> = {
		...(options?.campValues ?? {}),
	};
	const boundTokens: Record<string, () => Promise<string>> = {};
	const staticMaterials: Record<string, string> = {};

	for (const [name, field] of Object.entries(schema.fields)) {
		if (!field.sensitive && campValues[name] === undefined) {
			if (field.defaultValue !== undefined) {
				campValues[name] = field.defaultValue;
			}
		}
		if (field.source === "bound-resource" && field.sensitive) {
			boundTokens[name] = async () =>
				`dev-bound-token:${name}:${schema.schemaHash.slice(7, 15)}`;
		}
		if (
			field.source === "static-escape" &&
			options?.allowStaticEscape === true
		) {
			staticMaterials[name] = `dev-static-fixture:${name}`;
		}
	}

	const forbidStaticEscape = options?.allowStaticEscape !== true;
	const allowedSources: SecretSourceRank[] = [
		"bound-resource",
		"provider-federation",
		"camp-value",
		...(forbidStaticEscape ? [] : (["static-escape"] as const)),
	];

	return Object.freeze({
		schemaHash: schema.schemaHash,
		campValues: Object.freeze(campValues),
		secretsPort,
		boundTokens: Object.freeze(boundTokens),
		staticMaterials: Object.freeze(staticMaterials),
		forbidStaticEscape,
		allowedSources: Object.freeze(allowedSources),
	});
}
