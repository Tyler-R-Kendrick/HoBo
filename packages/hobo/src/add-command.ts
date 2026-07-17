import type { CommandModule, YardRuntime } from "@hobo/cli";
import { DEFAULT_TENANT } from "@hobo/cli";
import {
	collectStream,
	type RegistrableProvider,
	registerProviderFact,
	registryCatalogProjection,
} from "@hobo/cloud";
import type { PrincipalRef } from "@hobo/core";

import { createLocalProvider } from "./local-provider.js";

// The durable stream the registry catalog is projected from — `hobo add` appends
// `provider.Registered` facts here and `hobo registry` folds them.
export const REGISTRY_STREAM = "registry:default";

const ADD_ACTOR: PrincipalRef = { kind: "system", id: "yard/registry" };

// The catalog of installable providers/listings. Each entry is a REAL
// Capability-Manifest-bearing provider that ships with HoBo — installing it
// records its manifest into the registry so the Planner can match against it.
const INSTALLABLE: Record<string, () => RegistrableProvider> = {
	local: createLocalProvider,
};

export interface AddCommandDeps {
	// The shared Yard runtime whose durable log records the installed provider.
	readonly runtime?: YardRuntime;
	// Override the installable catalog (tests).
	readonly catalog?: Record<string, () => RegistrableProvider>;
}

// `hobo add <provider>` — install a provider or listing into the registry. It
// records the provider's Capability Manifest as a durable `provider.Registered`
// fact; the Registry catalog folds it, and the Planner can then match resources
// to the newly-installed provider. Reads/writes only the local event store — no
// cloud call, no credential.
export function createAddCommand(deps: AddCommandDeps = {}): CommandModule {
	const catalog = deps.catalog ?? INSTALLABLE;
	return {
		run: async ({ args, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo add has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "add" },
				};
			}

			const id = args[0];
			const available = Object.keys(catalog).sort();
			if (!id) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_ADD_NO_PROVIDER",
					message: `hobo add needs a provider: \`hobo add <provider>\`. Available: ${available.join(", ")}.`,
					remediation: [
						`Try: ${available.map((a) => `hobo add ${a}`).join(", ")}.`,
					],
					data: { command: "add", available },
				};
			}

			const factory = catalog[id];
			if (!factory) {
				return {
					ok: false,
					status: "unknown_provider",
					code: "HOBO_ADD_UNKNOWN",
					message: `hobo add: no installable provider "${id}". Available: ${available.join(", ")}.`,
					remediation: [`Available providers: ${available.join(", ")}.`],
					data: { command: "add", provider: id, available },
				};
			}

			const events = await collectStream(runtime.store, REGISTRY_STREAM);
			const installed = registryCatalogProjection.query(
				registryCatalogProjection.fold(events),
			);
			if (installed.some((row) => row.providerId === id)) {
				return {
					ok: true,
					status: "already_installed",
					code: "HOBO_OK",
					message: `hobo add: provider "${id}" is already installed.`,
					data: { command: "add", provider: id },
				};
			}

			const provider = factory();
			const fact = registerProviderFact(provider);
			const lastSeq = events.length > 0 ? events[events.length - 1]!.seq : 0;
			await runtime.store.append(REGISTRY_STREAM, [fact], {
				expectedSeq: lastSeq,
				actor: ADD_ACTOR,
				tenant: DEFAULT_TENANT,
			});
			const ports = provider.capabilities.map((c) => c.port).sort();
			emitProgress(`installed ${id}: ${ports.join(", ")}`);

			return {
				ok: true,
				status: "installed",
				code: "HOBO_OK",
				message: `hobo add: installed provider "${id}" (${ports.join(", ")}).`,
				data: {
					command: "add",
					provider: id,
					ports,
					regions: [...provider.regions],
				},
			};
		},
	};
}
