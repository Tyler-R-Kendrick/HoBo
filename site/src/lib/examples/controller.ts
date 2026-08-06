import {
	parseExamplesCatalog,
	type ExampleCatalogEntry,
	type ExampleYard,
} from "./catalog-contract.js";
import {
	DEMO_POLICY_PRESETS,
	isDemoPolicyPresetId,
	resolveDemoPolicy,
	type DemoPolicyPresetId,
} from "./demo-policies.js";
import {
	isAnonSameOriginProvider,
	provisionAnonStationViaSameOrigin,
	shipOpenSaasViaSameOriginAnon,
} from "./anon-host-client.js";
import {
	applyLocalBridgeUrlOverride,
	createBridgeStationHost,
	deployViaLocalBridge,
	probeLocalBridge,
} from "./local-bridge-client.js";
import { shipOpenSaasViaTemporaryAccounts } from "./opensaas-temporary-ship.js";
import {
	applyStationBrokerUrlOverride,
	provisionCloudflareStationViaBroker,
} from "./station-broker-client.js";
import {
	mergeBudgetPolicy,
	resolveDeployPlan,
	type BudgetPolicy,
	type DeployPlan,
	type DeploymentRole,
	type ResourceClass,
	type StationTarget,
} from "./policy-planner.js";
import {
	createBrowserWitStationHost,
	type BrowserWitStationHost,
} from "./runtime/browser-station.js";
import {
	emptyStationRegistry,
	loadStationRegistry,
	saveStationRegistry,
	type DeployedStation,
	type StationRegistry,
} from "./station-registry.js";
import {
	yardDeployByTarget,
	type YardDeploySource,
} from "./yard-deploy-source-contract.js";

interface TargetPack {
	readonly label: string;
	readonly resourceClass: StationTarget["resourceClass"];
	readonly canHostNow: boolean;
	readonly unavailableReason?: string;
	readonly native: readonly string[];
	readonly lowers: Readonly<Record<string, string>>;
	readonly environment: string;
}

interface StationHostRuntime {
	readonly url: string;
	revoke(): void;
}

interface LiveHost {
	readonly station: DeployedStation;
	readonly role: DeploymentRole;
	readonly stationId: string;
	readonly exampleId: string;
	readonly exampleTitle: string;
	readonly runtime: StationHostRuntime;
	readonly frame: HTMLIFrameElement;
}

export const HOST_SANDBOX_TOKENS = ["allow-scripts"] as const;

/** Ship stays locked until Pool has at least one deployed station. */
export const SHIP_LOCKED_DEPLOY_LABEL = "Locked — deploy stations first";
export const SHIP_GATE_PLAN_LINE = "Deploy at least one station in Pool first.";

export function shipStationsReady(stationCount: number): boolean {
	return stationCount > 0;
}

const TARGET_PACKS: Readonly<Record<string, TargetPack>> = {
	"browser-wasm": {
		label: "Browser WASM",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue"],
		lowers: {},
		environment: "same-origin agent anon host · browser Component Model",
	},
	webernetes: {
		label: "Webernetes (local)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue", "container"],
		lowers: {},
		environment: "same-origin agent anon host (Docker bridge optional)",
	},
	cloudflare: {
		label: "Cloudflare",
		resourceClass: "anonymous-remote",
		canHostNow: true,
		native: ["http", "kv", "queue", "container"],
		lowers: {},
		environment: "Temporary Accounts Workers (no permanent token)",
	},
	railway: {
		label: "Railway",
		resourceClass: "anonymous-remote",
		canHostNow: true,
		native: ["http", "kv", "queue", "container"],
		lowers: {},
		environment: "same-origin agent anon host (Railway has no public anon API)",
	},
	netlify: {
		label: "Netlify",
		resourceClass: "anonymous-remote",
		canHostNow: true,
		native: ["http", "container"],
		lowers: { kv: "memory", queue: "memory" },
		environment: "same-origin agent anon host (Netlify --allow-anonymous is password-gated)",
	},
	vercel: {
		label: "Vercel",
		resourceClass: "anonymous-remote",
		canHostNow: true,
		native: ["http", "container"],
		lowers: { kv: "memory", queue: "memory" },
		environment: "same-origin agent anon host (Vercel claimable deploy retired)",
	},
	lakebed: {
		label: "Lakebed (local)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue", "container"],
		lowers: {},
		environment: "same-origin agent anon host (Docker bridge optional)",
	},
	kubernetes: {
		label: "Kubernetes (local simulation)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http"],
		lowers: { kv: "in-memory binding", queue: "in-memory binding" },
		environment: "same-origin agent anon host · no kubeconfig",
	},
};

let bridgeOnline = false;

