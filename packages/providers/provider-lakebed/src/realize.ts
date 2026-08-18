import type { RoutingPlan } from "@hobo/core";

import {
	assertDriverProgram,
	DRIVER_PROGRAM_API_VERSION,
	DRIVER_PROGRAM_KIND,
	type DriverProgram,
	type DriverResource,
	LAKEBED_DRIVER,
} from "./driver-program.js";
import {
	EQUIVALENCE_CLASSES,
	type InitialCapabilityPort,
} from "./equivalence.js";
import { LAKEBED_PROVIDER_TARGET, type TypedOptionBlock } from "./options.js";
import type { ResourcePlan } from "./types.js";

// Reverse of EQUIVALENCE_CLASSES: capability PortKind -> equivalence class key.
const PORT_TO_CLASS = {
	compute: "web/service",
	kv: "kv",
	objectStore: "objectStore",
	database: "database/reactive",
} as const satisfies Record<string, InitialCapabilityPort>;

export type RealizablePort = keyof typeof PORT_TO_CLASS;

const OUTPUTS_BY_CLASS: Record<string, string[]> = {
	"lakebed:capsule": ["url", "capsuleId", "binding"],
	"lakebed:capsule-kv": ["namespace", "binding"],
	"lakebed:file-store": ["storeName", "binding"],
	"lakebed:reactive-db": ["endpoint", "binding"],
	"lakebed:traffic-route": ["routeId", "binding"],
};

const PRIMARY_OUTPUT: Record<string, string> = {
	"lakebed:capsule": "url",
	"lakebed:capsule-kv": "namespace",
	"lakebed:file-store": "storeName",
	"lakebed:reactive-db": "endpoint",
	"lakebed:traffic-route": "routeId",
};

export function isRealizablePort(port: string): port is RealizablePort {
	return port in PORT_TO_CLASS;
}

export function resolveEquivalence(port: string) {
	if (!isRealizablePort(port)) {
		throw new Error(`lakebed provider cannot realize port ${port}`);
	}
	return EQUIVALENCE_CLASSES[PORT_TO_CLASS[port]];
}

/** Merge only Lakebed-owned option blocks; foreign provider blocks drop. */
export function mergeLakebedOptions(
	// Core's ResourcePlan carries opaque option blocks (ADR-0156); every HoBo
	// `.with(...)` builder emits the shared TypedOptionBlock shape, and
	// foreign-provider blocks drop below by providerId.
	options: ResourcePlan["options"] = [],
): Record<string, unknown> {
	const merged: Record<string, unknown> = {};
	for (const block of options as TypedOptionBlock[]) {
		if (block.providerId !== LAKEBED_PROVIDER_TARGET) {
			continue;
		}
		Object.assign(merged, block.options);
	}
	return merged;
}

function buildResource(
	plan: ResourcePlan,
	withBindRefs: boolean,
): DriverResource {
	const mapping = resolveEquivalence(plan.port);
	const bindings = (plan.deps ?? []).map((dep) =>
		withBindRefs
			? { resource: dep, ref: "${resources." + dep + ".outputs.binding}" }
			: { providerResourceId: dep },
	);

	return {
		name: plan.name,
		type: mapping.resourceClass,
		provider: LAKEBED_PROVIDER_TARGET,
		inputs: {
			port: plan.port,
			providerService: mapping.providerService,
			features: [...mapping.features],
			options: mergeLakebedOptions(plan.options),
			bindings,
		},
		outputs: OUTPUTS_BY_CLASS[mapping.resourceClass] ?? ["binding"],
	};
}

function primaryRef(resource: DriverResource): string {
	const output = PRIMARY_OUTPUT[resource.type] ?? "binding";
	return "${resources." + resource.name + ".outputs." + output + "}";
}

/**
 * Realize a single provider-neutral ResourcePlan into a one-resource Lakebed
 * deploy-driver program (ADR-0127: a Driver, not IaC — the closed PaaS
 * exposes a deploy surface, not infrastructure state).
 */
