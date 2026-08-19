import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { must } from "@hobo/core/total-access";
import { afterEach, describe, expect, it } from "vitest";
import {
	createProjectEveAgent,
	discoverProjectEveAgents,
	isValidEveAgentId,
} from "../src/agents-catalog.js";
import {
	type AgentsConfigureState,
	clampConfigureState,
	eveListCreateIndex,
	eveListRowCount,
	flattenEveAgents,
	formatAgentsConfigureLines,
	openEveConfigureFromParent,
	openHarnessConfigure,
	openHoboBoConfigure,
	reduceAgentsConfigureKey,
} from "../src/agents-configure.js";
import { listConfigurableHarnessIds } from "../src/harness-model-catalog.js";
import {
	loadHarnessSettings,
	saveHarnessSettings,
} from "../src/harness-settings.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agents-configure-"));
	dirs.push(dir);
	return dir;
}

function press(
	state: AgentsConfigureState,
	key: string,
	home: string,
	projectDir = home,
): AgentsConfigureState {
	const result = reduceAgentsConfigureKey(state, key, home, projectDir);
	expect(result.kind).toBe("state");
	if (result.kind !== "state") throw new Error("expected state");
	return result.state;
}

describe("agents-configure", () => {
	it("flattens nested Eve agents for HoBo Bo list", () => {
		const flat = flattenEveAgents([
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [
					{
						id: "scout",
						path: "/tmp/.hobo/agents/investigator/subagents/scout",
						source: "hobo-agents",
						parentId: "investigator",
						children: [],
					},
				],
			},
		]);
		expect(flat.map((row) => row.id)).toEqual(["investigator", "scout"]);
	});

	it("eve list always includes create row; empty still selectable", () => {
		const home = tmp();
		const empty = openHoboBoConfigure(home, []);
		expect(eveListRowCount(empty.target)).toBe(1);
		expect(eveListCreateIndex(empty.target)).toBe(0);
		expect(formatAgentsConfigureLines(empty).join("\n")).toMatch(
			/\+ create subagent/,
		);
		expect(formatAgentsConfigureLines(empty).join("\n")).toMatch(/none yet/);

		const withAgent = openHoboBoConfigure(home, [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [],
			},
		]);
		expect(eveListRowCount(withAgent.target)).toBe(2);
		expect(eveListCreateIndex(withAgent.target)).toBe(1);
	});

	it("clamps eveCursor — invalid indexes snap into range", () => {
		const home = tmp();
		const state = clampConfigureState({
			...openHoboBoConfigure(home, []),
			field: "eve-list",
			eveCursor: 99,
		});
		expect(state.eveCursor).toBe(0);
		const down = press({ ...state, eveCursor: 0 }, "\x1b[B", home);
		expect(down.eveCursor).toBe(0);
	});

	it("HoBo Bo form lists Eve and Enter on eve-list opens that agent", () => {
		const home = tmp();
		let state = openHoboBoConfigure(home, [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [],
			},
		]);
		expect(formatAgentsConfigureLines(state).join("\n")).toMatch(/Subagents/);
		state = press(state, "\t", home);
		state = press(state, "\t", home);
		expect(state.field).toBe("eve-list");
		expect(state.eveCursor).toBe(0);
		const opened = reduceAgentsConfigureKey(state, "\r", home, home);
		expect(opened.kind).toBe("open-eve");
		if (opened.kind === "open-eve") {
			expect(opened.agent.id).toBe("investigator");
		}
	});

	it("↓ past last agent selects create; Enter starts create-id", () => {
		const home = tmp();
		let state = openHoboBoConfigure(home, [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [],
			},
		]);
		state = press(state, "\t", home);
		state = press(state, "\t", home);
		state = press(state, "\x1b[B", home);
		expect(state.eveCursor).toBe(eveListCreateIndex(state.target));
		state = press(state, "\r", home);
		expect(state.field).toBe("create-id");
		expect(formatAgentsConfigureLines(state).join("\n")).toMatch(/\+ create/);
	});

	it("creates Eve agent on disk and returns created result", () => {
		const project = tmp();
		const home = join(project, ".hobo-home");
		let state = openHoboBoConfigure(home, []);
		state = press(state, "\t", home, project);
		state = press(state, "\t", home, project);
		expect(state.field).toBe("eve-list");
		expect(state.eveCursor).toBe(0);
		state = press(state, "\r", home, project);
		expect(state.field).toBe("create-id");
		for (const ch of "scout") {
			state = press(state, ch, home, project);
		}
		const created = reduceAgentsConfigureKey(state, "\r", home, project);
		expect(created.kind).toBe("created");
		if (created.kind !== "created") throw new Error("expected created");
		expect(created.agent.id).toBe("scout");
		const instructions = join(
			project,
			".hobo",
			"agents",
			"scout",
			"instructions.md",
		);
		expect(existsSync(instructions)).toBe(true);
		expect(readFileSync(instructions, "utf8")).toMatch(/^# scout/m);
		const rediscovered = discoverProjectEveAgents(project);
		expect(rediscovered.map((row) => row.id)).toContain("scout");
	});

	it("rejects invalid create ids and duplicate agents", () => {
		expect(isValidEveAgentId("Scout")).toBe(false);
		expect(isValidEveAgentId("1bad")).toBe(false);
		expect(isValidEveAgentId("ok-agent")).toBe(true);
		const project = tmp();
		const first = createProjectEveAgent(project, "dup");
		expect(first.ok).toBe(true);
		const again = createProjectEveAgent(project, "dup");
		expect(again.ok).toBe(false);

		const home = join(project, "home");
		let state = openHoboBoConfigure(home, []);
		state = {
			...state,
			field: "create-id",
			createDraft: "1bad",
			createError: "",
		};
		const bad = reduceAgentsConfigureKey(state, "\r", home, project);
		expect(bad.kind).toBe("state");
		if (bad.kind === "state") {
			expect(bad.state.createError).toMatch(/lowercase/);
		}
	});

	it("saves harness model/effort under HOBO_HOME", () => {
		const home = tmp();
		let state = openHarnessConfigure(home, "codex", "Codex");
		state = {
			...state,
			model: "gpt-5.3-codex",
			effort: "high",
			dirty: true,
		};
		const saved = reduceAgentsConfigureKey(state, "\r", home, home);
		expect(saved.kind).toBe("saved");
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.model).toBe("gpt-5.3-codex");
		expect(loaded.effort).toBe("high");
	});

	it("←→ cycles effort when effort field focused", () => {
		const home = tmp();
		let state = openHarnessConfigure(home, "pi", "Pi");
		state = press(state, "\t", home);
		expect(state.field).toBe("effort");
		state = press(state, "\x1b[C", home);
		expect(state.effort).toBe("high");
		state = press(state, "\x1b[D", home);
		expect(state.effort).toBe("medium");
	});

	it("↑ from top of Eve list returns to effort field", () => {
		const home = tmp();
		let state = openHoboBoConfigure(home, [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [],
			},
		]);
		state = press(state, "\t", home);
		state = press(state, "\t", home);
		expect(state.field).toBe("eve-list");
		state = press(state, "\x1b[A", home);
		expect(state.field).toBe("effort");
	});

	it("Esc from Eve opened via HoBo Bo returns parent form", () => {
		const home = tmp();
		const parent = openHoboBoConfigure(home, [
			{
				id: "investigator",
				path: "/tmp/.hobo/agents/investigator",
				source: "hobo-agents",
				children: [],
			},
		]);
		const onList = { ...parent, field: "eve-list" as const };
		const opened = reduceAgentsConfigureKey(onList, "\r", home, home);
		expect(opened.kind).toBe("open-eve");
		if (opened.kind !== "open-eve") throw new Error("expected open-eve");
		const eve = openEveConfigureFromParent(home, opened.agent, onList);
		expect(eve.parent?.target.kind).toBe("hobo-bo");
		const back = reduceAgentsConfigureKey(eve, "\x1b", home, home);
		expect(back.kind).toBe("back");
		if (back.kind === "back") {
			expect(back.toParent?.target.kind).toBe("hobo-bo");
		}
	});

	it("Esc from create-id cancels back to eve-list", () => {
		const home = tmp();
		let state = openHoboBoConfigure(home, []);
		state = press(state, "\t", home);
		state = press(state, "\t", home);
		state = press(state, "\r", home);
		expect(state.field).toBe("create-id");
		state = press(state, "\x1b", home);
		expect(state.field).toBe("eve-list");
		expect(state.createDraft).toBe("");
	});

	it("←→ on Bo/Eve model field cycles Bo catalog by model id", () => {
		const project = tmp();
		const home = join(project, ".hobo-home");
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "codex",
			model: "gpt-5.6-sol",
			effort: "medium",
		});
		let state = openHoboBoConfigure(home, [], {
			env: {},
			ollama: {
				host: "http://127.0.0.1:11434",
				models: ["qwen2.5-coder:7b"],
			},
		});
		expect(state.modelOffers.length).toBeGreaterThan(0);
		expect(state.field).toBe("model");
		const first = must(
			state.modelOffers[state.modelCursor],
			"state.modelOffers[state.modelCursor]",
		);
		state = press(state, "\x1b[C", home, project);
		expect(state.modelId).not.toBe(first.id);
		expect(state.model).toBe(
			must(
				state.modelOffers[state.modelCursor],
				"state.modelOffers[state.modelCursor]",
			).runtimeId,
		);
		expect(formatAgentsConfigureLines(state).join("\n")).toMatch(
			/\w+\/[\w.:-]+/,
		);

		// Create subagent then open — same Bo catalog for subagent configure
		state = press(state, "\t", home, project);
		state = press(state, "\t", home, project);
		state = press(state, "\r", home, project);
		for (const ch of "scout") {
			state = press(state, ch, home, project);
		}
		const created = reduceAgentsConfigureKey(state, "\r", home, project);
		expect(created.kind).toBe("created");
		if (created.kind !== "created") throw new Error("expected created");
		const eve = openEveConfigureFromParent(home, created.agent, {
			...state,
			field: "eve-list",
		});
		expect(eve.modelOffers.length).toBeGreaterThan(0);
		expect(eve.field).toBe("model");
		const before = eve.modelId;
		const cycled = press(eve, "\x1b[C", home, project);
		expect(cycled.modelId).not.toBe(before);
		const saved = reduceAgentsConfigureKey(cycled, "\r", home, project);
		expect(saved.kind).toBe("saved");
		if (saved.kind === "saved") {
			expect(saved.settings.modelId).toMatch(/\w+\/.+/);
			expect(saved.settings.model.length).toBeGreaterThan(0);
		}
	});

	it("Codex harness configure uses Codex models — never ollama", () => {
		const home = tmp();
		let state = openHarnessConfigure(home, "codex", "Codex");
		expect(state.modelOffers.length).toBeGreaterThan(0);
		expect(state.modelOffers.every((row) => row.provider !== "ollama")).toBe(
			true,
		);
		expect(
			state.modelOffers.some((row) => row.runtimeId === "gpt-5.6-sol"),
		).toBe(true);
		expect(formatAgentsConfigureLines(state).join("\n")).toMatch(
			/Codex models/,
		);
		const first = must(
			state.modelOffers[state.modelCursor],
			"state.modelOffers[state.modelCursor]",
		).id;
		state = press(state, "\x1b[C", home);
		expect(state.modelId).not.toBe(first);
		expect(state.via).toBe("codex");
	});

	it("every configurable harness opens with selectable models", () => {
		const home = tmp();
		for (const id of listConfigurableHarnessIds()) {
			if (id === "pi") continue; // Pi uses Bo catalog — tested separately
			const state = openHarnessConfigure(home, id, id, { live: false });
			expect(state.modelOffers.length, id).toBeGreaterThan(0);
			expect(
				state.modelOffers.every((row) => row.harnessId === id),
				id,
			).toBe(true);
		}
	});

	it("Pi configure uses the Bo model catalog", () => {
		const home = tmp();
		const state = openHarnessConfigure(home, "pi", "Pi", {
			ollama: { host: "http://127.0.0.1:11434", models: ["qwen2.5-coder:7b"] },
			env: {},
		});
		expect(state.modelOffers.some((row) => row.source === "ollama")).toBe(true);
		expect(
			state.modelOffers.some((row) =>
				row.runtimeId.includes("qwen2.5-coder:7b"),
			),
		).toBe(true);
	});

	it("Codex configure includes OpenAI-compatible endpoint and saves apiEndpoint", () => {
		const home = tmp();
		let state = openHarnessConfigure(home, "codex", "Codex", {
			env: {
				OPENAI_BASE_URL: "http://127.0.0.1:8080/v1",
				HOBO_CODE_MODEL: "local-coder",
			},
		});
		const idx = state.modelOffers.findIndex(
			(row) => row.baseUrl === "http://127.0.0.1:8080/v1",
		);
		expect(idx).toBeGreaterThanOrEqual(0);
		const offer = must(state.modelOffers[idx], "state.modelOffers[idx]");
		state = {
			...state,
			model: offer.runtimeId,
			modelId: offer.id,
			via: offer.via ?? "",
			apiEndpoint: offer.baseUrl ?? "",
			modelCursor: idx,
			dirty: true,
		};
		const saved = reduceAgentsConfigureKey(state, "\r", home);
		expect(saved.kind).toBe("saved");
		if (saved.kind === "saved") {
			expect(saved.settings.apiEndpoint).toBe("http://127.0.0.1:8080/v1");
			expect(saved.settings.model).toBe("local-coder");
			expect(saved.settings.modelId).toBe("openai/local-coder");
		}
	});

	it("saved harness model appears in Bo catalog with via=harness provenance", () => {
		const home = tmp();
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "codex",
			model: "gpt-5.6-sol",
			effort: "medium",
		});
		const state = openHoboBoConfigure(home, [], {
			env: {},
			ollama: { host: "http://127.0.0.1:11434", models: [] },
		});
		expect(
			state.modelOffers.some(
				(row) => row.id === "openai/gpt-5.6-sol" && row.via === "codex",
			),
		).toBe(true);
	});
});
