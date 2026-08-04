import {
	parseExamplesCatalog,
	type ExampleCatalogEntry,
	type ExampleYard,
} from "./catalog-contract.js";
import {
	describeRouting,
	mergeBudgetPolicy,
	resolveDeployPlan,
	type DeployPlan,
	type DeploymentRole,
	type StationTarget,
} from "./policy-planner.js";
import {
	createBrowserWitStationHost,
	type BrowserWitStationHost,
} from "./runtime/browser-station.js";

interface TargetPack {
	readonly label: string;
	readonly resourceClass: StationTarget["resourceClass"];
	readonly canHostNow: boolean;
	readonly unavailableReason?: string;
	readonly native: readonly string[];
	readonly lowers: Readonly<Record<string, string>>;
	readonly environment: string;
}

interface LiveHost {
	readonly target: StationTarget;
	readonly role: DeploymentRole;
	readonly stationId: string;
	readonly runtime: BrowserWitStationHost;
	readonly frame: HTMLIFrameElement;
}

export const HOST_SANDBOX_TOKENS = ["allow-scripts"] as const;

const TARGET_PACKS: Readonly<Record<string, TargetPack>> = {
	"browser-wasm": {
		label: "Browser WASM",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue"],
		lowers: {},
		environment: "browser Component Model",
	},
	webernetes: {
		label: "Webernetes (local)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue"],
		lowers: {},
		environment: "browser WIT Station · simulated pod chrome Running 1/1",
	},
	cloudflare: {
		label: "Cloudflare",
		resourceClass: "anonymous-remote",
		canHostNow: false,
		unavailableReason: "remote bootstrap requires a trusted local bridge",
		native: ["http", "kv", "queue"],
		lowers: {},
		environment: "remote executor unavailable",
	},
	netlify: {
		label: "Netlify",
		resourceClass: "anonymous-remote",
		canHostNow: false,
		unavailableReason: "provider account bootstrap is unavailable on static Pages",
		native: ["http"],
		lowers: { kv: "memory", queue: "memory" },
		environment: "bridge required",
	},
	vercel: {
		label: "Vercel",
		resourceClass: "anonymous-remote",
		canHostNow: false,
		unavailableReason: "provider account bootstrap is unavailable on static Pages",
		native: ["http"],
		lowers: { kv: "memory", queue: "memory" },
		environment: "bridge required",
	},
	lakebed: {
		label: "Lakebed (local)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http", "kv", "queue"],
		lowers: {},
		environment: "browser WIT Station",
	},
	kubernetes: {
		label: "Kubernetes (local simulation)",
		resourceClass: "local",
		canHostNow: true,
		native: ["http"],
		lowers: { kv: "in-memory binding", queue: "in-memory binding" },
		environment: "local via Webernetes · no kubeconfig",
	},
};