export async function bootExamplesConsole(): Promise<void> {
	const root = document.querySelector<HTMLElement>("[data-examples-console]");
	if (!root) return;
	const ui = requiredElements(root);
	const base = normalizeBase(root.dataset.base);
	const storage = typeof localStorage === "undefined" ? null : localStorage;
	const homeStationId = `station:browser:${crypto.randomUUID()}`;
	const bridgeOverride =
		new URL(window.location.href).searchParams.get("bridge") ??
		root.dataset.bridgeUrl ??
		null;
	applyLocalBridgeUrlOverride(bridgeOverride);
	const brokerOverride =
		new URL(window.location.href).searchParams.get("stationBroker") ??
		(root.dataset.stationBroker?.trim() ? root.dataset.stationBroker : null) ??
		null;
	applyStationBrokerUrlOverride(brokerOverride);

	const response = await fetch(`${base}examples/index.json`);
	if (!response.ok) throw new Error(`Examples catalog unavailable (${response.status})`);
	const catalog = parseExamplesCatalog(await response.json());
	if (catalog.length === 0) throw new Error("Examples catalog is empty");

	const yardsResponse = await fetch(`${base}examples/yards-deploy.json`);
	if (!yardsResponse.ok) {
		throw new Error(`Yard deploy sources unavailable (${yardsResponse.status})`);
	}
	const yardSources = yardDeployByTarget(
		(await yardsResponse.json()) as YardDeploySource[],
	);

	const health = await probeLocalBridge();
	bridgeOnline = health.ok && health.docker;

	const poolYards = catalog[0]!.topology.yards;
	let current = catalog[0]!;
	let registry = loadStationRegistry(storage, homeStationId);
	ui.stationId.textContent = registry.homeStationId;

	let poolSelected = defaultPoolTargetIds(poolYards);
	let demoPreset: DemoPolicyPresetId = "local-only";
	let appSelectedId: string | null = null;
	let sourceFocusId: string = catalog[0]!.id;
	/** Stage Source follows Pool yard focus until Ship/Live overrides. */
	let sourceFocusKind: "app" | "yard" | "live" = "app";
	let focusedYardTargetId: string | null = null;
	let claimedHostId: string | null = null;
	let stageHostId: string | null = null;
	let stationPlan = resolveStationDeployPlan(poolYards, poolSelected, demoPreset);
	let live: LiveHost[] = [];
	let busy = false;
	const revokeAnonymousStations = () => {
		// Same-origin anon hosts are disk-backed under site/.hobo-anon-hosts;
		// no blob: object URLs to revoke.
	};

	const selectedAppSet = () =>
		appSelectedId ? new Set([appSelectedId]) : new Set<string>();

	const activeStageHost = () =>
		live.find((host) => host.stationId === stageHostId) ??
		live.find((host) => host.stationId === claimedHostId) ??
		live[0] ??
		null;

	const focusedExample = () => {
		const focusId = resolveStageSourceFocusId({
			selected: selectedAppSet(),
			sourceFocusId,
			fallbackId: catalog[0]!.id,
			activeLiveExampleId:
				sourceFocusKind === "live" ? (activeStageHost()?.exampleId ?? null) : null,
		});
		return catalog.find((example) => example.id === focusId) ?? catalog[0]!;
	};

	const paintSource = () => {
		if (sourceFocusKind === "yard" && focusedYardTargetId) {
			const yardSource = yardSources.get(focusedYardTargetId);
			if (yardSource) {
				ui.sourcePath.textContent = yardSource.sourcePath;
				ui.source.textContent = yardSource.source;
				const pack = packFor(focusedYardTargetId);
				ui.exampleTitle.textContent = `${pack.label} · yard`;
				return;
			}
		}
		const focus = focusedExample();
		current = focus;
		ui.sourcePath.textContent = focus.sourcePath;
		ui.source.textContent = focus.source;
	};

	const setStageView = (view: "host" | "source") => {
		for (const button of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
			button.setAttribute("aria-pressed", String(button.dataset.view === view));
		}
		for (const panel of root.querySelectorAll<HTMLElement>("[data-view-panel]")) {
			panel.hidden = panel.dataset.viewPanel !== view;
		}
	};

	const gateBoards = (stationsReady: boolean, hasLive: boolean) => {
		const ship = root.querySelector<HTMLElement>('[data-board="ship"]');
		const liveBoard = root.querySelector<HTMLElement>('[data-board="live"]');
		const shipGate = root.querySelector<HTMLElement>("[data-ship-gate]");
		const shipBody = root.querySelector<HTMLElement>("[data-ship-body]");
		if (ship) {
			ship.toggleAttribute("inert", !stationsReady);
			ship.setAttribute("aria-disabled", String(!stationsReady));
			ship.dataset.locked = String(!stationsReady);
		}
		if (shipGate) shipGate.hidden = stationsReady;
		if (shipBody) shipBody.hidden = !stationsReady;
		if (liveBoard) {
			const lockLive = !stationsReady;
			liveBoard.toggleAttribute("inert", lockLive);
			liveBoard.setAttribute("aria-disabled", String(lockLive));
			liveBoard.dataset.locked = String(lockLive);
			liveBoard.dataset.hasHosts = String(hasLive);
		}
	};

	const appsPlanSummary = () => {
		if (registry.stations.length === 0) {
			return "Deploy at least one station before shipping apps.";
		}
		if (!appSelectedId) return "Pick an app from the list.";
		const example = catalog.find((entry) => entry.id === appSelectedId);
		if (!example) return "Pick an app from the list.";
		const plan = resolveExampleStationPlan(example, registry.stations);
		return `${example.title} · ${plan.provision.length} host slot(s)`;
	};

	const clearLive = () => {
		for (const host of live) {
			host.frame.remove();
			host.runtime.revoke();
		}
		live = [];
		claimedHostId = null;
		stageHostId = null;
	};

	const persist = () => {
		saveStationRegistry(storage, registry);
	};

	const render = () => {
		stationPlan = resolveStationDeployPlan(poolYards, poolSelected, demoPreset);
		const focus = focusedExample();
		current = focus;
		const stationsReady = shipStationsReady(registry.stations.length);
		const phase: "pool" | "ship" | "live" =
			!stationsReady ? "pool" : live.length === 0 ? "ship" : "live";
		ui.strip.dataset.phase = phase;
		gateBoards(stationsReady, live.length > 0);
		ui.stage.dataset.claimed = claimedHostId ? "true" : "false";
		const claimedHost = live.find((host) => host.stationId === claimedHostId);
		ui.exampleTitle.textContent = claimedHost
			? `Claimed · ${claimedHost.exampleTitle}`
			: live.length > 0
				? "Live hosts"
				: phase === "pool"
					? "Stage"
					: focus.title;
		ui.emptyTitle.textContent =
			phase === "pool"
				? "Stamp stations first"
				: phase === "ship"
					? "Ship an app next"
					: "Preview a host";
		ui.claimedBanner.hidden = !claimedHost;
		ui.claimedBanner.textContent = claimedHost
			? `Yours · ${claimedHost.exampleTitle} on ${claimedHost.station.label}`
			: "";
		if (sourceFocusKind !== "yard") {
			ui.sourcePath.textContent = focus.sourcePath;
			ui.source.textContent = focus.source;
		} else {
			paintSource();
		}
		const shipLead = root.querySelector<HTMLElement>('[data-board="ship"] .ex-board-lead');
		if (shipLead) {
			shipLead.textContent = stationsReady
				? "Pick one app to deploy onto stations from Pool. Selection shows Bindle source on Stage."
				: "Deploy at least one station in Pool first. Ship stays locked until stations are ready.";
		}
		if (!stationsReady) appSelectedId = null;

		renderDemoPresets(ui.demoPolicy, demoPreset, (id) => {
			if (busy) return;
			demoPreset = id;
			render();
		});
		renderYardSelect(
			ui.yardSelect,
			poolYards,
			poolSelected,
			stationPlan,
			(next, focusedTargetId) => {
				if (busy) return;
				poolSelected = next;
				if (focusedTargetId) {
					focusedYardTargetId = focusedTargetId;
					sourceFocusKind = "yard";
					setStageView("source");
				}
				render();
			},
		);
		renderStationSelect(ui.stationSelect, registry.stations);
		ui.removeStation.disabled = busy || ui.stationSelect.value === "";

		if (stationsReady) {
			renderAppSelect(ui.appSelect, catalog, appSelectedId, !busy, (id) => {
				if (busy || registry.stations.length === 0) return;
				if (live.length > 0) {
					clearLive();
					resetHostFrames(ui);
					ui.deployState.textContent = "idle";
					ui.terminal.replaceChildren(
						line("system", "App selection changed. Deploy apps again."),
					);
				}
				appSelectedId = id;
				if (id) {
					sourceFocusId = id;
					sourceFocusKind = "app";
					setStageView("source");
				}
				render();
			});
			renderAppsPolicy(ui.examplePolicy, catalog, selectedAppSet(), registry.stations);
			ui.examplePlanLine.textContent = appsPlanSummary();
			const example = appSelectedId
				? catalog.find((entry) => entry.id === appSelectedId)
				: undefined;
			const shipSlots = example
				? resolveExampleStationPlan(example, registry.stations).provision.length
				: 0;
			ui.deployApps.disabled = busy || !appSelectedId || shipSlots === 0;
			ui.deployApps.firstElementChild!.textContent = appSelectedId
				? `Deploy app (${shipSlots} host)`
				: "Deploy app";
		} else {
			ui.appSelect.replaceChildren();
			const placeholder = document.createElement("option");
			placeholder.value = "";
			placeholder.textContent = "Select an app…";
			ui.appSelect.append(placeholder);
			ui.examplePolicy.replaceChildren();
			ui.examplePlanLine.textContent = SHIP_GATE_PLAN_LINE;
			ui.deployApps.disabled = true;
			ui.deployApps.firstElementChild!.textContent = SHIP_LOCKED_DEPLOY_LABEL;
		}

		renderPolicy(ui.stationPolicy, stationPlan);
		ui.stationPlanLine.textContent = `station plan: ${stationPlan.summary}`;
		ui.provisionPreview.textContent =
			phase === "pool"
				? "Pool picks yards. Ship picks one app. Live previews and claims."
				: phase === "ship"
					? "Pick an app, then Deploy onto your stations."
					: "Preview a host on stage, Open in a new tab, then Claim to pin it.";
		ui.deployStations.disabled = busy || stationPlan.provision.length === 0;
		ui.deployStations.firstElementChild!.textContent = `Deploy stations (${stationPlan.provision.length})`;

		renderLiveSelect(ui, live, claimedHostId, stageHostId);
		const activePreview = activeStageHost();
		if (ui.openPreview) {
			if (activePreview) {
				ui.openPreview.hidden = false;
				ui.openPreview.href = activePreview.runtime.url;
				ui.openPreview.textContent = "Open preview";
			} else {
				ui.openPreview.hidden = true;
				ui.openPreview.removeAttribute("href");
			}
		}
	};

	const liveAction = (action: "preview" | "open" | "claim") => {
		if (busy) return;
		const hostId = ui.liveSelect.value || stageHostId || live[0]?.stationId;
		const host = live.find((entry) => entry.stationId === hostId);
		if (!host) return;
		if (action === "preview") {
			stageHostId = host.stationId;
			sourceFocusId = host.exampleId;
			sourceFocusKind = "live";
			setStageView("host");
			ui.terminal.append(
				line("system", `Previewing ${host.exampleTitle} on ${host.station.label}`),
			);
			render();
		} else if (action === "open") {
			window.open(host.runtime.url, "_blank", "noopener");
			ui.terminal.append(
				line("system", `Opened preview tab · ${host.exampleTitle} · ${host.runtime.url}`),
			);
		} else {
			const claimTarget = host.station.claimUrl ?? host.runtime.url;
			if (host.station.claimUrl) {
				window.open(host.station.claimUrl, "_blank", "noopener");
			}
			claimedHostId = host.stationId;
			stageHostId = host.stationId;
			sourceFocusId = host.exampleId;
			sourceFocusKind = "live";
			setStageView("host");
			ui.terminal.append(
				line(
					"success",
					`✓ Claimed ${host.exampleTitle} on ${host.station.label}${
						host.station.claimUrl ? ` · ${claimTarget}` : ""
					}`,
				),
			);
			render();
		}
	};

	for (const button of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
		button.addEventListener("click", () => {
			const view = button.dataset.view === "source" ? "source" : "host";
			const host = activeStageHost();
			if (host && sourceFocusKind !== "yard") {
				stageHostId = host.stationId;
				sourceFocusId = host.exampleId;
				sourceFocusKind = "live";
			}
			setStageView(view);
			paintSource();
			if (view === "source" && sourceFocusKind !== "yard" && live.length > 0) {
				const focus = focusedExample();
				ui.exampleTitle.textContent =
					live.length > 1 ? `${focus.title} · source` : focus.title;
			}
		});
	}

	ui.liveSelect.addEventListener("change", () => {
		const host = live.find((entry) => entry.stationId === ui.liveSelect.value);
		if (!host) return;
		stageHostId = host.stationId;
		sourceFocusId = host.exampleId;
		sourceFocusKind = "live";
		render();
	});
	ui.livePreview.addEventListener("click", () => liveAction("preview"));
	ui.liveOpen.addEventListener("click", () => liveAction("open"));
	ui.liveClaim.addEventListener("click", () => liveAction("claim"));

	ui.removeStation.addEventListener("click", () => {
		if (busy) return;
		const id = ui.stationSelect.value;
		if (!id) return;
		clearLive();
		resetHostFrames(ui);
		registry = {
			...registry,
			stations: registry.stations.filter((station) => station.id !== id),
		};
		if (registry.stations.length === 0) appSelectedId = null;
		persist();
		ui.deployState.textContent = "idle";
		ui.terminal.replaceChildren(
			line("system", "Station removed. Redeploy apps onto remaining stations."),
		);
		render();
	});

	ui.clearStations.addEventListener("click", () => {
		if (busy) return;
		clearLive();
		resetHostFrames(ui);
		revokeAnonymousStations();
		registry = emptyStationRegistry(registry.homeStationId);
		appSelectedId = null;
		persist();
		ui.deployState.textContent = "idle";
		ui.terminal.replaceChildren(line("system", "Cleared deployed stations."));
		render();
	});

	ui.deployStations.addEventListener("click", async () => {
		if (busy) return;
		busy = true;
		ui.deployState.textContent = "deploying-stations";
		render();
		try {
			await writeTerminal(
				ui.terminal,
				"command",
				"$ hobo station up --from-pool --anonymous",
			);
			await writeTerminal(ui.terminal, "system", policyCommand(stationPlan));
			await writeTerminal(ui.terminal, "system", `→ ${stationPlan.summary}`);
			for (const skipped of stationPlan.skipped) {
				await writeTerminal(
					ui.terminal,
					"skip",
					`· policy-skip ${skipped.target.id}: ${skipped.detail}`,
				);
			}
			revokeAnonymousStations();
			const createdAt = new Date().toISOString();
			const nextStations: DeployedStation[] = [];
			for (const { target } of stationPlan.provision) {
				const pack = packFor(target.id);
				const stationId = `${registry.homeStationId}:${target.id}`;
				await writeTerminal(
					ui.terminal,
					"system",
					`→ operator station bootstrap target=${target.id} yard=${target.yardId} class=${pack.resourceClass}`,
				);
				let endpointUrl: string | undefined;
				let claimUrl: string | undefined;
				let expiresAt: string | undefined;
				if (pack.resourceClass === "anonymous-remote" && target.id === "cloudflare") {
					// Real Cloudflare Temporary Account via same-origin /api/cf-temp
					// (astro dev) or configured Temporary Accounts CORS relay.
					// Never stamp blob: and call it Cloudflare.
					const provisioned = await provisionCloudflareStationViaBroker({
						stationId,
					});
					endpointUrl = provisioned.stationUrl;
					claimUrl = provisioned.claimUrl;
					expiresAt = provisioned.expiresAt;
					await writeTerminal(
						ui.terminal,
						"success",
						`✓ Cloudflare temporary Environment Station ${stationId}`,
					);
					await writeTerminal(
						ui.terminal,
						"system",
						`→ stationUrl ${endpointUrl}`,
					);
					await writeTerminal(
						ui.terminal,
						"system",
						`→ claimUrl ${claimUrl} (expires ${expiresAt})`,
					);
				} else if (isAnonSameOriginProvider(target.id)) {
					// Real HTTP same-origin agent host — never blob: as remote.
					const provisioned = await provisionAnonStationViaSameOrigin({
						providerId: target.id,
						stationId,
						pageUrl: window.location.href,
						basePath: base,
					});
					endpointUrl = provisioned.endpointUrl;
					claimUrl = provisioned.claimUrl;
					expiresAt = provisioned.expiresAt;
					await writeTerminal(
						ui.terminal,
						"success",
						`✓ anonymous station ${stationId} · ${pack.label} (same-origin agent)`,
					);
					await writeTerminal(
						ui.terminal,
						"system",
						`→ stationUrl ${endpointUrl}`,
					);
					await writeTerminal(
						ui.terminal,
						"system",
						`→ claimUrl ${claimUrl} (expires ${expiresAt})`,
					);
				} else {
					await writeTerminal(
						ui.terminal,
						"success",
						`✓ local station ready ${stationId} · ${pack.label}`,
					);
				}
				nextStations.push({
					id: stationId,
					targetId: target.id,
					yardId: target.yardId,
					providerId: target.providerId,
					policy: stationPlan.policy,
					label: pack.label,
					createdAt,
					...(endpointUrl ? { endpointUrl } : {}),
					...(claimUrl ? { claimUrl } : {}),
					...(expiresAt ? { expiresAt } : {}),
				});
			}
			registry = { homeStationId: registry.homeStationId, stations: nextStations };
			persist();
			await writeTerminal(
				ui.terminal,
				"success",
				`✓ ${nextStations.length} Environment Station(s) ready · ship apps next`,
			);
			ui.deployState.textContent = "stations-ready";
		} catch (error) {
			await writeTerminal(
				ui.terminal,
				"stderr",
				`✗ ${error instanceof Error ? error.message : String(error)}`,
			);
			ui.deployState.textContent = "failed";
		} finally {
			busy = false;
			render();
		}
	});

	ui.deployApps.addEventListener("click", async () => {
		if (busy || registry.stations.length === 0 || !appSelectedId) return;
		busy = true;
		clearLive();
		resetHostFrames(ui);
		ui.terminal.replaceChildren();
		ui.deployState.textContent = "deploying";
		render();
		const opened: LiveHost[] = [];
		try {
			const example = catalog.find((entry) => entry.id === appSelectedId);
			if (!example) throw new Error("Selected app missing from catalog");
			const plan = resolveExampleStationPlan(example, registry.stations);
			await writeTerminal(
				ui.terminal,
				"command",
				example.deployKind === "local-bridge"
					? `$ local-bridge deploy --example ${example.id}`
					: `$ browser-station invoke --example ${example.id}`,
			);
			await writeTerminal(ui.terminal, "system", policyCommand(plan));
			await writeTerminal(ui.terminal, "system", `→ ${plan.summary}`);
			for (const skipped of plan.skipped) {
				await writeTerminal(
					ui.terminal,
					"skip",
					`· skip ${skipped.target.id}: ${skipped.detail}`,
				);
			}
			const provisioned = await mapConcurrent(
				plan.provision,
				plan.policy.maxConcurrent,
				async ({ target, role }) => {
					const station = registry.stations.find(
						(entry) => entry.targetId === target.id && entry.yardId === target.yardId,
					);
					if (!station) {
						throw new Error(`Selected station missing for target ${target.id}`);
					}
					const pack = packFor(target.id);
					await writeTerminal(
						ui.terminal,
						"system",
						`── ${example.title} · ${pack.label} (${role}) ──`,
					);
					const hostStationId = `${station.id}:${example.id}`;
					let runtime: StationHostRuntime;
					const frame = createHostFrame(
						`${example.title} on ${pack.label}`,
						example.deployKind === "local-bridge"
							? ["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups"]
							: [...HOST_SANDBOX_TOKENS],
					);
					ui.junctionNote.before(frame);

					if (example.deployKind === "local-bridge") {
						const cloudflareTemporary =
							example.id === "opensaas" && target.id === "cloudflare";
						const sameOriginAnon =
							example.id === "opensaas" && isAnonSameOriginProvider(target.id);
						if (cloudflareTemporary) {
							await writeTerminal(
								ui.terminal,
								"system",
								`→ OpenSaaS Temporary Accounts ship (wasp client → wrangler --temporary)`,
							);
							const deployed = await shipOpenSaasViaTemporaryAccounts({
								stationId: hostStationId,
								pageUrl: window.location.href,
								basePath: base,
							});
							runtime = createBridgeStationHost(deployed.clientUrl);
							frame.src = runtime.url;
							frame.hidden = false;
							await writeTerminal(
								ui.terminal,
								"success",
								`✓ ${example.title} · ${pack.label} · ${deployed.clientUrl}`,
							);
							await writeTerminal(
								ui.terminal,
								"system",
								`→ claimUrl ${deployed.claimUrl} (expires ${deployed.expiresAt})`,
							);
						} else if (sameOriginAnon) {
							await writeTerminal(
								ui.terminal,
								"system",
								`→ OpenSaaS same-origin agent ship target=${target.id} (no permanent provider login)`,
							);
							const deployed = await shipOpenSaasViaSameOriginAnon({
								providerId: target.id,
								stationId: hostStationId,
								pageUrl: window.location.href,
								basePath: base,
							});
							runtime = createBridgeStationHost(deployed.clientUrl);
							frame.src = runtime.url;
							frame.hidden = false;
							await writeTerminal(
								ui.terminal,
								"success",
								`✓ ${example.title} · ${pack.label} · ${deployed.clientUrl}`,
							);
							await writeTerminal(
								ui.terminal,
								"system",
								`→ claimUrl ${deployed.claimUrl} (expires ${deployed.expiresAt}) · hostKind=${deployed.hostKind}`,
							);
						} else {
						const health = await probeLocalBridge();
						bridgeOnline = health.ok;
						if (!bridgeOnline) {
							throw new Error(
								health.remediation ??
									"Local bridge required for OpenSaaS. Run: pnpm --filter hobo-site run examples:bridge",
							);
						}
						const localDockerTarget =
							target.id === "webernetes" || target.id === "lakebed";
						if (localDockerTarget && !health.docker) {
							throw new Error(
								"Docker required for Webernetes/Lakebed OpenSaaS. Install Docker or ship to Railway/Cloudflare.",
							);
						}
						await writeTerminal(
							ui.terminal,
							"system",
							`→ local bridge deploy target=${target.id} example=${example.id} station=${station.id}`,
						);
						const deployed = await deployViaLocalBridge({
							exampleId: example.id,
							stationId: hostStationId,
							targetId: target.id,
						});
						runtime = createBridgeStationHost(deployed.clientUrl);
						frame.src = runtime.url;
						frame.hidden = false;
						await writeTerminal(
							ui.terminal,
							"success",
							`✓ ${example.title} · ${pack.label} · ${deployed.clientUrl}`,
						);
						}
					} else {
						await writeTerminal(
							ui.terminal,
							"system",
							`→ browser station WIT guest example=${example.id} station=${station.id}`,
						);
						await writeTerminal(
							ui.terminal,
							"system",
							`→ component-local bindings: ${example.needs.join(", ")} · derived guest from Bindle web entrypoint`,
						);
						runtime = await createBrowserWitStationHost({
							assetBaseUrl: `${base}examples/runtime`,
							exampleId: example.id,
							title: example.title,
							ui: example.ui,
							stationId: hostStationId,
							targetLabel: `${pack.label} · ${pack.environment}`,
							runtime: example.runtime,
						});
						try {
							await waitForStation(frame, hostStationId, runtime.url);
						} catch (error) {
							frame.remove();
							runtime.revoke();
							throw error;
						}
						await writeTerminal(
							ui.terminal,
							"success",
							`✓ ${example.title} · ${pack.label} live · ${runtime.url}`,
						);
					}

					return {
						station,
						role,
						stationId: hostStationId,
						exampleId: example.id,
						exampleTitle: example.title,
						runtime,
						frame,
					} satisfies LiveHost;
				},
			);
			opened.push(...provisioned);
			live = opened;
			claimedHostId = null;
			stageHostId = live[0]?.stationId ?? null;
			await writeTerminal(
				ui.terminal,
				"success",
				`✓ ${live.length} host(s) live · Preview, Open, or Claim on board 3`,
			);
			ui.deployState.textContent = "live";
			if (live[0]) {
				sourceFocusId = live[0].exampleId;
				setStageView("host");
			}
		} catch (error) {
			for (const host of opened) {
				host.frame.remove();
				host.runtime.revoke();
			}
			live = [];
			claimedHostId = null;
			stageHostId = null;
			await writeTerminal(
				ui.terminal,
				"stderr",
				`✗ ${error instanceof Error ? error.message : String(error)}`,
			);
			ui.deployState.textContent = "failed";
		} finally {
			busy = false;
			render();
		}
	});

	render();
	void current;
}

