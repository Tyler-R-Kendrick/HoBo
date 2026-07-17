import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { CollectionContext, CollectionTarget } from "@hobo/bindles";
import type { DevRuntime, YardRuntime } from "@hobo/cli";
import {
	createInProcessCredentialBroker,
	createInProcessExecutor,
	createRegistryFromProviders,
	type RegistrableProvider,
} from "@hobo/cloud";
import type {
	ComponentHostEvent,
	EventStore,
	InterfaceId,
	ParsedComponentDescriptor,
	ProviderDescriptor,
} from "@hobo/core";
import { createInMemoryActorHost } from "@hobo/data";
import {
	type CloudProvider,
	createCloudflareProvider,
} from "@hobo/provider-cloudflare";
import {
	createLocalStreamer,
	createManualClock,
	createRuntimeLocalComponentHost,
	createRuntimeLocalEventStore,
} from "@hobo/runtime-local";

import type { IacProvider } from "@hobo/cloud";

import {
	createPulumiBackedIacProvider,
	type PulumiAutomationAdapter,
} from "./pulumi-iac-provider.js";
import { createVercelDeployProvider } from "./vercel-deploy-provider.js";
import type { VercelFetch } from "./vercel-client.js";
import { createCloudflareDeployProvider } from "./cloudflare-deploy-provider.js";
import type { CloudflareFetch } from "./cloudflare-client.js";

// @hobo/hobo — the composition root (apps layer). It wires HoBo's default
// runtimes so the composed `hobo` binary runs the cloud verbs end to end in the
// LOCAL/MOCKED lane. Every constructor below is REUSED from an adapter/runtime
// package; nothing here reimplements a command or a runtime — this is pure
// composition. Importing adapters here is INWARD (layer 3 -> layer 2) and
// boundary-legal, which is exactly why the default wiring lives at this root
// rather than inside adapter-free `@hobo/cli`.

// ---------------------------------------------------------------------------
// The REAL IaC backend on the deploy path.
//
// The default runtime now drives the REAL @hobo/iac-pulumi adapter via the REAL
// @hobo/provider-cloudflare `realize()` — see `createPulumiBackedIacProvider`.
// The kernel Executor still speaks its shape-A `IacProgram` execution descriptor;
// the bridge resolves each resource's real ResourcePlan from the durable
// `deployment.Planned` fact, lowers it with `provider.realize()` to a
// `hobo.iac-program/v1` program, and applies it through the real adapter. There
// is NO mock IacProvider. HONEST SCOPE: @hobo/iac-pulumi's backend is still its
// in-memory Automation-API stand-in (no live Pulumi/Cloudflare calls) — but the
// real adapter + real realize() are on the deploy path.

// @hobo/provider-cloudflare types its capability-manifest fields more loosely
// (PublishedManifestDocuments / Record<string, unknown>) than @hobo/cloud's
// RegistrableProvider narrows them (Record<string, string> / arrays). The runtime
// shapes already line up — the @hobo/cloud + @hobo/cli registry tests drive
// exactly this provider — so this composition-root adapter simply re-presents the
// CloudProvider as a RegistrableProvider without changing any behavior.
function toRegistrableProvider(provider: CloudProvider): RegistrableProvider {
	return {
		id: provider.id,
		regions: [...provider.regions],
		capabilities: provider.capabilities,
		capabilityManifest: () => {
			const manifest = provider.capabilityManifest();
			return {
				providerId: manifest.providerId,
				// PublishedManifestDocuments has four fixed string keys but no index
				// signature, so TS needs the unknown hop to reach Record<string, string>.
				published: manifest.published as unknown as Record<string, string>,
				capabilities: manifest.capabilities as {
					capabilities?: Array<Record<string, unknown>>;
				},
				cost: manifest.cost as { facts?: Array<Record<string, unknown>> },
			};
		},
	};
}

