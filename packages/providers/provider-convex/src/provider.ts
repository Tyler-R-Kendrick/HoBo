import {
	EQUIVALENCE_CLASSES,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
import {
	CONVEX_PROVIDER_ID,
	COST_FACTS,
	DEFAULT_REGIONS,
	publishCapabilityManifest,
} from "./manifest.js";
import { realizeResourcePlan } from "./realize.js";
import type {
	Capability,
	CapabilityManifest,
	CloudProvider,
	CostSignal,
	Match,
	Outputs,
	PortKind,
	PortRequest,
	ProviderClient,
	ResourcePlan,
} from "./types.js";

function makeCapability(classKey: InitialCapabilityPort): Capability {
	const mapping = EQUIVALENCE_CLASSES[classKey];
	const port = mapping.port;
	const features: readonly string[] = mapping.features;
	const fact = COST_FACTS[classKey];

	return {
		port,
		satisfies(req: PortRequest): Match {
			if (req.port !== port) {
				return { kind: "none" };
			}
			const missing = (req.features ?? []).filter(
				(feature) => !features.includes(feature),
			);
			return missing.length === 0
				? { kind: "full" }
				: { kind: "partial", missing };
		},
		estimateCost(_req: PortRequest): CostSignal {
			return {
				currency: "USD",
				sku: fact.sku,
				unit: fact.unit,
				marginalPrice: fact.marginalPrice,
				freeTier: {
					unit: fact.unit,
					included: fact.included,
					reset: "monthly",
				},
			};
		},
	};
}

const PORT_TO_CLASS: Record<string, InitialCapabilityPort> = {
	compute: "web/service",
	database: "database/reactive",
	objectStore: "objectStore",
};

export interface ConvexProviderOptions {
	regions?: string[];
}

// The @hobo/provider-convex factory (ADR-0144 thin-adapter rule): capability
// declarations honestly scoped to the reactive TypeScript BaaS as default
// Resource Definitions, realize() -> a convex-deploy DRIVER program (not
// IaC), a runtime client per port, and the published Capability Manifest
// with declared cost facts and the brokered-deploy-key posture (no static
// vendor keys in Bindles, Camps, or this package).
export function createConvexProvider(
	options: ConvexProviderOptions = {},
): CloudProvider {
	const regions = options.regions ?? DEFAULT_REGIONS;
	const published = publishCapabilityManifest({ regions });
	const capabilities = INITIAL_CAPABILITY_PORTS.map((classKey) =>
		makeCapability(classKey),
	);

	return {
		id: CONVEX_PROVIDER_ID,
		regions: [...regions],
		capabilities,
		realize(plan: ResourcePlan) {
			return realizeResourcePlan(plan);
		},
		capabilityManifest(): CapabilityManifest {
			return {
				providerId: CONVEX_PROVIDER_ID,
				published,
				capabilities: JSON.parse(
					published["/.well-known/capability-manifest/capabilities.json"],
				),
				auth: JSON.parse(
					published["/.well-known/capability-manifest/auth.json"],
				),
				cost: JSON.parse(
					published["/.well-known/capability-manifest/cost.json"],
				),
			};
		},
		client(port: PortKind, outputs: Outputs): ProviderClient {
			const classKey = PORT_TO_CLASS[port];
			if (!classKey) {
				throw new Error(`convex provider has no client for port ${port}`);
			}
			const mapping = EQUIVALENCE_CLASSES[classKey];
			return {
				port,
				resourceClass: mapping.resourceClass,
				providerService: mapping.providerService,
				bindings: outputs,
			};
		},
	};
}
