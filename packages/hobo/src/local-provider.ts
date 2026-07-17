import type { RegistrableProvider } from "@hobo/cloud";

// Build a Capability-Manifest-bearing `RegistrableProvider` from a port spec.
// This is the shared factory behind both the built-in `local` provider and the
// providers `hobo generate` synthesizes: given an id, a set of ports, and a
// region, it produces a real provider whose capabilities/cost/manifest are all
// derived deterministically from the spec — a genuine provider definition, not a
// placeholder.
export function createProviderFromPorts(
	id: string,
	ports: readonly string[],
	region = "local",
): RegistrableProvider {
	return {
		id,
		regions: [region],
		capabilities: ports.map((port) => ({
			port,
			satisfies: (req) =>
				req.port === port
					? { kind: "full" }
					: { kind: "none", missing: [req.port] },
			estimateCost: () => ({
				marginalPrice: "0",
				sku: `${id}-${port}`,
				unit: "hour",
			}),
		})),
		capabilityManifest: () => ({
			providerId: id,
			published: {
				"/.well-known/capability-manifest/index.json": JSON.stringify({
					providerId: id,
					ports: [...ports],
				}),
			},
			capabilities: {
				capabilities: ports.map((port) => ({
					port,
					features: [],
					regions: [region],
				})),
			},
			cost: {
				facts: ports.map((port) => ({
					port,
					sku: `${id}-${port}`,
					unit: "hour",
					marginalPrice: "0",
				})),
			},
		}),
	};
}

// The built-in `local` provider: the runtime-local in-process target `hobo dev`
// already runs on (kv + objectStore, one "local" region, zero cost). Installable
// via `hobo add local`.
export function createLocalProvider(): RegistrableProvider {
	return createProviderFromPorts("local", ["kv", "objectStore"]);
}
