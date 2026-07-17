import type { RegistrableProvider } from "@hobo/cloud";

// A genuine second provider for the registry: the runtime-local in-process
// target `hobo dev` already runs on. It offers the `kv` and `objectStore` ports
// backed by the local component host (zero cost, single "local" region). This is
// a real Capability-Manifest-bearing provider — installable via `hobo add local`
// — not a placeholder: its ports are exactly what the offline hello-bindle binds.
export function createLocalProvider(): RegistrableProvider {
	const ports = ["kv", "objectStore"] as const;
	return {
		id: "local",
		regions: ["local"],
		capabilities: ports.map((port) => ({
			port,
			satisfies: (req) =>
				req.port === port
					? { kind: "full" }
					: { kind: "none", missing: [req.port] },
			estimateCost: () => ({
				marginalPrice: "0",
				sku: `local-${port}`,
				unit: "hour",
			}),
		})),
		capabilityManifest: () => ({
			providerId: "local",
			published: {
				"/.well-known/capability-manifest/index.json": JSON.stringify({
					providerId: "local",
					ports,
				}),
			},
			capabilities: {
				capabilities: ports.map((port) => ({
					port,
					features: [],
					regions: ["local"],
				})),
			},
			cost: {
				facts: ports.map((port) => ({
					port,
					sku: `local-${port}`,
					unit: "hour",
					marginalPrice: "0",
				})),
			},
		}),
	};
}