export async function bootExamplesConsole(): Promise<void> {
	const root = document.querySelector<HTMLElement>("[data-examples-console]");
	if (!root) return;
	const ui = requiredElements(root);
	const base = normalizeBase(root.dataset.base);
	const stationId = `station:browser:${crypto.randomUUID()}`;
	ui.stationId.textContent = stationId;

	const response = await fetch(`${base}examples/index.json`);
	if (!response.ok) throw new Error(`Examples catalog unavailable (${response.status})`);
	const catalog = parseExamplesCatalog(await response.json());
	if (catalog.length === 0) throw new Error("Examples catalog is empty");

	let current = catalog[0]!;
	let selected = defaultSelectedTargetIds(current);
	let plan = resolveExampleDeployPlan(current, selected);
	let live: LiveHost[] = [];
	let deploying = false;

	const clearLive = () => {
		for (const host of live) {
			host.frame.remove();
			host.runtime.revoke();
		}
		live = [];
	};

	const render = () => {
		plan = resolveExampleDeployPlan(current, selected);
		renderExampleTabs(ui.exampleTabs, catalog, current.id, selectExample);
		ui.exampleTitle.textContent = current.title;
		ui.sourcePath.textContent = current.sourcePath;
		ui.source.textContent = current.source;
		renderProviders(ui.providerList, current, selected, plan, live, (id, checked) => {
			if (deploying) return render();
			if (live.length > 0) {
				clearLive();
				resetHostFrames(ui);
				ui.deployState.textContent = "idle";
				ui.terminal.replaceChildren(
					line("system", "Placement changed. Deploy the updated plan to launch new previews."),
				);
			}
			if (checked) selected.add(id);
			else selected.delete(id);
			render();
		});
		renderPolicy(ui.policy, plan);
		ui.planLine.textContent = `plan: ${plan.summary}`;
		ui.provisionPreview.textContent = plan.summary;
		ui.deploy.disabled = deploying || plan.provision.length === 0;
		ui.deploy.firstElementChild!.textContent = `Deploy plan (${plan.provision.length} ${plan.provision.length === 1 ? "host" : "hosts"})`;
		renderLive(ui, live, plan);
	};

	function selectExample(id: string) {
		if (deploying) return;
		const next = catalog.find((example) => example.id === id);
		if (!next || next === current) return;
		clearLive();
		current = next;
		selected = defaultSelectedTargetIds(next);
		resetHostFrames(ui);
		ui.terminal.replaceChildren(line("system", `Loaded ${next.title}. Inspect the policy plan before shipping.`));
		render();
	}

	for (const button of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
		button.addEventListener("click", () => {
			for (const peer of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
				peer.setAttribute("aria-pressed", String(peer === button));
			}
			for (const panel of root.querySelectorAll<HTMLElement>("[data-view-panel]")) {
				panel.hidden = panel.dataset.viewPanel !== button.dataset.view;
			}
		});
	}

	ui.deploy.addEventListener("click", async () => {
		if (deploying) return;
		deploying = true;
		clearLive();
		resetHostFrames(ui);
		ui.terminal.replaceChildren();
		ui.deployState.textContent = "deploying";
		render();
		const opened: LiveHost[] = [];
		try {
			await writeTerminal(ui.terminal, "command", `$ hobo deploy --app ${current.id}`);
			await writeTerminal(ui.terminal, "system", policyCommand(plan));
			await writeTerminal(ui.terminal, "system", `→ ${plan.summary}`);
			for (const skipped of plan.skipped) {
				await writeTerminal(ui.terminal, "skip", `· policy-skip ${skipped.target.id}: ${skipped.detail}`);
			}

			const provisioned = await mapConcurrent(
				plan.provision,
				plan.policy.maxConcurrent,
				async ({ target, role }) => {
					const pack = packFor(target.id);
					await writeTerminal(ui.terminal, "system", `── ${pack.label} (${role}) ──`);
					await writeTerminal(ui.terminal, "command", `$ hobo station bootstrap --target ${target.id} --yard ${target.yardId} --app ${current.id}`);
					await writeTerminal(ui.terminal, "system", `→ component-local memory bindings: ${current.needs.join(", ")} · WIT invoke export`);
					const hostStationId = `${stationId}:${target.id}:${current.id}`;
					const runtime = await createBrowserWitStationHost({
						assetBaseUrl: `${base}examples/runtime`,
						exampleId: current.id,
						title: current.title,
						ui: current.ui,
						stationId: hostStationId,
						targetLabel: `${pack.label} · ${pack.environment}`,
						runtime: current.runtime,
					});
					const frame = createHostFrame(`${current.title} on ${pack.label}`);
					ui.junctionNote.before(frame);
					try {
						await waitForStation(frame, hostStationId, runtime.url);
					} catch (error) {
						frame.remove();
						runtime.revoke();
						throw error;
					}
					await writeTerminal(ui.terminal, "success", `✓ ${pack.label} live ${runtime.url}`);
					const host = { target, role, stationId: hostStationId, runtime, frame } satisfies LiveHost;
					opened.push(host);
					return host;
				},
			);
			live = plan.provision.map(({ target }) => provisioned.find((host) => host.target.id === target.id)!);
			await writeTerminal(ui.terminal, "command", `$ hobo plan placements --routing ${plan.policy.routing}`);
			await writeTerminal(ui.terminal, "system", `→ placement intent only · ${describeRouting(plan)}`);
			await writeTerminal(ui.terminal, "success", `✓ ${live.length} independent host previews live · ${plan.skipped.length} policy-skipped`);
			ui.deployState.textContent = "live";
		} catch (error) {
			for (const host of opened) {
				host.frame.remove();
				host.runtime.revoke();
			}
			live = [];
			await writeTerminal(ui.terminal, "stderr", `✗ ${error instanceof Error ? error.message : String(error)}`);
			ui.deployState.textContent = "failed";
		} finally {
			deploying = false;
			render();
		}
	});

	render();
}

