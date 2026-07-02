import type { BindleScope } from "@hobo/bindles/topology";

import { providerSelection } from "./provider-selection.js";
import {
	TOPOLOGY_CONTRACT_VERSION,
	type Camp,
	type CampConfig,
	type ProviderSelection,
	type ResolutionPrecedenceRecord,
	type ResolutionStep,
} from "./types.js";

export function camp(name: string, config: CampConfig): Camp {
	requireName("camp name", name);
	if (!isPlainObject(config)) {
		throw new TypeError("camp config must be an object");
	}
	if (config.bindle?.kind !== "bindle") {
		throw new TypeError("camp requires a Bindle object");
	}
	if (!config.runtime) {
		throw new TypeError("camp requires a runtime backend descriptor");
	}

	const defaultProvider = config.defaultProvider
		? normalizeProviderSelection(config.defaultProvider)
		: null;
	const tiers = normalizeSelectorMap(config.tiers ?? {}, "tiers");
	const bindings = normalizeSelectorMap(config.bindings ?? {}, "bindings");
	const providerId = singleProviderId([
		defaultProvider,
		...Object.values(tiers),
		...Object.values(bindings),
	]);
	const { id, env } = normalizeCampId(name, providerId);
	const mappings = {
		defaultProvider,
		tiers,
		bindings,
	};

	return deepFreeze({
		kind: "camp",
		contract: TOPOLOGY_CONTRACT_VERSION,
		id,
		name: id,
		env,
		envType: config.envType ?? inferEnvType(env),
		providerId,
		runtime: config.runtime,
		bindle: config.bindle,
		mappings,
		resolutionOrder: ["bindings", "tiers", "defaultProvider"],
		resolutionPrecedence: buildResolutionPrecedence(config.bindle, mappings),
	});
}

export function resolutionPrecedenceFor(
	campObject: Camp,
	resourceKey: string,
): readonly ResolutionStep[] {
	if (campObject?.kind !== "camp") {
		throw new TypeError("resolutionPrecedenceFor expects a Camp object");
	}
	requireName("resource key", resourceKey);

	const record = campObject.resolutionPrecedence.find((entry) =>
		[
			entry.resource,
			entry.resourceName,
			`${campObject.bindle.name}.${entry.resourceName}`,
			entry.resourceKind,
			entry.portRef,
		].includes(resourceKey),
	);
	if (!record) {
		throw new Error(`no resolution precedence record for ${resourceKey}`);
	}
	return record.order;
}

function normalizeSelectorMap(
	value: Readonly<Record<string, ProviderSelection>>,
	fieldName: string,
): Readonly<Record<string, ProviderSelection>> {
	if (!isPlainObject(value)) {
		throw new TypeError(`camp ${fieldName} must be an object`);
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, selector]) => [key, normalizeProviderSelection(selector)]),
	);
}

function normalizeProviderSelection(value: ProviderSelection): ProviderSelection {
	if (value?.kind !== "provider-selection") {
		throw new TypeError("provider mappings must use providerSelection(...) descriptors");
	}
	return value;
}

function singleProviderId(selectors: readonly (ProviderSelection | null)[]): string {
	const ids = [...new Set(selectors.filter(Boolean).map((selector) => selector!.providerId))];
	if (ids.length === 0) {
		throw new Error("camp requires at least one provider mapping");
	}
	if (ids.length > 1) {
		throw new Error(`camp mappings must target one provider, got ${ids.join(", ")}`);
	}
	return ids[0]!;
}

function buildResolutionPrecedence(
	bindleObject: BindleScope,
	mappings: Camp["mappings"],
): ResolutionPrecedenceRecord[] {
	return bindleObject.resources.flatMap((resource) =>
		resource.portRef.map((portRef) => {
			const binding = firstSelection(mappings.bindings, [
				resource.stableId,
				resource.name,
				`${bindleObject.name}.${resource.name}`,
				portRef,
			]);
			const tier = firstSelection(mappings.tiers, [resource.kind, portRef]);

			return {
				resource: resource.stableId,
				resourceName: resource.name,
				resourceKind: resource.kind,
				portRef,
				order: [
					summarizeResolution("bindings", binding.key ?? resource.name, binding.selector),
					summarizeResolution("tiers", tier.key ?? resource.kind, tier.selector),
					summarizeResolution("defaultProvider", "*", mappings.defaultProvider),
				],
			};
		}),
	);
}

function firstSelection(
	map: Readonly<Record<string, ProviderSelection>>,
	keys: readonly string[],
): { key: string | null; selector: ProviderSelection | null } {
	for (const key of keys) {
		if (map[key]) {
			return { key, selector: map[key]! };
		}
	}
	return { key: null, selector: null };
}

function normalizeCampId(name: string, providerId: string): { id: string; env: string } {
	const suffix = `-${providerId}`;
	if (name.endsWith(suffix)) {
		const env = name.slice(0, -suffix.length);
		requireName("camp env", env);
		return { id: name, env };
	}
	return { id: `${name}-${providerId}`, env: name };
}

function inferEnvType(env: string): string {
	if (/^(prod|production)$/i.test(env)) return "production";
	if (/^staging$/i.test(env)) return "staging";
	if (/^(preview|pr|ephemeral)$/i.test(env)) return "ephemeral";
	if (/^(dev|development|local)$/i.test(env)) return "development";
	return env;
}

function summarizeResolution(
	source: ResolutionStep["source"],
	key: string,
	selector: ProviderSelection | null,
): ResolutionStep {
	return {
		source,
		key,
		providerId: selector?.providerId ?? null,
		selector: selector?.selector ?? null,
	};
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
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}

export { providerSelection };
