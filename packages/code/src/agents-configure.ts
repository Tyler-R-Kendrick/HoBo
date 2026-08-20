/**
 * `/agents` configure form — model + effort for a harness or Bo subagent.
 * HoBo Bo / subagents / Pi pick from the Bo model catalog; other coding
 * harnesses pick from per-provider catalogs (`harness-model-catalog`), with
 * OpenAI-/Anthropic-compatible endpoints merged for Codex / Claude.
 */

import { must } from "@hobo/core/total-access";
import {
	createProjectEveAgent,
	type ProjectEveAgent,
} from "./agents-catalog.js";
import {
	type BoModelOffer,
	cycleBoModelOffer,
	findOfferIndex,
	type ListBoModelOffersInput,
	listBoModelOffers,
} from "./bo-model-catalog.js";
import { listHarnessModelOffers } from "./harness-model-catalog.js";
import {
	cycleEffort,
	type EffortLevel,
	type HarnessSettings,
	loadHarnessSettings,
	saveHarnessSettings,
} from "./harness-settings.js";

export type AgentsConfigureTarget =
	| {
			readonly kind: "harness";
			readonly harnessId: string;
			readonly label: string;
	  }
	| {
			readonly kind: "eve";
			readonly id: string;
			readonly label: string;
			readonly path: string;
	  }
	| {
			readonly kind: "hobo-bo";
			readonly label: "Hobo Bo";
			readonly eveAgents: readonly ProjectEveAgent[];
	  };

export type AgentsConfigureField =
	| "model"
	| "effort"
	| "eve-list"
	| "create-id";

/** Optional live inference tags / env for the Bo model picker. */
export type AgentsConfigureCatalogOptions = Omit<
	ListBoModelOffersInput,
	"hoboHome"
> & {
	/** Forwarded to harness model catalog (default: on outside Vitest). */
	readonly live?: boolean;
};

export interface AgentsConfigureState {
	readonly target: AgentsConfigureTarget;
	readonly model: string;
	/** LiteLLM-style `provider/model` when selected from modelOffers. */
	readonly modelId: string;
	readonly via: string;
	readonly apiEndpoint: string;
	readonly effort: EffortLevel;
	readonly field: AgentsConfigureField;
	/** Cursor into subagent list (+ create row) when field === "eve-list". */
	readonly eveCursor: number;
	/** Bo-reachable models (ollama + harness + BYOK + …). */
	readonly modelOffers: readonly BoModelOffer[];
	readonly modelCursor: number;
	readonly dirty: boolean;
	/** Draft id while field === "create-id". */
	readonly createDraft: string;
	readonly createError: string;
	/**
	 * When set, Esc returns here instead of closing to the catalog.
	 * Used for HoBo Bo → subagent drill-in.
	 */
	readonly parent?: AgentsConfigureState;
}

export type AgentsConfigureKeyResult =
	| { readonly kind: "state"; readonly state: AgentsConfigureState }
	| { readonly kind: "back"; readonly toParent?: AgentsConfigureState }
	| {
			readonly kind: "saved";
			readonly settings: HarnessSettings;
			readonly scope: "harness" | "eve";
			readonly path: string;
			readonly returnTo?: AgentsConfigureState;
	  }
	| {
			readonly kind: "open-eve";
			readonly agent: ProjectEveAgent;
	  }
	| {
			readonly kind: "created";
			readonly agent: ProjectEveAgent;
	  };

function loadBoOffers(
	hoboHome: string,
	options?: AgentsConfigureCatalogOptions,
): readonly BoModelOffer[] {
	return listBoModelOffers({
		hoboHome,
		...(options?.env !== undefined ? { env: options.env } : undefined),
		...(options?.ollama !== undefined ? { ollama: options.ollama } : undefined),
		...(options?.harnessIds !== undefined
			? { harnessIds: options.harnessIds }
			: undefined),
	});
}

