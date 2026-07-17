import type { CommandModule, YardRuntime } from "@hobo/cli";
import { collectStream, registryCatalogProjection } from "@hobo/cloud";

import { REGISTRY_STREAM } from "./add-command.js";

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
	// "base" = built into the runtime; "installed" = added via `hobo add`.
	readonly source: "base" | "installed";
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
					source: "base" as const,
				}));

			// Providers installed via `hobo add` — folded from the durable registry
			// stream (registryCatalogProjection). Merged after the base providers.
			const installedRows = registryCatalogProjection.query(
				registryCatalogProjection.fold(
					await collectStream(runtime.store, REGISTRY_STREAM),
				),
			);
			const baseIds = new Set(providers.map((p) => p.providerId));
			const installed: RegistryProvider[] = installedRows
				.filter((row) => !baseIds.has(row.providerId))
				.map((row) => ({
					providerId: row.providerId,
					ports: [...row.ports].sort().map((port) => ({
						port,
						definitions: 1,
						features: [],
						regions: [],
					})),
					source: "installed" as const,
				}))
				.sort((a, b) => a.providerId.localeCompare(b.providerId));

			const allProviders = [...providers, ...installed];
			const definitionCount =
				definitions.length +
				installedRows.reduce((n, row) => n + row.definitionCount, 0);

			for (const provider of allProviders) {
				emitProgress(
					`${provider.providerId} (${provider.source}): ${provider.ports.map((p) => p.port).join(", ")}`,
				);
			}

			return {
				ok: true,
				status: "ok",
				code: "HOBO_OK",
				message: `hobo registry: ${allProviders.length} provider(s) (${installed.length} installed), ${definitionCount} definition(s) (catalog ${registry.catalogHash})`,
				data: {
					command: "registry",
					catalogHash: registry.catalogHash,
					providers: allProviders,
					definitionCount,
				},
			};
		},
	};
}
