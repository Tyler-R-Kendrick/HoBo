import type { CommandModule, YardRuntime } from "@hobo/cli";

export interface RegistryCommandDeps {
	// The shared Yard runtime whose PlannerRegistry (the provider + capability
	// catalog the Planner matches against) this command lists.
	readonly runtime?: YardRuntime;
}

interface RegistryPort {
	readonly port: string;
	readonly definitions: number;
	readonly features: string[];
	readonly regions: string[];
}

interface RegistryProvider {
	readonly providerId: string;
	readonly ports: RegistryPort[];
}

// `hobo registry` — administer registry artifacts. This read view lists the
// live provider + capability catalog the Planner matches deployments against:
// the content-addressed catalog hash, the registered providers, and the ports
// (with features/regions) each offers. It reads the injected PlannerRegistry
// directly — no cloud call, no credential. (Mutating admin — install/remove — is
// a follow-up; this surfaces what is registered today.)
export function createRegistryCommand(
	deps: RegistryCommandDeps = {},
): CommandModule {
	return {
		run: async ({ emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo registry has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "registry" },
				};
			}

			const registry = runtime.registry;
			const definitions = registry.definitions();

			// Group definitions by provider, then by port.
			const byProvider = new Map<string, Map<string, RegistryPort>>();
			for (const def of definitions) {
				let ports = byProvider.get(def.providerId);
				if (!ports) {
					ports = new Map();
					byProvider.set(def.providerId, ports);
				}
				const existing = ports.get(def.port);
				if (existing) {
					ports.set(def.port, {
						port: def.port,
						definitions: existing.definitions + 1,
						features: [...new Set([...existing.features, ...def.features])],
						regions: [...new Set([...existing.regions, ...def.regions])],
					});
				} else {
					ports.set(def.port, {
						port: def.port,
						definitions: 1,
						features: [...def.features],
						regions: [...def.regions],
					});
				}
			}

			const providers: RegistryProvider[] = registry
				.providers()
				.sort()
				.map((providerId) => ({
					providerId,
					ports: [...(byProvider.get(providerId)?.values() ?? [])].sort(
						(a, b) => a.port.localeCompare(b.port),
					),
				}));

			for (const provider of providers) {
				emitProgress(
					`${provider.providerId}: ${provider.ports.map((p) => p.port).join(", ")}`,
				);
			}

			return {
				ok: true,
				status: "ok",
				code: "HOBO_OK",
				message: `hobo registry: ${providers.length} provider(s), ${definitions.length} definition(s) (catalog ${registry.catalogHash})`,
				data: {
					command: "registry",
					catalogHash: registry.catalogHash,
					providers,
					definitionCount: definitions.length,
				},
			};
		},
	};
}