function withModelSelection(
	base: Omit<
		AgentsConfigureState,
		"modelCursor" | "modelId" | "via" | "apiEndpoint" | "modelOffers"
	> & {
		readonly modelOffers: readonly BoModelOffer[];
		readonly modelId?: string;
		readonly via?: string;
		readonly apiEndpoint?: string;
	},
): AgentsConfigureState {
	const modelId = base.modelId ?? "";
	const via = base.via ?? "";
	const apiEndpoint = base.apiEndpoint ?? "";
	const modelCursor = findOfferIndex(
		base.modelOffers,
		base.model,
		modelId || undefined,
		via || undefined,
		apiEndpoint || undefined,
	);
	const offer = base.modelOffers[modelCursor];
	const matched =
		offer && (modelId ? offer.id === modelId : offer.runtimeId === base.model);
	return clampConfigureState({
		...base,
		modelCursor,
		modelId: modelId || (matched ? offer.id : ""),
		via: via || (matched ? (offer.via ?? "") : ""),
		apiEndpoint: apiEndpoint || (matched ? (offer.baseUrl ?? "") : ""),
	});
}

function selectionFromLoaded(loaded: HarnessSettings) {
	return {
		...(loaded.modelId !== undefined ? { modelId: loaded.modelId } : undefined),
		...(loaded.via !== undefined ? { via: loaded.via } : undefined),
		...(loaded.apiEndpoint !== undefined
			? { apiEndpoint: loaded.apiEndpoint }
			: undefined),
	};
}

function selectionFromOffer(offer: BoModelOffer) {
	return {
		modelId: offer.id,
		via: offer.via ?? "",
		apiEndpoint: offer.baseUrl ?? "",
	};
}

export function openHarnessConfigure(
	hoboHome: string,
	harnessId: string,
	label: string,
	catalog?: AgentsConfigureCatalogOptions,
): AgentsConfigureState {
	const loaded = loadHarnessSettings(hoboHome, harnessId, "harness");
	const modelOffers =
		harnessId === "pi"
			? loadBoOffers(hoboHome, catalog)
			: listHarnessModelOffers(harnessId, {
					hoboHome,
					...(catalog?.env !== undefined ? { env: catalog.env } : undefined),
					...(catalog?.live !== undefined ? { live: catalog.live } : undefined),
				});
	return withModelSelection({
		target: { kind: "harness", harnessId, label },
		model: loaded.model,
		...selectionFromLoaded(loaded),
		effort: loaded.effort,
		field: "model",
		eveCursor: 0,
		modelOffers,
		dirty: false,
		createDraft: "",
		createError: "",
	});
}

export function openEveConfigure(
	hoboHome: string,
	agent: ProjectEveAgent,
	catalog?: AgentsConfigureCatalogOptions,
): AgentsConfigureState {
	const loaded = loadHarnessSettings(hoboHome, agent.id, "eve");
	return withModelSelection({
		target: {
			kind: "eve",
			id: agent.id,
			label: agent.id,
			path: agent.path,
		},
		model: loaded.model,
		...selectionFromLoaded(loaded),
		effort: loaded.effort,
		field: "model",
		eveCursor: 0,
		modelOffers: loadBoOffers(hoboHome, catalog),
		dirty: false,
		createDraft: "",
		createError: "",
	});
}

export function openHoboBoConfigure(
	hoboHome: string,
	eveAgents: readonly ProjectEveAgent[],
	catalog?: AgentsConfigureCatalogOptions,
): AgentsConfigureState {
	const loaded = loadHarnessSettings(hoboHome, "hobo-code", "harness");
	return withModelSelection({
		target: { kind: "hobo-bo", label: "Hobo Bo", eveAgents },
		model: loaded.model,
		...selectionFromLoaded(loaded),
		effort: loaded.effort,
		field: "model",
		eveCursor: 0,
		modelOffers: loadBoOffers(hoboHome, catalog),
		dirty: false,
		createDraft: "",
		createError: "",
	});
}

export function flattenEveAgents(
	agents: readonly ProjectEveAgent[],
): readonly ProjectEveAgent[] {
	const out: ProjectEveAgent[] = [];
	const walk = (rows: readonly ProjectEveAgent[]) => {
		for (const row of rows) {
			out.push(row);
			if (row.children.length > 0) walk(row.children);
		}
	};
	walk(agents);
	return out;
}

