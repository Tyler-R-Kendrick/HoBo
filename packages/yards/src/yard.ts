import {
	attachCampToYard,
	type Camp,
	campToShape,
	type CampShape,
	type JsonValue,
	type PrimitiveResolverConfig,
	EMPTY_RESOLVER_CONFIG,
} from "@hobo/camps";

export const TOPOLOGY_CONTRACT_VERSION = "hobo.topology-objects/v1" as const;

/**
 * Yard is the provider-specific topology and control-plane boundary.
 * Provider is authored on the Yard — never derived from Camps.
 * Zero Camps are allowed (requested shape before live instance / generation).
 */
export interface Yard {
	readonly kind: "yard";
	readonly contract: typeof TOPOLOGY_CONTRACT_VERSION;
	readonly name: string;
	readonly providerId: string;
	/** Optional registered Yard-runtime family id. */
	readonly runtimeId?: string;
	readonly regions: readonly string[];
	readonly require: readonly string[];
	readonly prefer: readonly string[];
	readonly residency: readonly string[];
	readonly isolation: readonly string[];
	readonly network: readonly string[];
	readonly componentHosts: readonly string[];
	readonly labels: Readonly<Record<string, string>>;
	/** Provider-native refs only (no credentials). */
	readonly properties: Readonly<Record<string, JsonValue>>;
	readonly resolverDefaults: PrimitiveResolverConfig;
	readonly camps: readonly Camp[];
}

export interface YardConfig {
	/**
	 * Provider id or factory result `{ id: string }` / string.
	 * Required: Yard is the only direct provider selection point.
	 */
	readonly provider: string | { readonly id: string };
	readonly runtimeId?: string;
	readonly regions?: readonly string[];
	readonly require?: readonly string[];
	readonly prefer?: readonly string[];
	readonly residency?: readonly string[];
	readonly isolation?: readonly string[];
	readonly network?: readonly string[];
	readonly componentHosts?: readonly string[];
	readonly labels?: Readonly<Record<string, string>>;
	readonly properties?: Readonly<Record<string, JsonValue>>;
	readonly resolverDefaults?: Partial<PrimitiveResolverConfig>;
	/** Zero or more declared Camp shapes (may be empty). */
	readonly camps?: readonly Camp[];
}

export function yard(name: string, config: YardConfig): Yard {
	requireName("yard name", name);
	if (!isPlainObject(config)) {
		throw new TypeError("yard config must be an object");
	}
	const providerId = normalizeProvider(config.provider);
	const campsInput = config.camps ?? [];
	if (!Array.isArray(campsInput)) {
		throw new TypeError("yard camps must be an array");
	}
	for (const entry of campsInput) {
		if (entry?.kind !== "camp") {
			throw new TypeError("yard camps must be Camp objects");
		}
		if (
			entry.derivedProviderId !== undefined &&
			entry.derivedProviderId !== providerId
		) {
			throw new Error(
				`Yard ${name} cannot attach camp with provider ${entry.derivedProviderId} (yard provider is ${providerId})`,
			);
		}
	}

	const attachedCamps = campsInput.map((c) =>
		attachCampToYard(c, {
			yardId: name,
			providerId,
		}),
	);

	const properties = canonicalizeProperties(config.properties ?? {});
	assertNoCredentials(properties);

	return deepFreeze({
		kind: "yard" as const,
		contract: TOPOLOGY_CONTRACT_VERSION,
		name,
		providerId,
		...(config.runtimeId !== undefined ? { runtimeId: config.runtimeId } : {}),
		regions: canonicalizeStringList(config.regions ?? []),
		require: canonicalizeStringList(config.require ?? []),
		prefer: canonicalizeStringList(config.prefer ?? []),
		residency: canonicalizeStringList(config.residency ?? []),
		isolation: canonicalizeStringList(config.isolation ?? []),
		network: canonicalizeStringList(config.network ?? []),
		componentHosts: canonicalizeStringList(config.componentHosts ?? []),
		labels: canonicalizeLabels(config.labels ?? {}),
		properties,
		resolverDefaults: parseResolverDefaults(config.resolverDefaults),
		camps: Object.freeze(attachedCamps),
	});
}

