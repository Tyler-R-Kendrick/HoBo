import type {
	ComponentHostPort,
	HttpRequest,
	HttpResponse,
	LinkRequest,
	ParsedComponentDescriptor,
	ProviderDescriptor,
	Streamer,
} from "@hobo/core";

// The `hobo dev` local-Camp seam (S1-19). `src/` stays adapter-free: the
// runtime-local component host + Streamer are INJECTED via DevRuntime (tests
// populate them from @hobo/runtime-local). Un-injected, the dev verb falls back
// to the shell stub — the same pattern the cloud verbs use for YardRuntime.

// The offline URL a booted local Camp serves on. runtime-local runs everything
// in-process, so no cloud account and no network are ever required (NFR-002).
export const DEV_LOCAL_URL = "http://localhost:4000";

// The cold-boot budget (NFR-002 ≤ 60 s). Modeled as an assertion on the
// in-process boot time rather than a wall-clock sleep.
export const DEV_COLD_BUDGET_MS = 60_000;

// The collected + linked Bindle a local Camp boots: the guest component, the
// providers backing its imports, the static link table, and a probe request
// used to prove the component serves.
export interface DevBindlePlan {
	readonly component: ParsedComponentDescriptor;
	readonly providers: readonly ProviderDescriptor[];
	readonly links: readonly LinkRequest[];
	readonly probe: HttpRequest;
}

export interface DevRuntime {
	readonly componentHost: ComponentHostPort;
	readonly streamer: Streamer;
	readonly plan: DevBindlePlan;
	// The component-host lifecycle events captured during boot (the Streamer
	// live-tail source). Sourced structurally so `src/` never imports the adapter.
	readEvents(): readonly { readonly type: string }[];
}

export interface DevBootResult {
	readonly localUrl: string;
	readonly runtime: "runtime-local";
	readonly offline: true;
	readonly bootMs: number;
	readonly withinColdBudget: boolean;
	readonly coldBudgetMs: number;
	readonly served: HttpResponse;
	readonly linkedComponents: readonly string[];
	readonly events: readonly { readonly type: string }[];
	readonly streamedFrames: number;
}

// Boot a runtime-local Camp: open a Streamer run for live-tail, register the
// providers, load + link the collected Bindle, serve the probe, and mirror the
// component-host events onto the stream. Fully in-process and offline.
export async function bootLocalCamp(
	runtime: DevRuntime,
	options: {
		readonly deploymentId: string;
		readonly emitProgress: (message: string) => void;
	},
): Promise<DevBootResult> {
	const startedAt = Date.now();
	const emit = options.emitProgress;
	emit("hobo dev: booting runtime-local Camp (offline)");

	const run = runtime.streamer.createRun();
	const host = runtime.componentHost;

	for (const provider of runtime.plan.providers) {
		host.registerProvider(provider);
	}
	host.loadComponent(runtime.plan.component);
	emit(`hobo dev: loaded component ${runtime.plan.component.id}`);

	for (const link of runtime.plan.links) {
		host.link(link);
	}
	emit(`hobo dev: linked ${runtime.plan.links.length} import(s)`);

	const served = await host.handleHttp(
		runtime.plan.component.id,
		runtime.plan.probe,
	);
	emit(
		`hobo dev: served ${runtime.plan.probe.method} ${runtime.plan.probe.path} -> ${served.status}`,
	);

	// Live-tail: mirror the captured component-host events onto the Streamer run.
	const events = runtime.readEvents();
	const writable = run.getWritable();
	let streamedFrames = 0;
	for (const event of events) {
		await writable.write(event);
		streamedFrames += 1;
	}
	runtime.streamer.teardownRun(run.runId, "dev boot complete");

	const bootMs = Date.now() - startedAt;
	return {
		localUrl: DEV_LOCAL_URL,
		runtime: "runtime-local",
		offline: true,
		bootMs,
		withinColdBudget: bootMs <= DEV_COLD_BUDGET_MS,
		coldBudgetMs: DEV_COLD_BUDGET_MS,
		served,
		linkedComponents: [runtime.plan.component.id],
		events,
		streamedFrames,
	};
}
