import { createHash } from "node:crypto";

import type { EventStore } from "@hobo/core";
import { defineProjection, type Projection } from "@hobo/data";
import {
	CLOUD_EVENTS,
	providerApproved,
	providerRegistered,
} from "../events.js";
import type { CapabilityVerdict } from "../plan-types.js";
import { collectStream } from "../store/index.js";

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

// A registered-but-unapproved provider: visible to remediation, invisible to
// Matching (walkthrough Part 0/2 — approval is the gate, registration is not).
export interface HeldProvider {
	providerId: string;
	ports: string[];
}

export interface PlannerRegistry {
	catalogHash: string;
	definitions(): ResourceDefinition[];
	providers(): string[];
	// Optional live-view extensions (event-backed registries): re-fold the
	// durable registry stream into the matchable snapshot, and list providers
	// that are installed but not yet approved.
	refresh?(): Promise<void>;
	held?(): HeldProvider[];
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

// The approval fact: `hobo add` (or the Yard bootstrap) approving a registered
// provider for Matching.
export function approveProviderFact(providerId: string, approvedBy?: string) {
	return providerApproved(
		approvedBy !== undefined ? { providerId, approvedBy } : { providerId },
	);
}

// Deterministic, core-owned capability negotiation over a *recorded* catalog
// entry (ADR-0090): the fact body carries data only, so `satisfies` is
// reconstructed from the entry's port + features — full when every required
// feature is advertised, partial(missing) when the port matches, none otherwise.
function negotiateFromEntry(
	port: string,
	features: readonly string[],
): ResourceDefinition["satisfies"] {
	return (req) => {
		if (req.port !== port) return { kind: "none" };
		const missing = (req.features ?? []).filter(
			(feature) => !features.includes(feature),
		);
		if (missing.length === 0) return { kind: "full" };
		return { kind: "partial", missing };
	};
}

// Parse a `provider.Registered` fact body into ResourceDefinitions
// (parse-don't-validate: malformed entries are dropped, never half-trusted).
export function parseRegisteredDefinitions(
	data: unknown,
): ResourceDefinition[] {
	if (data === null || typeof data !== "object") return [];
	const body = data as { providerId?: unknown; definitions?: unknown };
	if (typeof body.providerId !== "string" || body.providerId.length === 0)
		return [];
	if (!Array.isArray(body.definitions)) return [];

	const parsed: ResourceDefinition[] = [];
	for (const raw of body.definitions) {
		if (raw === null || typeof raw !== "object") continue;
		const rec = raw as Record<string, unknown>;
		if (typeof rec.port !== "string" || rec.port.length === 0) continue;
		const features = Array.isArray(rec.features)
			? rec.features.filter((f): f is string => typeof f === "string")
			: [];
		const regions = Array.isArray(rec.regions)
			? rec.regions.filter((r): r is string => typeof r === "string")
			: [];
		const cost = (rec.cost ?? {}) as Record<string, unknown>;
		parsed.push({
			id:
				typeof rec.id === "string" && rec.id.length > 0
					? rec.id
					: `${body.providerId}:${rec.port}`,
			providerId: body.providerId,
			port: rec.port,
			features,
			regions,
			specificity: typeof rec.specificity === "number" ? rec.specificity : 10,
			priority: typeof rec.priority === "number" ? rec.priority : 0,
			cost: {
				sku:
					typeof cost.sku === "string"
						? cost.sku
						: `${body.providerId}-${rec.port}`,
				unit: typeof cost.unit === "string" ? cost.unit : "hour",
				marginalPrice:
					typeof cost.marginalPrice === "string" ? cost.marginalPrice : "0",
			},
			satisfies: negotiateFromEntry(rec.port, features),
		});
	}
	return parsed;
}

export interface RegistryStreamFold {
	// providerId -> its recorded default Resource Definitions (last write wins).
	installed: Map<string, ResourceDefinition[]>;
	approved: Set<string>;
}

// Fold the durable registry stream (provider.Registered + provider.Approved)
// into the installed/approved snapshot. Pure over the event list, so the
// snapshot is rebuildable from zero.
export function foldRegistryStream(
	events: Iterable<{ type: string; data?: unknown }>,
): RegistryStreamFold {
	const installed = new Map<string, ResourceDefinition[]>();
	const approved = new Set<string>();
	for (const event of events) {
		if (event.type === CLOUD_EVENTS.ProviderRegistered) {
			const defs = parseRegisteredDefinitions(event.data);
			const providerId = defs[0]?.providerId;
			if (providerId !== undefined) installed.set(providerId, defs);
		} else if (event.type === CLOUD_EVENTS.ProviderApproved) {
			const providerId = (event.data as { providerId?: unknown } | undefined)
				?.providerId;
			if (typeof providerId === "string" && providerId.length > 0)
				approved.add(providerId);
		}
	}
	return { installed, approved };
}

export interface EventBackedRegistryDeps {
	store: Pick<EventStore, "read">;
	streamId: string;
	// Providers compiled into the runtime (always matchable). Installed
	// providers whose id collides with a base provider are deduped in favor of
	// the live base definition.
	base?: PlannerRegistry;
}

// A PlannerRegistry over the durable registry stream: base (in-code) providers
// plus APPROVED installed providers folded from `provider.Registered`/
// `provider.Approved` facts. `refresh()` re-folds the stream into the sync
// snapshot the pure Planner reads; held() lists installed-but-unapproved
// providers so Matching can name them in remediations without matching them.
export function createEventBackedRegistry(
	deps: EventBackedRegistryDeps,
): PlannerRegistry & {
	refresh(): Promise<void>;
	held(): HeldProvider[];
} {
	let installedDefs: ResourceDefinition[] = [];
	let heldRows: HeldProvider[] = [];

	function combined(): ResourceDefinition[] {
		const baseDefs = deps.base?.definitions() ?? [];
		const baseProviders = new Set(baseDefs.map((d) => d.providerId));
		return [
			...baseDefs,
			...installedDefs.filter((d) => !baseProviders.has(d.providerId)),
		];
	}

	return {
		get catalogHash(): string {
			return catalogHashOf(combined());
		},
		definitions: () => combined().map((d) => ({ ...d })),
		providers: () => [...new Set(combined().map((d) => d.providerId))],
		async refresh(): Promise<void> {
			const events = await collectStream(deps.store, deps.streamId);
			const fold = foldRegistryStream(events);
			installedDefs = [...fold.installed.entries()]
				.filter(([providerId]) => fold.approved.has(providerId))
				.flatMap(([, defs]) => defs);
			heldRows = [...fold.installed.entries()]
				.filter(([providerId]) => !fold.approved.has(providerId))
				.map(([providerId, defs]) => ({
					providerId,
					ports: [...new Set(defs.map((d) => d.port))].sort(),
				}))
				.sort((a, b) => a.providerId.localeCompare(b.providerId));
		},
		held: () => heldRows.map((row) => ({ ...row, ports: [...row.ports] })),
	};
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
