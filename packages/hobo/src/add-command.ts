import type { CommandModule, YardRuntime } from "@hobo/cli";
import { DEFAULT_TENANT } from "@hobo/cli";
import {
	approveProviderFact,
	collectStream,
	foldRegistryStream,
	type RegistrableProvider,
	registerProviderFact,
} from "@hobo/cloud";
import type { PrincipalRef } from "@hobo/core";

import { createLocalProvider } from "./local-provider.js";

// The durable stream the registry catalog is projected from — `hobo add` appends
// `provider.Registered` (+ `provider.Approved`) facts here; the Registry folds
// them and the event-backed PlannerRegistry makes approved providers matchable.
export const REGISTRY_STREAM = "registry:default";

const ADD_ACTOR: PrincipalRef = { kind: "system", id: "yard/registry" };

// The catalog of installable providers/listings. Each entry is a REAL
// Capability-Manifest-bearing provider that ships with HoBo — installing it
// records its manifest into the registry so the Planner can match against it.
// Adapter slices extend this catalog via `registerInstallable` (M1–M4 of the
// default-providers plan) instead of editing this map.
const INSTALLABLE = new Map<string, () => RegistrableProvider>([
	["local", createLocalProvider],
]);

// Extend the installable catalog with a new provider entry (idempotent per id;
// the last registration wins). This is the seam each default-provider adapter
// package uses to make itself `hobo add`-able.
export function registerInstallable(
	id: string,
	factory: () => RegistrableProvider,
): void {
	INSTALLABLE.set(id, factory);
}

export function installableProviders(): string[] {
	return [...INSTALLABLE.keys()].sort();
}

export interface AddCommandDeps {
	// The shared Yard runtime whose durable log records the installed provider.
	readonly runtime?: YardRuntime;
	// Override the installable catalog (tests).
	readonly catalog?: Record<string, () => RegistrableProvider>;
}

// `hobo add <provider>` — install a provider or listing into the registry. It
// records the provider's Capability Manifest as a durable `provider.Registered`
// fact plus, by default, a `provider.Approved` fact — approval is what makes
// the provider matchable (walkthrough Part 0/2 "default providers approved").
// `--hold` registers WITHOUT approval (registered-but-unmatchable); re-running
// `hobo add <provider>` on a held provider records the approval. Reads/writes
// only the local event store — no cloud call, no credential.
export function createAddCommand(deps: AddCommandDeps = {}): CommandModule {
	return {
		run: async ({ args, flags, emitProgress }) => {
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

			const catalog = deps.catalog
				? new Map(Object.entries(deps.catalog))
				: INSTALLABLE;
			const hold = Boolean((flags as { hold?: boolean }).hold);
			const id = args[0];
			const available = [...catalog.keys()].sort();
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

			const factory = catalog.get(id);
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
			const fold = foldRegistryStream(events);
			const installed = fold.installed.has(id);
			const approved = fold.approved.has(id);
			const lastSeq = events.at(-1)?.seq ?? 0;

			if (installed && approved) {
				return {
					ok: true,
					status: "already_installed",
					code: "HOBO_OK",
					message: `hobo add: provider "${id}" is already installed and approved.`,
					data: { command: "add", provider: id, approved: true },
				};
			}

			if (installed && !approved && hold) {
				return {
					ok: true,
					status: "already_installed",
					code: "HOBO_OK",
					message: `hobo add: provider "${id}" is already installed (held — run \`hobo add ${id}\` to approve).`,
					data: { command: "add", provider: id, approved: false },
				};
			}

			if (installed && !approved) {
				// Approval of a previously-held provider.
				await runtime.store.append(
					REGISTRY_STREAM,
					[approveProviderFact(id, ADD_ACTOR.id)],
					{ expectedSeq: lastSeq, actor: ADD_ACTOR, tenant: DEFAULT_TENANT },
				);
				await runtime.registry.refresh?.();
				emitProgress(`approved ${id}`);
				return {
					ok: true,
					status: "approved",
					code: "HOBO_OK",
					message: `hobo add: approved provider "${id}" — it is now matchable.`,
					data: { command: "add", provider: id, approved: true },
				};
			}

			const provider = factory();
			const facts = [registerProviderFact(provider)];
			if (!hold) facts.push(approveProviderFact(id, ADD_ACTOR.id));
			await runtime.store.append(REGISTRY_STREAM, facts, {
				expectedSeq: lastSeq,
				actor: ADD_ACTOR,
				tenant: DEFAULT_TENANT,
			});
			await runtime.registry.refresh?.();
			const ports = provider.capabilities.map((c) => c.port).sort();
			emitProgress(
				`installed ${id}: ${ports.join(", ")}${hold ? " (held)" : ""}`,
			);

			return {
				ok: true,
				status: "installed",
				code: "HOBO_OK",
				message: hold
					? `hobo add: installed provider "${id}" (${ports.join(", ")}) — held; run \`hobo add ${id}\` to approve.`
					: `hobo add: installed provider "${id}" (${ports.join(", ")}).`,
				data: {
					command: "add",
					provider: id,
					ports,
					regions: [...provider.regions],
					approved: !hold,
				},
			};
		},
	};
}
