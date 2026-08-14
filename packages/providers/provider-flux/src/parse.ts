export type FluxSourceKind = "oci" | "git";
export type FluxTier = "community-free" | "paid-multi-instance";
export type FluxEnvironment = "preview" | "production";
export type FluxPrimitive =
	| "web"
	| "api"
	| "service"
	| "actor"
	| "data"
	| "kv"
	| "queue"
	| "bucket";

export class FluxProviderError extends Error {
	readonly code:
		| "PARSE"
		| "DIGEST_REQUIRED"
		| "WEBHOOK_UNSIGNED"
		| "STATUS_LOGS_PUBLIC"
		| "SECRET_MATERIAL"
		| "PRIMITIVE_UNSUPPORTED"
		| "COMMUNITY_PRODUCTION"
		| "RESIDENCY_UNMAPPED"
		| "CONTROL_PLANE_ON_COMMUNITY";

	constructor(code: FluxProviderError["code"], message: string) {
		super(message);
		this.name = "FluxProviderError";
		this.code = code;
	}
}

// domain-view: parse-don't-validate parsed/derived type; wire form is FluxDeploySpec in data-models/provider_flux.proto.
export interface FluxDeploySpec {
	readonly source: FluxSourceKind;
	readonly imageDigest?: string;
	readonly gitRepository?: string;
	readonly webhookSecretRef?: string;
	readonly apiKeySecretRef?: string;
	readonly webhookSigned: boolean;
	readonly statusLogsAuthenticated: boolean;
	readonly tier: FluxTier;
	readonly environment: FluxEnvironment;
	readonly primitives: readonly FluxPrimitive[];
	readonly hostsRivetControlPlane?: boolean;
	readonly residencyRegion?: string;
}

const SOURCES = new Set<FluxSourceKind>(["oci", "git"]);
const TIERS = new Set<FluxTier>(["community-free", "paid-multi-instance"]);
const ENVS = new Set<FluxEnvironment>(["preview", "production"]);
const SUPPORTED = new Set<FluxPrimitive>(["web", "api", "service"]);

function isLocator(value: string, path: string): string {
	if (/token|password|sk-|AKIA/iu.test(value) || value.includes("://")) {
		throw new FluxProviderError(
			"SECRET_MATERIAL",
			`${path} must be a secretRef locator`,
		);
	}
	return value;
}

export function parseFluxDeploySpec(input: unknown): FluxDeploySpec {
	if (typeof input !== "object" || input === null) {
		throw new FluxProviderError("PARSE", "flux deploy spec must be an object");
	}
	const record = input as Record<string, unknown>;
	const source = record.source;
	if (typeof source !== "string" || !SOURCES.has(source as FluxSourceKind)) {
		throw new FluxProviderError("PARSE", "source must be oci|git");
	}
	const tier = record.tier;
	if (typeof tier !== "string" || !TIERS.has(tier as FluxTier)) {
		throw new FluxProviderError(
			"PARSE",
			"tier must be community-free|paid-multi-instance",
		);
	}
	const environment = record.environment;
	if (
		typeof environment !== "string" ||
		!ENVS.has(environment as FluxEnvironment)
	) {
		throw new FluxProviderError(
			"PARSE",
			"environment must be preview|production",
		);
	}
	const primitivesRaw = record.primitives;
	if (!Array.isArray(primitivesRaw) || primitivesRaw.length === 0) {
		throw new FluxProviderError(
			"PARSE",
			"primitives must be a non-empty array",
		);
	}
	const primitives = primitivesRaw.map((item) => {
		if (typeof item !== "string") {
			throw new FluxProviderError("PARSE", "primitive must be a string");
		}
		return item as FluxPrimitive;
	});
	for (const primitive of primitives) {
		if (!SUPPORTED.has(primitive)) {
			throw new FluxProviderError(
				"PRIMITIVE_UNSUPPORTED",
				`Flux does not realize ${primitive}; use an actor/data/kv/queue/bucket provider or an explicit recipe`,
			);
		}
	}
	if (record.hostsRivetControlPlane === true && tier === "community-free") {
		throw new FluxProviderError(
			"CONTROL_PLANE_ON_COMMUNITY",
			"Rivet control plane must not run on community Flux nodes",
		);
	}
	if (record.residencyRegion === "") {
		throw new FluxProviderError(
			"RESIDENCY_UNMAPPED",
			"unmapped residency region fails closed (ADR-0146)",
		);
	}
	const spec: FluxDeploySpec = {
		source: source as FluxSourceKind,
		webhookSigned: record.webhookSigned === true,
		statusLogsAuthenticated: record.statusLogsAuthenticated === true,
		tier: tier as FluxTier,
		environment: environment as FluxEnvironment,
		primitives,
		...(typeof record.imageDigest === "string"
			? { imageDigest: record.imageDigest }
			: {}),
		...(typeof record.gitRepository === "string"
			? { gitRepository: record.gitRepository }
			: {}),
		...(typeof record.webhookSecretRef === "string"
			? {
					webhookSecretRef: isLocator(
						record.webhookSecretRef,
						"webhookSecretRef",
					),
				}
			: {}),
		...(typeof record.apiKeySecretRef === "string"
			? {
					apiKeySecretRef: isLocator(record.apiKeySecretRef, "apiKeySecretRef"),
				}
			: {}),
		...(record.hostsRivetControlPlane === true
			? { hostsRivetControlPlane: true }
			: {}),
		...(typeof record.residencyRegion === "string"
			? { residencyRegion: record.residencyRegion }
			: {}),
	};
	return Object.freeze(spec);
}

export interface FluxApplyReceipt {
	readonly applied: boolean;
	readonly source: FluxSourceKind;
	readonly orbitMode: boolean;
}

export function applyFluxDeploy(spec: FluxDeploySpec): FluxApplyReceipt {
	if (spec.environment === "production") {
		if (spec.source !== "oci" || !spec.imageDigest?.startsWith("sha256:")) {
			throw new FluxProviderError(
				"DIGEST_REQUIRED",
				"production Flux apply requires source=oci and an image digest",
			);
		}
		if (!spec.webhookSigned) {
			throw new FluxProviderError(
				"WEBHOOK_UNSIGNED",
				"production Flux apply requires a signed webhook",
			);
		}
		if (!spec.statusLogsAuthenticated) {
			throw new FluxProviderError(
				"STATUS_LOGS_PUBLIC",
				"production Flux apply requires API_KEY so /status and /health are not public",
			);
		}
		if (spec.tier === "community-free") {
			throw new FluxProviderError(
				"COMMUNITY_PRODUCTION",
				"production-like Flux workloads require paid multi-instance",
			);
		}
	}
	return {
		applied: true,
		source: spec.source,
		orbitMode: spec.source === "git",
	};
}

export const FLUX_RIVET_RUNNER_RECIPE = {
	id: "rivet-runners-on-flux",
	controlPlane: "trusted-yard",
	runners: "flux-outbound-only",
} as const;
