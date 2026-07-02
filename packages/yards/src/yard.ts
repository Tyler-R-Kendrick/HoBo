import type { Camp } from "@hobo/camps";

export const TOPOLOGY_CONTRACT_VERSION = "hobo.topology-objects/v1" as const;

export interface Yard {
	readonly kind: "yard";
	readonly contract: typeof TOPOLOGY_CONTRACT_VERSION;
	readonly name: string;
	readonly providerId: string;
	readonly camps: readonly Camp[];
}

export function yard(
	name: string,
	config: { readonly camps: readonly Camp[] },
): Yard {
	requireName("yard name", name);
	const camps = requireArray(config?.camps, "yard camps");
	if (camps.length === 0) {
		throw new Error("yard requires at least one Camp");
	}
	for (const entry of camps) {
		if (entry?.kind !== "camp") {
			throw new TypeError("yard camps must be Camp objects");
		}
	}

	const providerIds = [...new Set(camps.map((entry) => entry.providerId))];
	if (providerIds.length !== 1) {
		throw new Error(
			`Yard ${name} cannot mix providers: ${providerIds.join(", ")}`,
		);
	}

	return deepFreeze({
		kind: "yard",
		contract: TOPOLOGY_CONTRACT_VERSION,
		name,
		providerId: providerIds[0]!,
		camps,
	});
}

function requireArray<T>(
	value: readonly T[] | undefined,
	fieldName: string,
): readonly T[] {
	if (!Array.isArray(value)) {
		throw new TypeError(`${fieldName} must be an array`);
	}
	return value;
}

function requireName(label: string, value: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${label} must be a non-empty string`);
	}
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}