/** Station deploy from the provider pool + demo policy preset.
 * Selecting a yard widens the resource pool and replica budget so operator
 * Pool stamps are not blocked as not-in-resource-pool / over-replica.
 */
export function resolveStationDeployPlan(
	yards: readonly ExampleYard[],
	selected: ReadonlySet<string>,
	presetId: DemoPolicyPresetId,
): DeployPlan {
	const selectedYards = yards.filter((yard) => selected.has(yard.targetId));
	const base = resolveDemoPolicy(presetId);
	const resourcePool = new Set<ResourceClass>(base.resourcePool);
	for (const yard of selectedYards) {
		resourcePool.add(packFor(yard.targetId).resourceClass);
	}
	const policy = mergeBudgetPolicy({
		...base,
		resourcePool: [...resourcePool],
		maxReplicas: Math.max(base.maxReplicas, selectedYards.length || 1),
		redundancy:
			selectedYards.length > 1 && base.redundancy === "none"
				? "mirror"
				: base.redundancy,
	});
	return resolveDeployPlan(
		selectedYards.map(targetForYard),
		policy,
		yards.map((yard) => yard.id),
	);
}

/** Example deploy onto already-registered stations (filtered by example yards). */
export function resolveExampleStationPlan(
	example: ExampleCatalogEntry,
	stations: readonly DeployedStation[],
	selectedStationIds: ReadonlySet<string> = defaultSelectedStationIds(
		example,
		stations,
	),
): DeployPlan {
	const deployableYards = deployableYardIds(example);
	const eligible = stations.filter(
		(station) =>
			selectedStationIds.has(station.id) && deployableYards.has(station.yardId),
	);
	const policy = mergeBudgetPolicy(example.appPolicy, example.deploymentPolicy);
	const candidates = eligible.map((station) =>
		targetForYard({
			id: station.yardId,
			targetId: station.targetId,
			providerId: station.providerId,
			campId: `deployed:${station.id}`,
		}),
	);
	return resolveDeployPlan(candidates, policy, [...deployableYards]);
}