export function realizeResourcePlan(plan: ResourcePlan): {
	driver: DriverProgram;
} {
	const resource = buildResource(plan, false);
	const deploymentId = plan.deploymentId ?? plan.name;
	return {
		driver: {
			apiVersion: DRIVER_PROGRAM_API_VERSION,
			kind: DRIVER_PROGRAM_KIND,
			driver: LAKEBED_DRIVER,
			deploymentId,
			capsule: `capsule/${deploymentId}`,
			resources: [resource],
			outputs: { [`${plan.name}.endpoint`]: primaryRef(resource) },
		},
	};
}

/**
 * Realize a whole DeploymentPlan (multiple resources with bind edges) into
 * one multi-resource driver program whose bind references resolve across
 * resources — a single Capsule deploy call.
 */
export function realizeResourcePlans(
	plans: ResourcePlan[],
	options: { deploymentId?: string } = {},
): { driver: DriverProgram } {
	if (plans.length === 0) {
		throw new Error("cannot realize an empty deployment plan");
	}
	const resources = plans.map((plan) => buildResource(plan, true));
	const deploymentId = options.deploymentId ?? "hello-bindle-lakebed";
	const first = resources[0] as DriverResource;
	return {
		driver: {
			apiVersion: DRIVER_PROGRAM_API_VERSION,
			kind: DRIVER_PROGRAM_KIND,
			driver: LAKEBED_DRIVER,
			deploymentId,
			capsule: `capsule/${deploymentId}`,
			resources,
			outputs: { endpoint: primaryRef(first) },
		},
	};
}

/**
 * Realize a TrafficRouting plan as a deploy-time `lakebed:traffic-route`
 * driver resource (ADR-0143 dual-layer Lakebed adapter). Lakebed has no
 * multi-LB API; this binds capsule endpoints / domain intent for lakebed-deploy.
 */
export function realizeTrafficRoutingPlan(
	plan: RoutingPlan,
	options: { deploymentId?: string; capsule?: string } = {},
): { driver: DriverProgram } {
	const deploymentId =
		options.deploymentId?.trim() || sanitizeDriverId(plan.planId) || "traffic";
	const capsule =
		options.capsule?.trim() ||
		`capsule/${sanitizeDriverId(plan.intent.service) || "service"}`;
	const resourceName = `route-${sanitizeDriverId(plan.planId)}`;
	const resource: DriverResource = {
		name: resourceName,
		type: "lakebed:traffic-route",
		provider: LAKEBED_PROVIDER_TARGET,
		inputs: {
			planId: plan.planId,
			service: plan.intent.service,
			tenantId: plan.intent.tenantId,
			backends: plan.backends.map((backend) => ({
				id: backend.id,
				service: backend.service,
				...(backend.endpoint === undefined
					? {}
					: { endpoint: backend.endpoint }),
				...(backend.weight === undefined ? {} : { weight: backend.weight }),
				...(backend.locationHints === undefined
					? {}
					: { locationHints: [...backend.locationHints] }),
			})),
			rules: plan.intent.rules.map((rule) => ({
				weightStrategy: rule.weightStrategy,
				...(rule.match
					? {
							match: {
								...(rule.match.pathPrefix
									? { pathPrefix: rule.match.pathPrefix }
									: {}),
								...(rule.match.headers
									? { headers: { ...rule.match.headers } }
									: {}),
							},
						}
					: {}),
				backends: rule.backends.map((backend) => backend.id),
			})),
		},
		outputs: OUTPUTS_BY_CLASS["lakebed:traffic-route"] ?? [
			"routeId",
			"binding",
		],
	};
	const driver: DriverProgram = {
		apiVersion: DRIVER_PROGRAM_API_VERSION,
		kind: DRIVER_PROGRAM_KIND,
		driver: LAKEBED_DRIVER,
		deploymentId,
		capsule,
		resources: [resource],
		outputs: {
			routeId: primaryRef(resource),
			binding: "${resources." + resourceName + ".outputs.binding}",
		},
	};
	return { driver: assertDriverProgram(driver) };
}

function sanitizeDriverId(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
}