/** Project authored Yard into a planning shape record (not a topology primitive). */
export function yardToShape(yardObject: Yard): {
	readonly providerId: string;
	readonly runtimeId?: string;
	readonly regions: readonly string[];
	readonly require: readonly string[];
	readonly prefer: readonly string[];
	readonly residency: readonly string[];
	readonly isolation: readonly string[];
	readonly network: readonly string[];
	readonly componentHosts: readonly string[];
	readonly labels: Readonly<Record<string, string>>;
	readonly properties: Readonly<Record<string, JsonValue>>;
	readonly camps: readonly CampShape[];
} {
	return deepFreeze({
		providerId: yardObject.providerId,
		...(yardObject.runtimeId !== undefined
			? { runtimeId: yardObject.runtimeId }
			: {}),
		regions: yardObject.regions,
		require: yardObject.require,
		prefer: yardObject.prefer,
		residency: yardObject.residency,
		isolation: yardObject.isolation,
		network: yardObject.network,
		componentHosts: yardObject.componentHosts,
		labels: yardObject.labels,
		properties: yardObject.properties,
		camps: Object.freeze(yardObject.camps.map(campToShape)),
	});
}

function normalizeProvider(
	provider: string | { readonly id: string },
): string {
	if (typeof provider === "string" && provider.length > 0) return provider;
	if (
		provider &&
		typeof provider === "object" &&
		typeof provider.id === "string" &&
		provider.id.length > 0
	) {
		return provider.id;
	}
	throw new TypeError(
		"yard requires provider (string id or { id }) — Yard is the provider selection point",
	);
}

function parseResolverDefaults(
	input: Partial<PrimitiveResolverConfig> | undefined,
): PrimitiveResolverConfig {
	if (!input) return EMPTY_RESOLVER_CONFIG;
	const pins = Object.freeze(
		(input.pins ?? []).map((p) => {
			if (!p?.slot || !p?.resolverId) {
				throw new TypeError("resolver pin requires slot and resolverId");
			}
			return Object.freeze({ slot: p.slot, resolverId: p.resolverId });
		}),
	);
	return deepFreeze({
		require: canonicalizeStringList(input.require ?? []),
		prefer: canonicalizeStringList(input.prefer ?? []),
		pins,
		properties: canonicalizeProperties(
			(input.properties ?? {}) as Record<string, unknown>,
		),
		labels: canonicalizeLabels(input.labels ?? {}),
	});
}

function assertNoCredentials(
	properties: Readonly<Record<string, JsonValue>>,
): void {
	const forbidden =
		/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i;
	for (const key of Object.keys(properties)) {
		if (forbidden.test(key)) {
			throw new Error(
				`yard properties must not contain credentials (forbidden key: ${key})`,
			);
		}
	}
}

function canonicalizeStringList(values: readonly string[]): readonly string[] {
	return Object.freeze(
		[
			...new Set(values.filter((v) => typeof v === "string" && v.length > 0)),
		].sort(),
	);
}

function canonicalizeLabels(
	labels: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
	const keys = Object.keys(labels).sort();
	const out: Record<string, string> = {};
	for (const key of keys) {
		const value = labels[key];
		if (typeof value !== "string") {
			throw new TypeError(`label ${key} must be a string`);
		}
		out[key] = value;
	}
	return Object.freeze(out);
}

function canonicalizeProperties(
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> {
	const keys = Object.keys(input).sort();
	const out: Record<string, JsonValue> = {};
	for (const key of keys) {
		out[key] = toJsonValue(input[key]);
	}
	return Object.freeze(out);
}

function toJsonValue(value: unknown): JsonValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}
	if (Array.isArray(value)) {
		return Object.freeze(value.map(toJsonValue));
	}
	if (value && typeof value === "object") {
		return canonicalizeProperties(value as Record<string, unknown>);
	}
	throw new TypeError("yard properties must be JSON-safe");
}

function requireName(label: string, value: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${label} must be a non-empty string`);
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value as object)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}