/** @deprecated Prefer resolveExampleStationPlan — kept for catalog policy fixtures. */
export function resolveExampleDeployPlan(
	example: ExampleCatalogEntry,
	selected: ReadonlySet<string> = defaultSelectedTargetIds(example),
) {
	const deployableYards = deployableYardIds(example);
	return resolveDeployPlan(
		example.topology.yards
			.filter(
				(yard) => selected.has(yard.targetId) && deployableYards.has(yard.id),
			)
			.map(targetForYard),
		mergeBudgetPolicy(example.appPolicy, example.deploymentPolicy),
		[...deployableYards],
	);
}

function targetForYard(yard: ExampleYard): StationTarget {
	const pack = packFor(yard.targetId);
	return {
		id: yard.targetId,
		yardId: yard.id,
		providerId: yard.providerId,
		resourceClass: pack.resourceClass,
		canHostNow: pack.canHostNow,
		unavailableReason: pack.unavailableReason,
		estimatedMonthlySpendUsd: 0,
	};
}

function packFor(id: string): TargetPack {
	const pack = TARGET_PACKS[id];
	if (!pack) throw new Error(`Unknown Environment Station target: ${id}`);
	return pack;
}

/** Whether a Pool yard target is selectable (never fake-disabled for CF/Railway). */
export function targetPackCanHostNow(targetId: string): boolean {
	return packFor(targetId).canHostNow;
}

