import type { IacProgram } from "./iac-program.js";
import type { PublishedManifestDocuments } from "./manifest.js";
import type { BuildSpec } from "./realize.js";

// Capability port kind as used by the control-plane CloudProvider contract
// (control-plane.md "Port & provider interfaces"): "compute" | "kv" |
// "objectStore" | ... — distinct from @hobo/core's structural PortKind
// ("runtime" | "provider" | "port").
export type PortKind = string;

export type Outputs = Record<string, unknown>;

/** Requested capability shape a provider must satisfy/negotiate. */
export interface PortRequest {
	port: PortKind;
	features?: string[];
	negotiation?: "prefer" | "require";
	region?: string;
}

/** Capability-negotiation verdict: full | partial(missing) | none. */
export type Match =
	| { kind: "full" }
	| { kind: "partial"; missing: string[] }
	| { kind: "none" };

/** Plan-time marginal-cost signal the Dispatcher ranks candidates by. */
export interface CostSignal {
	currency: string;
	sku: string;
	unit: string;
	marginalPrice: string;
	freeTier: { unit: string; included: number; reset: string };
}

export interface Capability {
	port: PortKind;
	satisfies(req: PortRequest): Match;
	estimateCost(req: PortRequest): CostSignal;
}

/** Machine-readable capability manifest handle (control-plane.md Plan 6). */
export interface CapabilityManifest {
	providerId: string;
	published: PublishedManifestDocuments;
	capabilities: Record<string, unknown>;
	auth: Record<string, unknown>;
	cost: Record<string, unknown>;
}

/** Runtime binding client returned for `ctx.bindings`. */
export interface ProviderClient {
	port: PortKind;
	resourceClass: string;
	providerService: string;
	bindings: Outputs;
}

export interface CloudProvider {
	id: string;
	regions: string[];
	capabilities: Capability[];
	realize(plan: ResourcePlan): { iac: IacProgram; build?: BuildSpec };
	capabilityManifest(): CapabilityManifest;
	client(port: PortKind, outputs: Outputs): ProviderClient;
}

// Provider-neutral resource emitted by the Planner (control-plane.md Plan 8:
// ResourcePlan{ name, port, provider, options, deps, strategy }).
export interface ResourcePlan {
	name: string;
	port: PortKind;
	provider: string;
	options?: import("./hello-bindle.js").TypedOptionBlock[];
	deps?: string[];
	strategy?: string;
	region?: string;
	deploymentId?: string;
	build?: { artifactId: string; source: string; target: string };
}