export function resolveExampleDeployPlan(
	example: ExampleCatalogEntry,
	selected: ReadonlySet<string> = defaultSelectedTargetIds(example),
) {
	const deployableYards = deployableYardIds(example);
	return resolveDeployPlan(
		example.topology.yards
			.filter(
				(yard) =>
					selected.has(yard.targetId) && deployableYards.has(yard.id),
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

export function defaultSelectedTargetIds(example: ExampleCatalogEntry): Set<string> {
	const allowed = deployableYardIds(example);
	return new Set(
		example.topology.yards
			.filter((yard) => allowed.has(yard.id))
			.map((yard) => yard.targetId),
	);
}

function deployableYardIds(example: ExampleCatalogEntry): Set<string> {
	return new Set(
		example.topology.allowedYardIds ?? example.topology.junction.yardIds,
	);
}

function renderExampleTabs(
	container: HTMLElement,
	examples: readonly ExampleCatalogEntry[],
	currentId: string,
	select: (id: string) => void,
) {
	container.replaceChildren(
		...examples.map((example) => {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = example.title;
			button.setAttribute("aria-pressed", String(example.id === currentId));
			button.addEventListener("click", () => select(example.id));
			return button;
		}),
	);
}

function renderProviders(
	container: HTMLElement,
	example: ExampleCatalogEntry,
	selected: ReadonlySet<string>,
	plan: DeployPlan,
	live: readonly LiveHost[],
	onChange: (id: string, checked: boolean) => void,
) {
	const allowed = deployableYardIds(example);
	container.replaceChildren(
		...example.topology.yards.map((yard) => {
			const pack = packFor(yard.targetId);
			const row = document.createElement("label");
			row.className = "provider-row";
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = selected.has(yard.targetId);
			checkbox.disabled = !allowed.has(yard.id);
			checkbox.addEventListener("change", () => onChange(yard.targetId, checkbox.checked));
			const copy = document.createElement("span");
			copy.innerHTML = `<span class="provider-name"></span><span class="provider-detail"></span>`;
			copy.firstElementChild!.textContent = pack.label;
			copy.lastElementChild!.textContent = `${yard.id} · ${pack.environment}`;
			const badge = document.createElement("span");
			badge.className = "provider-badge";
			const hosted = live.find((host) => host.target.id === yard.targetId);
			const provision = plan.provision.find(({ target }) => target.id === yard.targetId);
			const skipped = plan.skipped.find(({ target }) => target.id === yard.targetId);
			if (hosted) {
				badge.classList.add("live");
				badge.textContent = `live preview · intended ${hosted.role}`;
			} else if (!allowed.has(yard.id)) {
				badge.classList.add("blocked");
				badge.textContent = "yard-blocked";
			} else if (provision) {
				badge.textContent = `will preview · intended ${provision.role}`;
			} else if (skipped) {
				if (skipped.reason === "cannot-host") badge.classList.add("blocked");
				badge.textContent = `${skipped.reason} · ${skipped.detail}`;
			} else {
				badge.textContent = "available · not selected";
			}
			row.append(checkbox, copy, badge);
			return row;
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

function renderLive(ui: ReturnType<typeof requiredElements>, live: readonly LiveHost[], plan: DeployPlan) {
	ui.hostEmpty.hidden = live.length > 0;
	ui.hostTabs.hidden = live.length === 0;
	ui.liveHosts.replaceChildren(
		...(live.length === 0
			? [listItem("None provisioned")]
			: live.map((host) => {
					const item = document.createElement("li");
					item.textContent = `${packFor(host.target.id).label} · intended ${host.role}`;
					return item;
				})),
	);
	ui.placement.replaceChildren(
		...plan.provision.map(({ target, role }) => {
			const pack = packFor(target.id);
			const item = document.createElement("li");
			const lowered = Object.entries(pack.lowers);
			item.textContent = `${pack.label} · ${role} · native ${pack.native.join(", ")}${lowered.length === 0 ? "" : ` · auto-lowered ${lowered.map(([from, to]) => `${from}→${to}`).join(", ")}`}`;
			return item;
		}),
	);
	ui.hostTabs.replaceChildren(
		...live.map((host, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = `${packFor(host.target.id).label} · ${host.role}`;
			button.setAttribute("aria-pressed", String(index === 0));
			button.addEventListener("click", () => activateHost(ui.hostTabs, live, host));
			host.frame.hidden = index !== 0;
			return button;
		}),
	);
	ui.junctionNote.hidden = live.length === 0;
	ui.junctionNote.textContent = live.length > 0 ? `Placement preview: independent in-memory hosts; no failover or mirroring · ${describeRouting(plan)}${plan.junction ? ` · ${plan.junction.yardIds.join(" + ")}` : ""}` : "";
}

function activateHost(tabs: HTMLElement, live: readonly LiveHost[], active: LiveHost) {
	for (const [index, host] of live.entries()) {
		host.frame.hidden = host !== active;
		tabs.children[index]?.setAttribute("aria-pressed", String(host === active));
	}
}

function createHostFrame(title: string): HTMLIFrameElement {
	const frame = document.createElement("iframe");
	frame.dataset.hostFrame = "";
	frame.title = title;
	frame.sandbox.add(...HOST_SANDBOX_TOKENS);
	frame.hidden = true;
	return frame;
}

function waitForStation(
	frame: HTMLIFrameElement,
	stationId: string,
	url: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => done(new Error(`station bootstrap timed out: ${stationId}`)), 20_000);
		const receive = (event: MessageEvent) => {
			if (event.source !== frame.contentWindow || event.data?.source !== "hobo-browser-station" || event.data?.stationId !== stationId) return;
			done(event.data.status === "ready" ? undefined : new Error(event.data.message ?? `station failed: ${stationId}`));
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
	for (const frame of document.querySelectorAll<HTMLIFrameElement>("[data-host-frame]")) frame.remove();
	ui.hostTabs.replaceChildren();
	ui.hostTabs.hidden = true;
	ui.hostEmpty.hidden = false;
	ui.junctionNote.hidden = true;
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

function listItem(text: string) {
	const item = document.createElement("li");
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
		exampleTabs: get<HTMLElement>("[data-example-tabs]"),
		exampleTitle: get<HTMLElement>("[data-example-title]"),
		hostTabs: get<HTMLElement>("[data-host-tabs]"),
		hostEmpty: get<HTMLElement>("[data-host-empty]"),
		provisionPreview: get<HTMLElement>("[data-provision-preview]"),
		junctionNote: get<HTMLElement>("[data-junction-note]"),
		sourcePath: get<HTMLElement>("[data-source-path]"),
		source: get<HTMLElement>("[data-source]"),
		stationId: get<HTMLElement>("[data-station-id]"),
		providerList: get<HTMLElement>("[data-provider-list]"),
		policy: get<HTMLElement>("[data-policy]"),
		planLine: get<HTMLElement>("[data-plan-line]"),
		deploy: get<HTMLButtonElement>("[data-deploy]"),
		deployState: get<HTMLElement>("[data-deploy-state]"),
		terminal: get<HTMLElement>("[data-terminal]"),
		liveHosts: get<HTMLElement>("[data-live-hosts]"),
		placement: get<HTMLElement>("[data-placement]"),
	};
}