export function defaultPoolTargetIds(yards: readonly ExampleYard[]): Set<string> {
	return new Set(
		yards
			.filter((yard) => {
				const pack = packFor(yard.targetId);
				return pack.canHostNow && pack.resourceClass === "local";
			})
			.map((yard) => yard.targetId),
	);
}

export function defaultSelectedTargetIds(example: ExampleCatalogEntry): Set<string> {
	const allowed = deployableYardIds(example);
	return new Set(
		example.topology.yards
			.filter((yard) => allowed.has(yard.id))
			.map((yard) => yard.targetId),
	);
}

export function defaultSelectedStationIds(
	example: ExampleCatalogEntry,
	stations: readonly DeployedStation[],
): Set<string> {
	const allowed = deployableYardIds(example);
	return new Set(
		stations.filter((station) => allowed.has(station.yardId)).map((station) => station.id),
	);
}

function deployableYardIds(example: ExampleCatalogEntry): Set<string> {
	return new Set(
		example.topology.allowedYardIds ?? example.topology.junction.yardIds,
	);
}

function renderDemoPresets(
	container: HTMLSelectElement,
	current: DemoPolicyPresetId,
	onChange: (id: DemoPolicyPresetId) => void,
) {
	if (container.dataset.bound !== "1") {
		container.replaceChildren(
			...DEMO_POLICY_PRESETS.map((preset) => {
				const option = document.createElement("option");
				option.value = preset.id;
				option.textContent = `${preset.label} — ${preset.blurb}`;
				return option;
			}),
		);
		container.addEventListener("change", () => {
			if (isDemoPolicyPresetId(container.value)) onChange(container.value);
		});
		container.dataset.bound = "1";
	}
	container.value = current;
}