export interface DefaultYardRuntimeOptions {
	// Durable event-store data directory. Defaults to a fresh OS temp dir (the
	// mocked lane is ephemeral). Provide a stable dir to inspect the event log
	// across runs. Callers that create the runtime directly own closing
	// `runtime.store` when done.
	readonly dataDir?: string;
	// The @hobo/iac-pulumi adapter the deploy path drives. Defaults to a fresh
	// real `createPulumiAutomationAdapter()` (in-memory backend). Injectable so a
	// test can observe/spy the real adapter the composed `up`/`down` runs.
	//
	// NOTE: providing this override FORCES the in-memory Pulumi-backed provider
	// even when `VERCEL_TOKEN` is set — the adapter is a Pulumi adapter, so the
	// override is only meaningful on that lane. Env-based Vercel selection applies
	// to the DEFAULT (un-overridden) path.
	readonly iacAdapter?: PulumiAutomationAdapter;
}

export interface SelectIacProviderDeps {
	// The durable event store the Pulumi-backed provider reads plans from.
	readonly store: EventStore;
	// The real CloudProviders whose `realize()` the Pulumi bridge drives.
	readonly providers: readonly CloudProvider[];
	// Optional Pulumi adapter override (forces the Pulumi lane; see above).
	readonly adapter?: PulumiAutomationAdapter;
	// The environment consulted for `VERCEL_TOKEN` / `CLOUDFLARE_API_TOKEN` +
	// `CLOUDFLARE_ACCOUNT_ID`. Defaults to `process.env`.
	readonly env?: Record<string, string | undefined>;
	// Optional injected transport for the Vercel client (tests mock the network).
	readonly vercelFetch?: VercelFetch;
	// Optional injected transport for the Cloudflare client (tests mock the network).
	readonly cloudflareFetch?: CloudflareFetch;
}

// Select the IaC backend on the deploy path by environment. This is HoBo's
// thesis realized for the clouds actually reachable from its own pipeline, in
// precedence order:
//   - `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` present -> the REAL
//     Cloudflare Workers deploy provider (cred-gated).
//   - else `VERCEL_TOKEN` present -> the REAL Vercel deploy provider (cred-gated).
//   - otherwise -> the in-memory Pulumi-backed provider (fallback).
// A Pulumi `adapter` override always wins (it is a Pulumi adapter), keeping the
// existing spy-adapter tests deterministic regardless of ambient env.
export function selectIacProvider(deps: SelectIacProviderDeps): IacProvider {
	const env = deps.env ?? process.env;
	const cloudflareToken = env.CLOUDFLARE_API_TOKEN;
	const cloudflareAccountId = env.CLOUDFLARE_ACCOUNT_ID;
	const vercelToken = env.VERCEL_TOKEN;
	if (deps.adapter === undefined && cloudflareToken && cloudflareAccountId) {
		return createCloudflareDeployProvider({
			token: cloudflareToken,
			accountId: cloudflareAccountId,
			...(deps.cloudflareFetch !== undefined
				? { fetch: deps.cloudflareFetch }
				: {}),
		});
	}
	if (deps.adapter === undefined && vercelToken) {
		return createVercelDeployProvider({
			token: vercelToken,
			...(deps.vercelFetch !== undefined ? { fetch: deps.vercelFetch } : {}),
		});
	}
	return createPulumiBackedIacProvider({
		store: deps.store,
		providers: deps.providers,
		...(deps.adapter !== undefined ? { adapter: deps.adapter } : {}),
	});
}

// Assemble the default `YardRuntime` the cloud verbs (plan/up/down) drive. This
// mirrors the composition the @hobo/cloud orchestrator + @hobo/cli cloud-verb
// tests use: a runtime-local event store (manual clock), an in-memory actor
// host, the in-process executor over the mock IaC backend, the in-process
// credential broker, and a provider registry built from the real
// @hobo/provider-cloudflare provider. LOCAL/MOCKED lane — no real cloud calls.
export function createDefaultYardRuntime(
	options: DefaultYardRuntimeOptions = {},
): YardRuntime {
	const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "hobo-yard-"));
	const store = createRuntimeLocalEventStore({
		dataDir,
		clock: createManualClock(),
	});
	// One CloudProvider instance, shared between the planner registry (capability
	// negotiation) and the IaC bridge (realize() on the deploy path).
	const cloudflare = createCloudflareProvider();
	return {
		store,
		actorHost: createInMemoryActorHost(),
		executor: createInProcessExecutor({
			// Env-gated backend selection (see `selectIacProvider`): REAL Vercel when
			// `VERCEL_TOKEN` is set, in-memory Pulumi-backed provider otherwise.
			iac: selectIacProvider({
				store,
				providers: [cloudflare],
				...(options.iacAdapter !== undefined
					? { adapter: options.iacAdapter }
					: {}),
			}),
		}),
		broker: createInProcessCredentialBroker(),
		registry: createRegistryFromProviders([toRegistrableProvider(cloudflare)]),
	};
}

