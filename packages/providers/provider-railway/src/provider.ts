import {
	EQUIVALENCE_CLASSES,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
import { PROVIDER_TARGET } from "./options.js";
import {
	parseRailwayBindings,
	parseRailwayPort,
	parseRailwayResourcePlan,
	type RailwayPortKind,
} from "./parse.js";
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
	return {
		port,
		satisfies(req: PortRequest): Match {
			if (req.port !== port) return { kind: "none" };
			const missing = (req.features ?? []).filter((f) => !features.includes(f));
			return missing.length === 0
				? { kind: "full" }
				: { kind: "partial", missing };
		},
		estimateCost(_req: PortRequest): CostSignal {
			return {
				currency: "USD",
				// The resource class already carries the `railway:` prefix; the
				// SKU is that class, not the class with the provider name in
				// front of it twice.
				sku: mapping.resourceClass,
				unit: "request",
				// Not free — unpriced. This package publishes no cost facts, so
				// there is nothing dated to rank on.
				marginalPrice: "0",
			};
		},
	};
}

const PORT_TO_CLASS = Object.fromEntries(
	INITIAL_CAPABILITY_PORTS.map((key) => [EQUIVALENCE_CLASSES[key].port, key]),
) as Record<string, InitialCapabilityPort>;

/**
 * Every parsed port has a class by construction — `RailwayPortKind` is derived
 * from this very table — so this lookup is total and the throw is a repo bug,
 * not an input error.
 */
function equivalenceFor(port: RailwayPortKind) {
	const classKey = PORT_TO_CLASS[port];
	if (!classKey) {
		throw new Error(`railway equivalence table is missing port ${port}`);
	}
	return EQUIVALENCE_CLASSES[classKey];
}

export function createRailwayProvider(): CloudProvider {
	const capabilities = INITIAL_CAPABILITY_PORTS.map((key) =>
		makeCapability(key),
	);
	return {
		id: `@hobo/provider-${PROVIDER_TARGET}`,
		regions: ["global"],
		capabilities,
		realize(plan: ResourcePlan) {
			// The plan crosses the parser here, so nothing below re-checks the
			// port or the name: `parsed.port` is realizable and `parsed.name` is
			// already a DNS label.
			const parsed = parseRailwayResourcePlan(plan);
			const mapping = equivalenceFor(parsed.port);
			return {
				driver: {
					apiVersion: "hobo.driver-program/v1",
					driver: `${PROVIDER_TARGET}-deploy`,
					resources: [
						{
							name: parsed.name,
							type: mapping.resourceClass,
							provider: PROVIDER_TARGET,
						},
					],
				},
			};
		},
		capabilityManifest(): CapabilityManifest {
			return {
				providerId: `@hobo/provider-${PROVIDER_TARGET}`,
				published: {},
				capabilities: {
					capabilities: capabilities.map((c) => ({ port: c.port })),
				},
				auth: { exchange: "hobo:brokered-deploy-token", staticSecrets: false },
				cost: { facts: [] },
			};
		},
		client(port: PortKind, outputs: Outputs): ProviderClient {
			const parsedPort = parseRailwayPort(port);
			const mapping = equivalenceFor(parsedPort);
			return {
				port: parsedPort,
				resourceClass: mapping.resourceClass,
				providerService: mapping.providerService,
				bindings: parseRailwayBindings(outputs),
			};
		},
	};
}