function renderYardSelect(
	select: HTMLSelectElement,
	yards: readonly ExampleYard[],
	selected: ReadonlySet<string>,
	plan: DeployPlan,
	onChange: (next: Set<string>, focusedTargetId: string | null) => void,
) {
	type YardSelectState = { previous: Set<string>; pendingFocus?: string };
	const selectState = select as HTMLSelectElement & {
		_yardState?: YardSelectState;
	};
	select.replaceChildren(
		...yards.map((yard) => {
			const pack = packFor(yard.targetId);
			const option = document.createElement("option");
			option.value = yard.targetId;
			option.selected = selected.has(yard.targetId);
			const provision = plan.provision.find(({ target }) => target.id === yard.targetId);
			const skipped = plan.skipped.find(({ target }) => target.id === yard.targetId);
			const hint = provision
				? provision.role
				: skipped
					? skipped.reason
					: pack.canHostNow
						? "ready"
						: "unavailable";
			option.textContent = `${pack.label} · ${hint}`;
			option.title = `${yard.id} · ${pack.environment}`;
			return option;
		}),
	);
	if (select.dataset.bound !== "1") {
		selectState._yardState = { previous: new Set(selected) };
		// mousedown captures the clicked option before <select multiple> mutates selection.
		select.addEventListener("mousedown", (event) => {
			const target = event.target;
			if (target instanceof HTMLOptionElement && target.value) {
				selectState._yardState = {
					...(selectState._yardState ?? { previous: new Set<string>() }),
					pendingFocus: target.value,
				};
			}
		});
		select.addEventListener("change", () => {
			const state = selectState._yardState ?? { previous: new Set<string>() };
			const next = new Set(
				[...select.selectedOptions].map((option) => option.value).filter(Boolean),
			);
			const added = [...next].find((id) => !state.previous.has(id));
			const removed = [...state.previous].find((id) => !next.has(id));
			const focused =
				state.pendingFocus ?? added ?? removed ?? [...next][0] ?? null;
			state.previous = next;
			state.pendingFocus = undefined;
			selectState._yardState = state;
			onChange(next, focused);
		});
		select.dataset.bound = "1";
	} else if (selectState._yardState) {
		selectState._yardState.previous = new Set(selected);
	}
}