/** Agent rows + trailing "+ create" action. Always ≥1 selectable row on HoBo Bo. */
export function eveListRowCount(target: AgentsConfigureTarget): number {
	if (target.kind !== "hobo-bo") return 0;
	return flattenEveAgents(target.eveAgents).length + 1;
}

export function eveListCreateIndex(target: AgentsConfigureTarget): number {
	if (target.kind !== "hobo-bo") return -1;
	return flattenEveAgents(target.eveAgents).length;
}

export function clampConfigureState(
	state: AgentsConfigureState,
): AgentsConfigureState {
	const maxEve = Math.max(0, eveListRowCount(state.target) - 1);
	const eveCursor = Math.max(0, Math.min(state.eveCursor, maxEve));
	const maxModel = Math.max(0, state.modelOffers.length - 1);
	const modelCursor = Math.max(0, Math.min(state.modelCursor, maxModel));
	if (eveCursor === state.eveCursor && modelCursor === state.modelCursor) {
		return state;
	}
	return { ...state, eveCursor, modelCursor };
}

export function formatAgentsConfigureLines(
	state: AgentsConfigureState,
): readonly string[] {
	const ready = clampConfigureState(state);
	const title =
		ready.target.kind === "hobo-bo"
			? "Configure · Hobo Bo"
			: ready.target.kind === "eve"
				? `Configure · ${ready.target.label}`
				: `Configure · ${ready.target.label}`;
	const modelMark = ready.field === "model" ? "▸" : " ";
	const effortMark = ready.field === "effort" ? "▸" : " ";
	const offer = ready.modelOffers[ready.modelCursor];
	const modelLine = `${modelMark} model   ${ready.model || "(unset)"}`;
	const lines = [title, "", modelLine];
	if (ready.modelId) {
		const bits = [ready.modelId];
		if (ready.via) bits.push(`via=${ready.via}`);
		lines.push(`          ${bits.join(" · ")}`);
	} else if (ready.field === "model" && offer) {
		const bits = [offer.id];
		if (offer.via) bits.push(`via=${offer.via}`);
		lines.push(`          ${bits.join(" · ")}`);
	}
	const endpointHint = ready.apiEndpoint || offer?.baseUrl || "";
	if (endpointHint) {
		lines.push(`          api_endpoint ${endpointHint}`);
	}
	if (ready.field === "model" && ready.modelOffers.length > 0) {
		const scope =
			ready.target.kind === "harness"
				? ready.target.label
				: ready.target.kind === "hobo-bo"
					? "Bo"
					: "subagent";
		lines.push(
			`          ←→ ${ready.modelCursor + 1}/${ready.modelOffers.length} ${scope} models`,
		);
	}
	lines.push(`${effortMark} effort  ${ready.effort}`);
	if (ready.target.kind === "eve") {
		lines.push(`  path    ${ready.target.path}`);
	}
	if (ready.target.kind === "hobo-bo") {
		lines.push("");
		lines.push("  ── Subagents ──");
		const flat = flattenEveAgents(ready.target.eveAgents);
		if (flat.length === 0) {
			lines.push("  (none yet — create one below)");
		} else {
			for (const [i, agent] of flat.entries()) {
				const mark =
					ready.field === "eve-list" && i === ready.eveCursor ? "▸" : " ";
				const depth = agent.parentId ? "  " : "";
				lines.push(`${mark} ${depth}${agent.id}`);
			}
		}
		const createIndex = eveListCreateIndex(ready.target);
		const createMark =
			(ready.field === "eve-list" && ready.eveCursor === createIndex) ||
			ready.field === "create-id"
				? "▸"
				: " ";
		if (ready.field === "create-id") {
			lines.push(
				`${createMark} + create  ${ready.createDraft || "(type id)"}_`,
			);
			if (ready.createError) {
				lines.push(`    ! ${ready.createError}`);
			}
		} else {
			lines.push(`${createMark} + create subagent`);
		}
		lines.push("");
		lines.push("  model = Bo catalog (ollama · harness · openai-compatible)");
	}
	lines.push("");
	if (ready.field === "create-id") {
		lines.push("Enter create · Esc cancel · type id (a-z0-9-)");
	} else if (ready.field === "model" && ready.modelOffers.length > 0) {
		lines.push(
			"←→ pick model · type custom · Tab field · Enter save/open · Esc back",
		);
	} else {
		lines.push(
			"Enter save/open · Esc back · Tab field · ←→ effort · type model",
		);
	}
	return lines;
}

