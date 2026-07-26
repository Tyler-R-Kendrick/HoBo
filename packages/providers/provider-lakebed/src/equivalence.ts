// Lakebed equivalence classes (ADR-0127): the head-on competitor's closed
// PaaS surface mapped honestly onto HoBo's agnostic ports. Feature lists are
// deliberately NARROW — a closed Capsule runtime cannot claim container or
// postgres semantics, so `require` misses surface as partial(missing)
// verdicts with remediation, never fabricated parity.
export const EQUIVALENCE_CLASSES = Object.freeze({
	"web/service": {
		port: "compute",
		resourceClass: "lakebed:capsule",
		providerService: "Capsule",
		features: ["capsule", "http", "managed", "sync-rpc"],
	},
	kv: {
		port: "kv",
		resourceClass: "lakebed:capsule-kv",
		providerService: "Capsule KV",
		features: ["key-value", "durable"],
	},
	objectStore: {
		port: "objectStore",
		resourceClass: "lakebed:file-store",
		providerService: "File Store",
		features: ["durable"],
	},
	"database/reactive": {
		port: "database",
		resourceClass: "lakebed:reactive-db",
		providerService: "Reactive DB",
		features: ["document", "reactive", "managed"],
	},
} as const);

export type InitialCapabilityPort = keyof typeof EQUIVALENCE_CLASSES;

export const INITIAL_CAPABILITY_PORTS = Object.freeze(
	Object.keys(EQUIVALENCE_CLASSES) as InitialCapabilityPort[],
);

export function equivalenceForPort(port: InitialCapabilityPort) {
	return EQUIVALENCE_CLASSES[port];
}