function renderStationSelect(
	select: HTMLSelectElement,
	stations: readonly DeployedStation[],
) {
	const current = select.value;
	if (stations.length === 0) {
		select.replaceChildren();
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "None yet";
		select.append(option);
		return;
	}
	select.replaceChildren(
		...stations.map((station) => {
			const option = document.createElement("option");
			option.value = station.id;
			option.textContent = `${station.label} · ${station.yardId}`;
			return option;
		}),
	);
	if (stations.some((station) => station.id === current)) select.value = current;
}

function renderAppSelect(
	select: HTMLSelectElement,
	catalog: readonly ExampleCatalogEntry[],
	selectedId: string | null,
	interactive: boolean,
	onChange: (id: string | null) => void,
) {
	select.replaceChildren();
	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = "Select an app…";
	select.append(placeholder);
	for (const example of catalog) {
		const option = document.createElement("option");
		option.value = example.id;
		option.textContent =
			example.deployKind === "local-bridge"
				? `${example.title} · Wasp bridge`
				: example.title;
		option.selected = example.id === selectedId;
		select.append(option);
	}
	select.disabled = !interactive;
	if (select.dataset.bound !== "1") {
		select.addEventListener("change", () => {
			onChange(select.value || null);
		});
		select.dataset.bound = "1";
	}
	select.value = selectedId ?? "";
}

function renderAppsPolicy(
	container: HTMLElement,
	catalog: readonly ExampleCatalogEntry[],
	selected: ReadonlySet<string>,
	stations: readonly DeployedStation[],
) {
	const apps = catalog.filter((example) => selected.has(example.id));
	if (apps.length === 0) {
		container.replaceChildren();
		const term = document.createElement("dt");
		term.textContent = "app";
		const description = document.createElement("dd");
		description.textContent = "none selected";
		container.append(term, description);
		return;
	}
	const app = apps[0]!;
	const slots = resolveExampleStationPlan(app, stations).provision.length;
	const fields: Array<[string, string]> = [
		["app", app.title],
		["deploy", app.deployKind],
		["host slots", String(slots)],
	];
	container.replaceChildren(
		...fields.flatMap(([name, value]) => {
			const term = document.createElement("dt");
			term.textContent = name;
			const description = document.createElement("dd");
			description.textContent = value;
			return [term, description];
		}),
	);
}

function renderPolicy(container: HTMLElement, plan: DeployPlan) {
	const fields = [
		["redundancy", plan.policy.redundancy],
		["maxReplicas", String(plan.policy.maxReplicas)],
		["maxConcurrent", String(plan.policy.maxConcurrent)],
		["resourcePool", `[${plan.policy.resourcePool.join(", ")}]`],
		["routing", plan.policy.routing],
		["spendCap", `$${plan.policy.monthlySpendCapUsd}/month`],
	];
	container.replaceChildren(
		...fields.flatMap(([name, value]) => {
			const term = document.createElement("dt");
			term.textContent = name;
			const description = document.createElement("dd");
			description.textContent = value;
			return [term, description];
		}),
	);
}

function renderLiveSelect(
	ui: ReturnType<typeof requiredElements>,
	live: readonly LiveHost[],
	claimedHostId: string | null,
	stageHostId: string | null,
) {
	ui.hostEmpty.hidden = live.length > 0;
	ui.hostTabs.hidden = live.length === 0;
	const activeId =
		(stageHostId && live.some((host) => host.stationId === stageHostId)
			? stageHostId
			: null) ??
		claimedHostId ??
		live[0]?.stationId ??
		null;

	if (live.length === 0) {
		ui.liveSelect.replaceChildren();
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "None yet";
		ui.liveSelect.append(option);
		ui.livePreview.disabled = true;
		ui.liveOpen.disabled = true;
		ui.liveClaim.disabled = true;
		ui.claimedLine.hidden = true;
		ui.placement.textContent = "Ship an app to see placement.";
		ui.hostTabs.replaceChildren();
		ui.junctionNote.hidden = true;
		return;
	}

	ui.liveSelect.replaceChildren(
		...live.map((host) => {
			const option = document.createElement("option");
			option.value = host.stationId;
			option.textContent = `${host.exampleTitle} · ${host.station.label} · ${host.role}`;
			option.selected = host.stationId === activeId;
			return option;
		}),
	);
	ui.livePreview.disabled = false;
	ui.liveOpen.disabled = false;
	ui.liveClaim.disabled = claimedHostId === activeId;
	ui.liveClaim.textContent = claimedHostId === activeId ? "Claimed" : "Claim";

	const claimed = live.find((host) => host.stationId === claimedHostId);
	ui.claimedLine.hidden = !claimed;
	ui.claimedLine.textContent = claimed
		? `Claimed: ${claimed.exampleTitle} on ${claimed.station.label}`
		: "";
	ui.placement.textContent = live
		.map((host) => {
			const pack = packFor(host.station.targetId);
			return `${host.exampleTitle} → ${pack.label} · ${host.role}`;
		})
		.join(" · ");

	ui.hostTabs.replaceChildren(
		...live.map((host) => {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = `${host.exampleTitle} · ${host.station.label}`;
			button.setAttribute("aria-pressed", String(host.stationId === activeId));
			button.addEventListener("click", () => {
				ui.liveSelect.value = host.stationId;
				ui.liveSelect.dispatchEvent(new Event("change"));
			});
			host.frame.hidden = host.stationId !== activeId;
			return button;
		}),
	);
	ui.junctionNote.hidden = false;
	ui.junctionNote.textContent = `Placement preview: ${live.length} host(s) · Preview / Open / Claim`;
}

function createHostFrame(
	title: string,
	sandboxTokens: readonly string[] = HOST_SANDBOX_TOKENS,
): HTMLIFrameElement {
	const frame = document.createElement("iframe");
	frame.dataset.hostFrame = "";
	frame.title = title;
	for (const token of sandboxTokens) frame.sandbox.add(token);
	frame.hidden = true;
	return frame;
}

