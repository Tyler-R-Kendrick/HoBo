import {
	EQUIVALENCE_CLASSES,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
import { CLOUDFLARE_PROVIDER_ID, publishCapabilityManifest } from "./manifest.js";
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

export const DEFAULT_COLOS = ["WNAM", "ENAM", "WEUR"];

// Marginal-cost facts per equivalence class, aligned with the published
// cost.json bundle in manifest.ts.
const COST_FACTS: Record<InitialCapabilityPort, { sku: string; unit: string }> = {
	"web/service": { sku: "cloudflare.workers.request", unit: "request" },
	kv: { sku: "cloudflare.kv.read", unit: "operation" },
	objectStore: { sku: "cloudflare.r2.storage.gb-month", unit: "GB-month" },
};

function makeCapability(classKey: InitialCapabilityPort): Capability {
	const mapping = EQUIVALENCE_CLASSES[classKey];
	const port = mapping.port;
	const features: readonly string[] = mapping.features;
	const facts = COST_FACTS[classKey];

	return {
		port,
		satisfies(req: PortRequest): Match {
			if (req.port !== port) {
				return { kind: "none" };
			}
			const missing = (req.features ?? []).filter((feature) => !features.includes(feature));
			return missing.length === 0 ? { kind: "full" } : { kind: "partial", missing };
		},
		estimateCost(_req: PortRequest): CostSignal {
			return {
				currency: "USD",
				sku: facts.sku,
				unit: facts.unit,
				marginalPrice: "0.0000",
				freeTier: { unit: facts.unit, included: 100_000, reset: "monthly" },
			};
		},
	};
}

const PORT_TO_CLASS: Record<string, InitialCapabilityPort> = {
	compute: "web/service",
	kv: "kv",
	objectStore: "objectStore",
};

export interface CloudflareProviderOptions {
	colos?: string[];
}

export function createCloudflareProvider(options: CloudflareProviderOptions = {}): CloudProvider {
	const colos = options.colos ?? DEFAULT_COLOS;
	const published = publishCapabilityManifest({ colos });
	const capabilities = INITIAL_CAPABILITY_PORTS.map((classKey) => makeCapability(classKey));

	return {
		id: CLOUDFLARE_PROVIDER_ID,
		regions: [...colos],
		capabilities,
		realize(plan: ResourcePlan) {
			return realizeResourcePlan(plan);
		},
		capabilityManifest(): CapabilityManifest {
			return {
				providerId: CLOUDFLARE_PROVIDER_ID,
				published,
				capabilities: JSON.parse(published["/.well-known/capability-manifest/capabilities.json"]),
				auth: JSON.parse(published["/.well-known/capability-manifest/auth.json"]),
				cost: JSON.parse(published["/.well-known/capability-manifest/cost.json"]),
			};
		},
		client(port: PortKind, outputs: Outputs): ProviderClient {
			const classKey = PORT_TO_CLASS[port];
			if (!classKey) {
				throw new Error(`cloudflare provider has no client for port ${port}`);
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