export function reduceAgentsConfigureKey(
	state: AgentsConfigureState,
	key: string,
	hoboHome: string,
	projectDir: string,
): AgentsConfigureKeyResult {
	const ready = clampConfigureState(state);

	if (key === "\x1b" || key === "q") {
		if (ready.field === "create-id") {
			return {
				kind: "state",
				state: clampConfigureState({
					...ready,
					field: "eve-list",
					createDraft: "",
					createError: "",
					eveCursor: eveListCreateIndex(ready.target),
				}),
			};
		}
		if (ready.parent) {
			return { kind: "back", toParent: ready.parent };
		}
		return { kind: "back" };
	}

	if (ready.field === "create-id") {
		return reduceCreateId(ready, key, projectDir);
	}

	if (key === "\t") {
		return { kind: "state", state: nextField(ready, 1) };
	}
	if (matchesShiftTab(key)) {
		return { kind: "state", state: nextField(ready, -1) };
	}

	if (key === "\x1b[B" || key === "j") {
		if (ready.field === "eve-list") {
			const max = Math.max(0, eveListRowCount(ready.target) - 1);
			if (ready.eveCursor >= max) {
				return { kind: "state", state: ready };
			}
			return {
				kind: "state",
				state: clampConfigureState({
					...ready,
					eveCursor: ready.eveCursor + 1,
				}),
			};
		}
		return { kind: "state", state: nextField(ready, 1) };
	}
	if (key === "\x1b[A" || key === "k") {
		if (ready.field === "eve-list") {
			if (ready.eveCursor > 0) {
				return {
					kind: "state",
					state: clampConfigureState({
						...ready,
						eveCursor: ready.eveCursor - 1,
					}),
				};
			}
			return { kind: "state", state: nextField(ready, -1) };
		}
		return { kind: "state", state: nextField(ready, -1) };
	}

	if (key === "\x1b[C" || key === "l" || key === "\x1b[D" || key === "h") {
		if (ready.field === "model" && ready.modelOffers.length > 0) {
			const delta: 1 | -1 = key === "\x1b[C" || key === "l" ? 1 : -1;
			const cycled = cycleBoModelOffer(
				ready.modelOffers,
				ready.modelCursor,
				delta,
			);
			if (!cycled.offer) return { kind: "state", state: ready };
			return {
				kind: "state",
				state: clampConfigureState({
					...ready,
					modelCursor: cycled.index,
					model: cycled.offer.runtimeId,
					...selectionFromOffer(cycled.offer),
					dirty: true,
				}),
			};
		}
		if (ready.field === "effort") {
			const delta: 1 | -1 = key === "\x1b[C" || key === "l" ? 1 : -1;
			return {
				kind: "state",
				state: {
					...ready,
					effort: cycleEffort(ready.effort, delta),
					dirty: true,
				},
			};
		}
	}

	if (key === "\r" || key === "\n") {
		if (ready.field === "eve-list" && ready.target.kind === "hobo-bo") {
			const flat = flattenEveAgents(ready.target.eveAgents);
			const createIndex = eveListCreateIndex(ready.target);
			if (ready.eveCursor === createIndex) {
				return {
					kind: "state",
					state: {
						...ready,
						field: "create-id",
						createDraft: "",
						createError: "",
					},
				};
			}
			const agent = flat[ready.eveCursor];
			if (agent) return { kind: "open-eve", agent };
			return { kind: "state", state: ready };
		}
		return saveConfigure(ready, hoboHome);
	}

	if (ready.field === "model") {
		if (key === "\x7f" || key === "\b") {
			return {
				kind: "state",
				state: {
					...ready,
					model: ready.model.slice(0, -1),
					modelId: "",
					via: "",
					apiEndpoint: "",
					dirty: true,
				},
			};
		}
		if (key.length === 1 && key >= " " && key !== "\x7f") {
			return {
				kind: "state",
				state: {
					...ready,
					model: `${ready.model}${key}`,
					modelId: "",
					via: "",
					apiEndpoint: "",
					dirty: true,
				},
			};
		}
	}

	return { kind: "state", state: ready };
}