function waitForStation(
	frame: HTMLIFrameElement,
	stationId: string,
	url: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(
			() => done(new Error(`station bootstrap timed out: ${stationId}`)),
			20_000,
		);
		const receive = (event: MessageEvent) => {
			if (
				event.source !== frame.contentWindow ||
				event.data?.source !== "hobo-browser-station" ||
				event.data?.stationId !== stationId
			) {
				return;
			}
			done(
				event.data.status === "ready"
					? undefined
					: new Error(event.data.message ?? `station failed: ${stationId}`),
			);
		};
		function done(error?: Error) {
			window.clearTimeout(timeout);
			window.removeEventListener("message", receive);
			if (error) reject(error);
			else resolve();
		}
		window.addEventListener("message", receive);
		frame.src = url;
	});
}

function resetHostFrames(ui: ReturnType<typeof requiredElements>) {
	for (const frame of document.querySelectorAll<HTMLIFrameElement>("[data-host-frame]")) {
		frame.remove();
	}
	ui.hostTabs.replaceChildren();
	ui.hostTabs.hidden = true;
	ui.hostEmpty.hidden = false;
	ui.junctionNote.hidden = true;
	ui.claimedBanner.hidden = true;
	ui.claimedBanner.textContent = "";
	ui.stage.dataset.claimed = "false";
}

export async function mapConcurrent<T, R>(
	values: readonly T[],
	concurrency: number,
	map: (value: T) => Promise<R>,
): Promise<R[]> {
	const output = new Array<R>(values.length);
	let next = 0;
	let failed = false;
	let failure: unknown;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, async () => {
			while (!failed && next < values.length) {
				const index = next++;
				try {
					output[index] = await map(values[index]!);
				} catch (error) {
					failed = true;
					failure = error;
				}
			}
		}),
	);
	if (failed) throw failure;
	return output;
}

export function normalizeBase(value: string | undefined): string {
	return `${value ?? "/"}`.replace(/\/?$/u, "/");
}

/** Last selected app wins for Stage Source; fall back to first selected / catalog. */
export function pickSourceFocusId(
	selected: ReadonlySet<string>,
	focusId: string | null | undefined,
	fallbackId: string,
): string {
	if (focusId && selected.has(focusId)) return focusId;
	const first = [...selected][0];
	return first ?? fallbackId;
}

/**
 * Stage Source follows the active live host when one is on Stage; otherwise Ship selection.
 */
export function resolveStageSourceFocusId(input: {
	readonly selected: ReadonlySet<string>;
	readonly sourceFocusId: string | null | undefined;
	readonly fallbackId: string;
	readonly activeLiveExampleId?: string | null;
}): string {
	if (input.activeLiveExampleId) return input.activeLiveExampleId;
	return pickSourceFocusId(input.selected, input.sourceFocusId, input.fallbackId);
}

function policyCommand(plan: DeployPlan): string {
	return `→ policy redundancy=${plan.policy.redundancy} maxReplicas=${plan.policy.maxReplicas} pool=[${plan.policy.resourcePool.join(",")}] routing=${plan.policy.routing} spendCap=$${plan.policy.monthlySpendCapUsd}`;
}

async function writeTerminal(container: HTMLElement, kind: string, text: string) {
	container.append(line(kind, text));
	container.scrollTop = container.scrollHeight;
	await new Promise((resolve) => window.setTimeout(resolve, 90));
}

function line(kind: string, text: string) {
	const item = document.createElement("p");
	item.className = kind;
	item.textContent = text;
	return item;
}

function requiredElements(root: HTMLElement) {
	const get = <T extends Element>(selector: string) => {
		const element = root.querySelector<T>(selector);
		if (!element) throw new Error(`Examples UI is missing ${selector}`);
		return element;
	};
	return {
		stage: get<HTMLElement>("[data-stage]"),
		strip: get<HTMLElement>("[data-phase]"),
		exampleTitle: get<HTMLElement>("[data-example-title]"),
		hostTabs: get<HTMLElement>("[data-host-tabs]"),
		hostEmpty: get<HTMLElement>("[data-host-empty]"),
		emptyTitle: get<HTMLElement>("[data-empty-title]"),
		claimedBanner: get<HTMLElement>("[data-claimed-banner]"),
		openPreview: root.querySelector<HTMLAnchorElement>("[data-open-preview]"),
		provisionPreview: get<HTMLElement>("[data-provision-preview]"),
		junctionNote: get<HTMLElement>("[data-junction-note]"),
		sourcePath: get<HTMLElement>("[data-source-path]"),
		source: get<HTMLElement>("[data-source]"),
		stationId: get<HTMLElement>("[data-station-id]"),
		yardSelect: get<HTMLSelectElement>("[data-yard-select]"),
		demoPolicy: get<HTMLSelectElement>("[data-demo-policy]"),
		stationPolicy: get<HTMLElement>("[data-station-policy]"),
		stationPlanLine: get<HTMLElement>("[data-station-plan-line]"),
		deployStations: get<HTMLButtonElement>("[data-deploy-stations]"),
		stationSelect: get<HTMLSelectElement>("[data-station-select]"),
		removeStation: get<HTMLButtonElement>("[data-remove-station]"),
		clearStations: get<HTMLButtonElement>("[data-clear-stations]"),
		appSelect: get<HTMLSelectElement>("[data-app-select]"),
		examplePolicy: get<HTMLElement>("[data-example-policy]"),
		examplePlanLine: get<HTMLElement>("[data-example-plan-line]"),
		deployApps: get<HTMLButtonElement>("[data-deploy-apps]"),
		deployState: get<HTMLElement>("[data-deploy-state]"),
		terminal: get<HTMLElement>("[data-terminal]"),
		liveSelect: get<HTMLSelectElement>("[data-live-select]"),
		livePreview: get<HTMLButtonElement>("[data-live-preview]"),
		liveOpen: get<HTMLButtonElement>("[data-live-open]"),
		liveClaim: get<HTMLButtonElement>("[data-live-claim]"),
		claimedLine: get<HTMLElement>("[data-claimed-line]"),
		placement: get<HTMLElement>("[data-placement]"),
	};
}

export type { BudgetPolicy, DeployedStation, StationRegistry, BrowserWitStationHost };