const HTTP_INCOMING_INTERFACE =
	"wasi:http/incoming-handler@0.2.0" as InterfaceId;
const KV_STORE_INTERFACE = "wasi:keyvalue/store@0.2.0" as InterfaceId;

export interface DefaultDevRuntimeOptions {
	// The greeting the offline hello-bindle guest reads from its linked KV
	// provider. Defaults to "world" (guest serves `hello world`).
	readonly greeting?: string;
}

// Assemble the default `DevRuntime` the `hobo dev` command boots. This mirrors
// the @hobo/cli dev-verb test wiring: a runtime-local component host + local
// Streamer, a hello-bindle guest that reads a greeting from a linked KV
// provider and serves it over HTTP, the static link table, and a probe request.
// Fully in-process and offline (no cloud account, no network).
export function createDefaultDevRuntime(
	options: DefaultDevRuntimeOptions = {},
): DevRuntime {
	const greeting = options.greeting ?? "world";
	const events: ComponentHostEvent[] = [];
	const componentHost = createRuntimeLocalComponentHost({
		appendEvent: (event) => {
			events.push(event);
		},
	});
	const streamer = createLocalStreamer();

	const component: ParsedComponentDescriptor = {
		parsed: true,
		id: "hello-bindle",
		imports: [KV_STORE_INTERFACE],
		exports: {
			[HTTP_INCOMING_INTERFACE]: {
				handle: async (...args: unknown[]): Promise<unknown> => {
					const context = args[1] as {
						callImport: (
							importInterface: InterfaceId,
							operation: string,
							payload?: unknown,
						) => Promise<unknown>;
					};
					const resolved = (await context.callImport(
						KV_STORE_INTERFACE,
						"get",
						{ key: "greeting" },
					)) as string;
					return { status: 200, headers: [], body: `hello ${resolved}` };
				},
			},
		},
	};

	const provider: ProviderDescriptor = {
		id: "local-kv",
		exports: {
			[KV_STORE_INTERFACE]: {
				get: async () => greeting,
			},
		},
	};

	return {
		componentHost,
		streamer,
		plan: {
			component,
			providers: [provider],
			links: [
				{
					componentId: "hello-bindle",
					importInterface: KV_STORE_INTERFACE,
					providerId: "local-kv",
					exportInterface: KV_STORE_INTERFACE,
				},
			],
			probe: { method: "GET", path: "/", headers: [], body: "" },
		},
		readEvents: () => events,
	};
}

// Assemble the default `CollectionTarget` the `hobo collect` command runs
// resource collection against. Until the loader that materializes a target from
// a project's TypeScript source lands (a later slice), the composed CLI collects
// a representative hello-bindle (a service bound to a data resource) so `collect`
// emits a real manifest IR rather than the shell stub. LOCAL/MOCKED lane.
export function createDefaultCollectionTarget(
	projectDir?: string,
): CollectionTarget {
	const bindleId =
		projectDir !== undefined
			? basename(projectDir) || "hello-bindle"
			: "hello-bindle";
	return {
		bindleId,
		componentHost: { kind: "wasmtime", version: "46.0.1" },
		define(collect: CollectionContext): void {
			const db = collect.data("db", { paradigm: "relational" });
			collect.service("api", {
				image: "oci://registry.example.com/api@sha256:abc123",
				bind: { db },
			});
		},
	};
}