function reduceCreateId(
	state: AgentsConfigureState,
	key: string,
	projectDir: string,
): AgentsConfigureKeyResult {
	if (key === "\r" || key === "\n") {
		const created = createProjectEveAgent(projectDir, state.createDraft);
		if (!created.ok) {
			return {
				kind: "state",
				state: { ...state, createError: created.error },
			};
		}
		return { kind: "created", agent: created.agent };
	}
	if (key === "\x7f" || key === "\b") {
		return {
			kind: "state",
			state: {
				...state,
				createDraft: state.createDraft.slice(0, -1),
				createError: "",
			},
		};
	}
	if (key.length === 1 && /[a-zA-Z0-9-]/u.test(key)) {
		return {
			kind: "state",
			state: {
				...state,
				createDraft: `${state.createDraft}${key.toLowerCase()}`.slice(0, 63),
				createError: "",
			},
		};
	}
	return { kind: "state", state };
}

function matchesShiftTab(key: string): boolean {
	return key === "\x1b[Z";
}

function nextField(
	state: AgentsConfigureState,
	delta: 1 | -1,
): AgentsConfigureState {
	const fields: AgentsConfigureField[] =
		state.target.kind === "hobo-bo"
			? ["model", "effort", "eve-list"]
			: ["model", "effort"];
	const i = fields.indexOf(
		state.field === "create-id" ? "eve-list" : state.field,
	);
	const next = must(
		fields[(i + delta + fields.length) % fields.length],
		"fields[(i + delta + fields.length) % fields.length]",
	);
	return clampConfigureState({
		...state,
		field: next,
		createDraft: "",
		createError: "",
	});
}

function saveConfigure(
	state: AgentsConfigureState,
	hoboHome: string,
): AgentsConfigureKeyResult {
	const id =
		state.target.kind === "harness"
			? state.target.harnessId
			: state.target.kind === "eve"
				? state.target.id
				: "hobo-code";
	const scope = state.target.kind === "eve" ? "eve" : "harness";
	const modelId =
		state.modelId.trim().length > 0 ? state.modelId.trim() : undefined;
	const via = state.via.trim().length > 0 ? state.via.trim() : undefined;
	const apiEndpoint =
		state.apiEndpoint.trim().length > 0 ? state.apiEndpoint.trim() : undefined;
	const settings: HarnessSettings = {
		schema: "hobo.code.harness-settings/v1",
		id,
		model: state.model.trim(),
		...(modelId !== undefined ? { modelId } : undefined),
		...(via !== undefined ? { via } : undefined),
		...(apiEndpoint !== undefined ? { apiEndpoint } : undefined),
		effort: state.effort,
	};
	const path = saveHarnessSettings(hoboHome, settings, scope);
	return {
		kind: "saved",
		settings,
		scope,
		path,
		...(state.parent ? { returnTo: state.parent } : undefined),
	};
}

// public-contract: /agents configure command-rail key legend
export const AGENTS_CONFIGURE_KEY_LEGEND =
	"configure · Tab field · ←→ model/effort · Enter save/open/create · Esc back";

/** Drill into a subagent while keeping HoBo Bo form on the Esc stack. */
export function openEveConfigureFromParent(
	hoboHome: string,
	agent: ProjectEveAgent,
	parent: AgentsConfigureState,
): AgentsConfigureState {
	const loaded = loadHarnessSettings(hoboHome, agent.id, "eve");
	const offers =
		parent.modelOffers.length > 0 ? parent.modelOffers : loadBoOffers(hoboHome);
	const { parent: _ignored, ...rest } = parent;
	return withModelSelection({
		target: {
			kind: "eve",
			id: agent.id,
			label: agent.id,
			path: agent.path,
		},
		model: loaded.model,
		...selectionFromLoaded(loaded),
		effort: loaded.effort,
		field: "model",
		eveCursor: 0,
		modelOffers: offers,
		dirty: false,
		createDraft: "",
		createError: "",
		parent: rest,
	});
}
