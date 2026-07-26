import { createHash } from "node:crypto";

import { defineProjection, type Projection } from "@hobo/data";
import { CLOUD_EVENTS, providerRegistered } from "../events.js";
import type { CapabilityVerdict } from "../plan-types.js";

// The Registry is a Provider + Capability Manifest catalog (control-plane.md
// "Registry"). Per Decision D2 (build plan) it is a *projection* over provider
// `capabilityManifest()` publications, not a standalone package. This module
// carries both faces: (1) the read-model projection the kernel materializes, and
// (2) a PlannerRegistry the pure Planner consults for context-matching + live
// capability negotiation.

// Structural shapes of a registrable CloudProvider — declared locally so `src/`
// never imports the provider adapter (inward-only deps; provider-cloudflare is a
// test-only dependency exercised from test/).
export interface RegistrableCapability {
	port: string;
	satisfies(req: { port: string; features?: string[] }): {
		kind: string;
		missing?: string[];
	};
	estimateCost(req: { port: string }): {
		marginalPrice: string;
		sku: string;
		unit: string;
	};
}

export interface RegistrableProvider {
	id: string;
	regions: string[];
	capabilities: RegistrableCapability[];
	capabilityManifest(): {
		providerId: string;
		published: Record<string, string>;
		capabilities: { capabilities?: Array<Record<string, unknown>> };
		cost: { facts?: Array<Record<string, unknown>> };
	};
}

// A default Resource Definition candidate (control-plane.md: a provider's
// equivalence mappings are its default Resource Definitions, one per capability).
export interface ResourceDefinition {
	id: string;
	providerId: string;
	port: string;
	features: string[];
	regions: string[];
	specificity: number;
	priority: number;
	cost: { sku: string; unit: string; marginalPrice: string };
	// Live capability negotiation delegated to the provider Capability.satisfies.
	satisfies(req: { port: string; features?: string[] }): CapabilityVerdict;
}

export interface PlannerRegistry {
	catalogHash: string;
	definitions(): ResourceDefinition[];
	providers(): string[];
}

function normalizeVerdict(raw: {
	kind: string;
	missing?: string[];
}): CapabilityVerdict {
	if (raw.kind === "full") return { kind: "full" };
	if (raw.kind === "partial")
		return { kind: "partial", missing: raw.missing ?? [] };
	return { kind: "none" };
}

function catalogHashOf(definitions: ResourceDefinition[]): string {
	const summary = definitions
		.map((d) => ({
			id: d.id,
			port: d.port,
			features: [...d.features].sort(),
			marginalPrice: d.cost.marginalPrice,
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
	const digest = createHash("sha256")
		.update(JSON.stringify(summary))
		.digest("hex");
	return `sha256:${digest}`;
}

export function definitionsFor(
	provider: RegistrableProvider,
): ResourceDefinition[] {
	const manifest = provider.capabilityManifest();
	const capsArray = manifest.capabilities.capabilities ?? [];
	const costFacts = manifest.cost.facts ?? [];

	return provider.capabilities.map((capability) => {
		const manifestEntry = capsArray.find(
			(entry) => entry.port === capability.port,
		);
		const costFact = costFacts.find((fact) => fact.port === capability.port);
		const estimate = capability.estimateCost({ port: capability.port });
		const features = Array.isArray(manifestEntry?.features)
			? (manifestEntry?.features as string[])
			: [];
		const regions = Array.isArray(manifestEntry?.regions)
			? (manifestEntry?.regions as string[])
			: [...provider.regions];

		return {
			id: `${provider.id}:${capability.port}`,
			providerId: provider.id,
			port: capability.port,
			features,
			regions,
			// Default provider definitions share a base specificity; explicit
			// platform definitions would outscore them (control-plane.md step 2).
			specificity: 10,
			priority: 0,
			cost: {
				sku: (costFact?.sku as string) ?? estimate.sku,
				unit: (costFact?.unit as string) ?? estimate.unit,
				marginalPrice:
					(costFact?.marginalPrice as string) ?? estimate.marginalPrice,
			},
			satisfies: (req) => normalizeVerdict(capability.satisfies(req)),
		};
	});
}

export function createRegistryFromProviders(
	providers: RegistrableProvider[],
): PlannerRegistry {
	const definitions = providers.flatMap(definitionsFor);
	const hash = catalogHashOf(definitions);
	const providerIds = [...new Set(providers.map((p) => p.id))];
	return {
		catalogHash: hash,
		definitions: () => definitions.map((d) => ({ ...d })),
		providers: () => [...providerIds],
	};
}

// The command that registers a provider into the Registry catalog: it carries
// the provider's Capability Manifest snapshot as the fact body.
export function registerProviderFact(provider: RegistrableProvider) {
	const definitions = definitionsFor(provider).map((d) => ({
		id: d.id,
		providerId: d.providerId,
		port: d.port,
		features: d.features,
		regions: d.regions,
		specificity: d.specificity,
		priority: d.priority,
		cost: d.cost,
	}));
	const manifest = provider.capabilityManifest();
	const indexDoc =
		manifest.published["/.well-known/capability-manifest/index.json"] ?? "";
	const manifestIndexDigest = `sha256:${createHash("sha256").update(indexDoc).digest("hex")}`;
	return providerRegistered({
		providerId: provider.id,
		definitions,
		manifestIndexDigest,
	});
}

// ---- The Registry catalog projection (read model, rebuildable from zero) ----

export interface RegistryCatalogRow {
	providerId: string;
	ports: string[];
	definitionCount: number;
	manifestIndexDigest: string;
}

export const registryCatalogProjection: Projection<RegistryCatalogRow> =
	defineProjection<RegistryCatalogRow>({
		name: "registry-catalog",
		key: (event) => (event.data as { providerId: string }).providerId,
		on: {
			[CLOUD_EVENTS.ProviderRegistered]: (_row, event) => {
				const data = event.data as {
					providerId: string;
					definitions: Array<{ port: string }>;
					manifestIndexDigest: string;
				};
				return {
					providerId: data.providerId,
					ports: data.definitions.map((d) => d.port).sort(),
					definitionCount: data.definitions.length,
					manifestIndexDigest: data.manifestIndexDigest,
				};
			},
		},
	});
