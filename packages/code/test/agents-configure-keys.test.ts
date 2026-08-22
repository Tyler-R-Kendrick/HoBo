/**
 * The `/agents` configure form: which key does what, and what the form says.
 *
 * `agents-configure.test.ts` opens the form against a real station. This drives
 * the reducer and the renderer as what they are — pure functions over a state
 * value — so every arm of the key table can be reached without a filesystem.
 *
 * The behaviour worth protecting:
 *
 * **Typing a model clears the selection that came from the catalogue.** A
 * picked offer carries an id, a `via`, and an endpoint. Once someone edits the
 * model string by hand those three describe a different model, and keeping
 * them would save a hand-typed name against a catalogue entry's routing.
 *
 * **The subagent list owns Up and Down only while it can use them.** Down at
 * the bottom of the list stays put rather than wrapping to the top; Up at the
 * top leaves the list and moves to the previous field. A cursor that wraps
 * silently is how someone ends up creating a subagent they meant to open.
 *
 * **`create-id` is a modal field.** It swallows Esc to cancel back to the
 * list rather than closing the form, and it filters input down to what a
 * subagent id may contain rather than accepting a name that cannot be saved.
 *
 * **Esc without a parent closes; with one it returns.** HoBo Bo drills into a
 * subagent, and the drill-in keeps the parent form so Esc is a step back
 * rather than an exit.
 *
 * Pure: no station, no disk. The two paths that do write (`Enter` to save and
 * `Enter` to create) are covered by the station-backed test alongside this one.
 */
import { describe, expect, it } from "vitest";

import type { ProjectEveAgent } from "../src/agents-catalog.js";
import {
	type AgentsConfigureState,
	type AgentsConfigureTarget,
	clampConfigureState,
	eveListCreateIndex,
	eveListRowCount,
	flattenEveAgents,
	formatAgentsConfigureLines,
	reduceAgentsConfigureKey,
} from "../src/agents-configure.js";
import {
	BO_MODEL_CATALOG_SCHEMA,
	type BoModelOffer,
} from "../src/bo-model-catalog.js";

const offer = (
	id: string,
	patch: Partial<BoModelOffer> = {},
): BoModelOffer => ({
	schema: BO_MODEL_CATALOG_SCHEMA,
	id,
	provider: id.split("/")[0] ?? "openai",
	model: id.split("/")[1] ?? id,
	label: id,
	runtimeId: id.split("/")[1] ?? id,
	source: "harness",
	...patch,
});

const agent = (
	id: string,
	patch: Partial<ProjectEveAgent> = {},
): ProjectEveAgent => ({
	id,
	path: `.agents/${id}.md`,
	source: "project",
	children: [],
	...patch,
});

const state = (
	patch: Partial<AgentsConfigureState> = {},
): AgentsConfigureState =>
	({
		target: { kind: "harness", harnessId: "codex", label: "Codex" },
		model: "gpt-5",
		modelId: "",
		via: "",
		apiEndpoint: "",
		effort: "medium",
		field: "model",
		eveCursor: 0,
		modelOffers: [],
		modelCursor: 0,
		dirty: false,
		createDraft: "",
		createError: "",
		...patch,
	}) as AgentsConfigureState;

const boTarget = (
	agents: readonly ProjectEveAgent[] = [],
): AgentsConfigureTarget => ({
	kind: "hobo-bo",
	label: "Hobo Bo",
	eveAgents: agents,
});

/** Drive a key and assert it produced a new form state rather than exiting. */
const press = (s: AgentsConfigureState, key: string): AgentsConfigureState => {
	const result = reduceAgentsConfigureKey(s, key, "/hobo", "/project");
	if (result.kind !== "state")
		throw new Error(`expected state, got ${result.kind}`);
	return result.state;
};

describe("the subagent tree", () => {
	it("flattens nested agents into one list", () => {
		const flat = flattenEveAgents([
			agent("parent", { children: [agent("child", { parentId: "parent" })] }),
		]);
		expect(flat.map((a) => a.id)).toEqual(["parent", "child"]);
	});

	it("keeps a parent ahead of its children", () => {
		// The list is a rendering of a tree; a child above its parent would be
		// a different tree.
		const flat = flattenEveAgents([
			agent("a", { children: [agent("a1", { parentId: "a" })] }),
			agent("b"),
		]);
		expect(flat.map((a) => a.id)).toEqual(["a", "a1", "b"]);
	});

	it("descends more than one level", () => {
		const flat = flattenEveAgents([
			agent("a", {
				children: [
					agent("a1", {
						parentId: "a",
						children: [agent("a1x", { parentId: "a1" })],
					}),
				],
			}),
		]);
		expect(flat).toHaveLength(3);
	});

	it("has a create row even with no agents", () => {
		// Always at least one selectable row: with nothing to open, the only
		// useful action is to make one.
		expect(eveListRowCount(boTarget())).toBe(1);
	});

	it("counts the agents plus the create row", () => {
		expect(eveListRowCount(boTarget([agent("a"), agent("b")]))).toBe(3);
	});

	it("has no rows at all on a harness form", () => {
		// A harness has no subagents; a list there would be an empty section.
		expect(eveListRowCount(state().target)).toBe(0);
	});

	it("puts the create row last", () => {
		expect(eveListCreateIndex(boTarget([agent("a")]))).toBe(1);
	});

	it("has no create row on a harness form", () => {
		expect(eveListCreateIndex(state().target)).toBe(-1);
	});
});

describe("clamping the cursors", () => {
	it("returns the same object when nothing moved", () => {
		// Identity matters: the form re-renders on state change, and a new
		// object for an unchanged state is a repaint nobody asked for.
		const s = state();
		expect(clampConfigureState(s)).toBe(s);
	});

	it("pulls a model cursor back inside the catalogue", () => {
		expect(
			clampConfigureState(
				state({ modelOffers: [offer("a/b")], modelCursor: 9 }),
			).modelCursor,
		).toBe(0);
	});

	it("pulls an eve cursor back inside the list", () => {
		expect(
			clampConfigureState(
				state({ target: boTarget([agent("a")]), eveCursor: 9 }),
			).eveCursor,
		).toBe(1);
	});

	it("floors a negative cursor at zero", () => {
		expect(clampConfigureState(state({ modelCursor: -4 })).modelCursor).toBe(0);
	});

	it("holds at zero with an empty catalogue", () => {
		expect(clampConfigureState(state({ modelCursor: 3 })).modelCursor).toBe(0);
	});
});

describe("leaving the form", () => {
	it("closes on escape", () => {
		expect(reduceAgentsConfigureKey(state(), "\x1b", "/hobo", "/p").kind).toBe(
			"back",
		);
	});

	it("closes on q", () => {
		expect(reduceAgentsConfigureKey(state(), "q", "/hobo", "/p").kind).toBe(
			"back",
		);
	});

	it("returns to the parent form when there is one", () => {
		// HoBo Bo drills into a subagent. Esc there is a step back, not an exit.
		const result = reduceAgentsConfigureKey(
			state({ parent: state({ target: boTarget() }) }),
			"\x1b",
			"/hobo",
			"/p",
		);
		if (result.kind !== "back") throw new Error("expected back");
		expect(result.toParent?.target.kind).toBe("hobo-bo");
	});

	it("names no parent when there is none", () => {
		const result = reduceAgentsConfigureKey(state(), "\x1b", "/hobo", "/p");
		if (result.kind !== "back") throw new Error("expected back");
		expect(result.toParent).toBeUndefined();
	});

	it("cancels the create field instead of closing", () => {
		// The modal swallows Esc. Closing the whole form on a cancelled name
		// would throw away the form someone was in the middle of.
		const next = press(
			state({ target: boTarget(), field: "create-id", createDraft: "wip" }),
			"\x1b",
		);
		expect(next.field).toBe("eve-list");
	});

	it("clears the draft it cancelled", () => {
		expect(
			press(
				state({ target: boTarget(), field: "create-id", createDraft: "wip" }),
				"\x1b",
			).createDraft,
		).toBe("");
	});

	it("puts the cursor back on the create row it came from", () => {
		expect(
			press(
				state({ target: boTarget([agent("a")]), field: "create-id" }),
				"\x1b",
			).eveCursor,
		).toBe(1);
	});

	it("clears a create error on cancel", () => {
		expect(
			press(
				state({
					target: boTarget(),
					field: "create-id",
					createError: "bad id",
				}),
				"\x1b",
			).createError,
		).toBe("");
	});
});

describe("moving between fields", () => {
	it("goes forward on tab", () => {
		expect(press(state(), "\t").field).toBe("effort");
	});

	it("goes backward on shift-tab", () => {
		expect(press(state({ field: "effort" }), "\x1b[Z").field).toBe("model");
	});

	it("wraps forward past the last field", () => {
		expect(press(state({ field: "effort" }), "\t").field).toBe("model");
	});

	it("wraps backward past the first", () => {
		expect(press(state(), "\x1b[Z").field).toBe("effort");
	});

	it("includes the subagent list only on the bo form", () => {
		expect(
			press(state({ target: boTarget(), field: "effort" }), "\t").field,
		).toBe("eve-list");
	});

	it("skips the subagent list on a harness form", () => {
		// A harness has none, so a field that lists them would be a stop with
		// nothing in it.
		expect(press(state({ field: "effort" }), "\t").field).toBe("model");
	});

	it("does not move fields while a name is being typed", () => {
		// `create-id` is checked before the key table, so it swallows Tab. The
		// only ways out are Enter and Esc, which is what makes it modal.
		//
		// FINDING, pinned rather than changed: `nextField` maps `create-id` to
		// `eve-list` before looking up the field order, but nothing can reach
		// it with that field -- every caller is downstream of the `create-id`
		// early return. It is a guard for a state that cannot arrive.
		expect(
			press(state({ target: boTarget(), field: "create-id" }), "\t").field,
		).toBe("create-id");
	});

	it("keeps a half-typed draft when Tab is pressed", () => {
		expect(
			press(
				state({
					target: boTarget(),
					field: "create-id",
					createDraft: "half",
				}),
				"\t",
			).createDraft,
		).toBe("half");
	});

	it("clears a half-typed draft when the field really does change", () => {
		// Leaving the list by any route drops the draft: a name typed for a
		// subagent nobody is creating any more is not state worth keeping.
		expect(
			press(
				state({
					target: boTarget(),
					field: "eve-list",
					eveCursor: 0,
					createDraft: "half",
				}),
				"\x1b[A",
			).createDraft,
		).toBe("");
	});

	it("moves fields on down outside the list", () => {
		expect(press(state(), "\x1b[B").field).toBe("effort");
	});

	it("moves fields on j outside the list", () => {
		expect(press(state(), "j").field).toBe("effort");
	});

	it("moves fields on up outside the list", () => {
		expect(press(state({ field: "effort" }), "\x1b[A").field).toBe("model");
	});

	it("moves fields on k outside the list", () => {
		expect(press(state({ field: "effort" }), "k").field).toBe("model");
	});
});

describe("moving inside the subagent list", () => {
	const listed = (cursor: number) =>
		state({
			target: boTarget([agent("a"), agent("b")]),
			field: "eve-list",
			eveCursor: cursor,
		});

	it("moves down through the rows", () => {
		expect(press(listed(0), "\x1b[B").eveCursor).toBe(1);
	});

	it("stops at the create row rather than wrapping", () => {
		// Wrapping here is how someone ends up creating a subagent they meant
		// to open.
		expect(press(listed(2), "\x1b[B").eveCursor).toBe(2);
	});

	it("stays in the list when it stops", () => {
		expect(press(listed(2), "\x1b[B").field).toBe("eve-list");
	});

	it("moves up through the rows", () => {
		expect(press(listed(2), "\x1b[A").eveCursor).toBe(1);
	});

	it("leaves the list upward from the top row", () => {
		// The list is the last field; up from its first row is how someone
		// gets back to effort without cycling all the way round.
		expect(press(listed(0), "\x1b[A").field).toBe("effort");
	});

	it("takes j and k as down and up in the list too", () => {
		expect(press(listed(0), "j").eveCursor).toBe(1);
		expect(press(listed(1), "k").eveCursor).toBe(0);
	});
});

describe("picking a model", () => {
	const picking = (patch: Partial<AgentsConfigureState> = {}) =>
		state({
			modelOffers: [
				offer("openai/gpt-5", { via: "codex", baseUrl: "https://a" }),
				offer("ollama/qwen", { host: "http://localhost:11434" }),
			],
			...patch,
		});

	it("moves forward through the catalogue", () => {
		expect(press(picking(), "\x1b[C").modelCursor).toBe(1);
	});

	it("takes l as forward", () => {
		expect(press(picking(), "l").modelCursor).toBe(1);
	});

	it("moves back through the catalogue", () => {
		expect(press(picking({ modelCursor: 1 }), "\x1b[D").modelCursor).toBe(0);
	});

	it("takes h as back", () => {
		expect(press(picking({ modelCursor: 1 }), "h").modelCursor).toBe(0);
	});

	it("writes the runtime id into the model field", () => {
		// The catalogue id is `provider/model`; what a harness is actually
		// launched with is the runtime id.
		expect(press(picking(), "\x1b[C").model).toBe("qwen");
	});

	it("records the catalogue identity alongside it", () => {
		expect(press(picking({ modelCursor: 1 }), "\x1b[C").modelId).toBe(
			"openai/gpt-5",
		);
	});

	it("records the route the model is reached by", () => {
		expect(press(picking({ modelCursor: 1 }), "\x1b[C").via).toBe("codex");
	});

	it("records the endpoint when the offer has one", () => {
		expect(press(picking({ modelCursor: 1 }), "\x1b[C").apiEndpoint).toBe(
			"https://a",
		);
	});

	it("clears the endpoint for an offer without one", () => {
		// Carrying the previous offer's base URL forward would point a new
		// model at the old provider.
		expect(
			press(picking({ apiEndpoint: "https://a" }), "\x1b[C").apiEndpoint,
		).toBe("");
	});

	it("marks the form dirty", () => {
		expect(press(picking(), "\x1b[C").dirty).toBe(true);
	});

	it("does nothing with an empty catalogue", () => {
		const s = state({ modelOffers: [] });
		expect(press(s, "\x1b[C")).toBe(s);
	});

	it("leaves the model field alone when the cursor is on effort", () => {
		expect(press(picking({ field: "effort" }), "\x1b[C").model).toBe("gpt-5");
	});
});

describe("picking an effort", () => {
	it("cycles forward", () => {
		expect(press(state({ field: "effort" }), "\x1b[C").effort).not.toBe(
			"medium",
		);
	});

	it("cycles back", () => {
		expect(press(state({ field: "effort" }), "\x1b[D").effort).not.toBe(
			"medium",
		);
	});

	it("goes opposite ways for the two directions", () => {
		expect(press(state({ field: "effort" }), "l").effort).not.toBe(
			press(state({ field: "effort" }), "h").effort,
		);
	});

	it("marks the form dirty", () => {
		expect(press(state({ field: "effort" }), "\x1b[C").dirty).toBe(true);
	});

	it("does nothing on the subagent list", () => {
		const s = state({ target: boTarget(), field: "eve-list" });
		expect(press(s, "\x1b[C").effort).toBe("medium");
	});
});

describe("typing a model by hand", () => {
	it("appends the character", () => {
		expect(press(state({ model: "gpt-" }), "5").model).toBe("gpt-5");
	});

	it("deletes on backspace", () => {
		expect(press(state({ model: "gpt-5" }), "\x7f").model).toBe("gpt-");
	});

	it("takes the other backspace too", () => {
		expect(press(state({ model: "gpt-5" }), "\b").model).toBe("gpt-");
	});

	it("deletes from an empty model without failing", () => {
		expect(press(state({ model: "" }), "\x7f").model).toBe("");
	});

	it("clears the catalogue identity when typing", () => {
		// The three routing fields describe the picked offer. Once the name is
		// hand-edited they describe a different model, and keeping them would
		// save a typed name against a catalogue entry's routing.
		const next = press(
			state({
				modelId: "openai/gpt-5",
				via: "codex",
				apiEndpoint: "https://a",
			}),
			"x",
		);
		expect([next.modelId, next.via, next.apiEndpoint]).toEqual(["", "", ""]);
	});

	it("clears the catalogue identity on backspace too", () => {
		expect(press(state({ modelId: "openai/gpt-5" }), "\x7f").modelId).toBe("");
	});

	it("marks the form dirty", () => {
		expect(press(state(), "x").dirty).toBe(true);
	});

	it("accepts a space", () => {
		expect(press(state({ model: "a" }), " ").model).toBe("a ");
	});

	it("ignores an escape sequence rather than typing it", () => {
		// A multi-character key is a key, not text. Appending it would put
		// `[1;5A` in a model name.
		expect(press(state(), "\x1b[1;5A").model).toBe("gpt-5");
	});

	it("ignores an unhandled control character", () => {
		expect(press(state(), "\x01").model).toBe("gpt-5");
	});

	it("does not type into the effort field", () => {
		expect(press(state({ field: "effort" }), "x").model).toBe("gpt-5");
	});

	it("returns the same state for a key it does not handle", () => {
		const s = state({ field: "effort" });
		expect(press(s, "\x01")).toBe(s);
	});
});

describe("the create field", () => {
	const creating = (patch: Partial<AgentsConfigureState> = {}) =>
		state({ target: boTarget(), field: "create-id", ...patch });

	it("takes a letter into the draft", () => {
		expect(press(creating(), "a").createDraft).toBe("a");
	});

	it("takes a digit and a dash", () => {
		expect(press(press(creating(), "1"), "-").createDraft).toBe("1-");
	});

	it("lowercases what it takes", () => {
		// Ids are lowercase on disk; accepting an uppercase one would create a
		// name that does not match the file it becomes.
		expect(press(creating(), "A").createDraft).toBe("a");
	});

	it("refuses a character an id may not contain", () => {
		expect(press(creating(), "/").createDraft).toBe("");
	});

	it("refuses a space", () => {
		expect(press(creating(), " ").createDraft).toBe("");
	});

	it("returns the same state for a refused character", () => {
		const s = creating();
		expect(press(s, "/")).toBe(s);
	});

	it("deletes on backspace", () => {
		expect(press(creating({ createDraft: "abc" }), "\x7f").createDraft).toBe(
			"ab",
		);
	});

	it("deletes from an empty draft without failing", () => {
		expect(press(creating(), "\b").createDraft).toBe("");
	});

	it("caps the draft length", () => {
		// A filename, ultimately. An unbounded one is a path that some
		// filesystem will refuse at write time rather than at type time.
		let s = creating();
		for (let i = 0; i < 80; i += 1) s = press(s, "a");
		expect(s.createDraft).toHaveLength(63);
	});

	it("clears a previous error as soon as someone types", () => {
		// The error described the name that was rejected. Leaving it up while
		// a new one is typed makes it look like the new one is bad too.
		expect(
			press(creating({ createDraft: "a", createError: "taken" }), "b")
				.createError,
		).toBe("");
	});

	it("clears the error on backspace as well", () => {
		expect(
			press(creating({ createDraft: "a", createError: "taken" }), "\x7f")
				.createError,
		).toBe("");
	});
});

describe("enter on the subagent list", () => {
	it("opens the agent under the cursor", () => {
		const result = reduceAgentsConfigureKey(
			state({
				target: boTarget([agent("alpha"), agent("beta")]),
				field: "eve-list",
				eveCursor: 1,
			}),
			"\r",
			"/hobo",
			"/p",
		);
		if (result.kind !== "open-eve") throw new Error("expected open-eve");
		expect(result.agent.id).toBe("beta");
	});

	it("enters the create field on the create row", () => {
		expect(
			press(
				state({
					target: boTarget([agent("alpha")]),
					field: "eve-list",
					eveCursor: 1,
				}),
				"\r",
			).field,
		).toBe("create-id");
	});

	it("starts the create field with an empty draft", () => {
		expect(
			press(
				state({ target: boTarget(), field: "eve-list", eveCursor: 0 }),
				"\r",
			).createDraft,
		).toBe("");
	});

	it("takes newline as enter too", () => {
		expect(
			press(state({ target: boTarget(), field: "eve-list" }), "\n").field,
		).toBe("create-id");
	});
});

describe("what the form says", () => {
	const lines = (s: AgentsConfigureState) =>
		formatAgentsConfigureLines(s).join("\n");

	it("titles a harness form with its label", () => {
		expect(lines(state())).toContain("Configure · Codex");
	});

	it("titles the bo form", () => {
		expect(lines(state({ target: boTarget() }))).toContain(
			"Configure · Hobo Bo",
		);
	});

	it("titles a subagent form with its id", () => {
		expect(
			lines(
				state({
					target: { kind: "eve", id: "alpha", label: "alpha", path: "p" },
				}),
			),
		).toContain("Configure · alpha");
	});

	it("marks the field the cursor is on", () => {
		expect(lines(state())).toContain("▸ model");
	});

	it("marks effort when the cursor is there", () => {
		expect(lines(state({ field: "effort" }))).toContain("▸ effort");
	});

	it("says (unset) rather than leaving the model blank", () => {
		// A blank value next to a label reads as a rendering failure.
		expect(lines(state({ model: "" }))).toContain("(unset)");
	});

	it("shows the selected catalogue id under the model", () => {
		expect(lines(state({ modelId: "openai/gpt-5" }))).toContain("openai/gpt-5");
	});

	it("shows the route alongside a selected id", () => {
		expect(lines(state({ modelId: "openai/gpt-5", via: "codex" }))).toContain(
			"via=codex",
		);
	});

	it("previews the offer under the cursor when nothing is selected", () => {
		// Before a pick, the line answers "what would ←→ give me".
		expect(
			lines(state({ modelOffers: [offer("openai/gpt-5", { via: "codex" })] })),
		).toContain("openai/gpt-5");
	});

	it("does not preview an offer while the cursor is elsewhere", () => {
		expect(
			lines(
				state({
					field: "effort",
					modelOffers: [offer("openai/gpt-5")],
				}),
			),
		).not.toContain("openai/gpt-5");
	});

	it("shows a saved endpoint", () => {
		expect(lines(state({ apiEndpoint: "https://a" }))).toContain(
			"api_endpoint https://a",
		);
	});

	it("falls back to the offer's endpoint", () => {
		expect(
			lines(state({ modelOffers: [offer("a/b", { baseUrl: "https://o" })] })),
		).toContain("https://o");
	});

	it("omits the endpoint line when there is none", () => {
		expect(lines(state())).not.toContain("api_endpoint");
	});

	it("shows where in the catalogue the cursor is", () => {
		expect(
			lines(state({ modelOffers: [offer("a/b"), offer("c/d")] })),
		).toContain("1/2");
	});

	it("names the scope of the catalogue on a harness", () => {
		expect(lines(state({ modelOffers: [offer("a/b")] }))).toContain(
			"Codex models",
		);
	});

	it("names the bo catalogue as Bo", () => {
		expect(
			lines(state({ target: boTarget(), modelOffers: [offer("a/b")] })),
		).toContain("Bo models");
	});

	it("names a subagent catalogue as subagent", () => {
		expect(
			lines(
				state({
					target: { kind: "eve", id: "a", label: "a", path: "p" },
					modelOffers: [offer("a/b")],
				}),
			),
		).toContain("subagent models");
	});

	it("omits the catalogue line with no offers", () => {
		// The footer's own `←→ effort` still mentions the keys, so the check is
		// for the counted line rather than for the arrows.
		expect(lines(state())).not.toContain("models");
	});

	it("shows a subagent's file path", () => {
		// Where to go to edit the thing the form cannot.
		expect(
			lines(
				state({
					target: { kind: "eve", id: "a", label: "a", path: ".agents/a.md" },
				}),
			),
		).toContain(".agents/a.md");
	});

	it("lists the subagents on the bo form", () => {
		expect(lines(state({ target: boTarget([agent("alpha")]) }))).toContain(
			"alpha",
		);
	});

	it("says so when there are none yet", () => {
		expect(lines(state({ target: boTarget() }))).toContain("none yet");
	});

	it("marks the row under the list cursor", () => {
		const rendered = formatAgentsConfigureLines(
			state({
				target: boTarget([agent("alpha"), agent("beta")]),
				field: "eve-list",
				eveCursor: 1,
			}),
		);
		expect(rendered.some((l) => l.startsWith("▸ ") && l.includes("beta"))).toBe(
			true,
		);
	});

	it("does not mark rows while the cursor is on another field", () => {
		const rendered = formatAgentsConfigureLines(
			state({ target: boTarget([agent("alpha")]), field: "model" }),
		);
		expect(
			rendered.some((l) => l.startsWith("▸ ") && l.includes("alpha")),
		).toBe(false);
	});

	it("indents a child under its parent", () => {
		// The list is flat but the tree is not; the indent is what carries the
		// relationship into a flat rendering.
		const rendered = formatAgentsConfigureLines(
			state({
				target: boTarget([
					agent("parent", {
						children: [agent("child", { parentId: "parent" })],
					}),
				]),
			}),
		);
		expect(rendered.some((l) => l.includes("   child"))).toBe(true);
	});

	it("marks the create row when the cursor is on it", () => {
		expect(
			lines(
				state({
					target: boTarget([agent("a")]),
					field: "eve-list",
					eveCursor: 1,
				}),
			),
		).toContain("▸ + create");
	});

	it("marks the create row while typing a name", () => {
		expect(lines(state({ target: boTarget(), field: "create-id" }))).toContain(
			"▸ + create",
		);
	});

	it("shows the draft as it is typed", () => {
		expect(
			lines(
				state({
					target: boTarget(),
					field: "create-id",
					createDraft: "helper",
				}),
			),
		).toContain("helper");
	});

	it("prompts for an id before anything is typed", () => {
		expect(lines(state({ target: boTarget(), field: "create-id" }))).toContain(
			"(type id)",
		);
	});

	it("shows a create error under the draft", () => {
		expect(
			lines(
				state({
					target: boTarget(),
					field: "create-id",
					createDraft: "a",
					createError: "already exists",
				}),
			),
		).toContain("already exists");
	});

	it("omits the error line when there is none", () => {
		expect(
			lines(state({ target: boTarget(), field: "create-id" })),
		).not.toContain("  ! ");
	});

	it("says where the bo catalogue comes from", () => {
		expect(lines(state({ target: boTarget() }))).toContain("Bo catalog");
	});

	it("offers create keys while typing a name", () => {
		expect(lines(state({ target: boTarget(), field: "create-id" }))).toContain(
			"Esc cancel",
		);
	});

	it("offers picker keys on the model field with a catalogue", () => {
		expect(lines(state({ modelOffers: [offer("a/b")] }))).toContain(
			"pick model",
		);
	});

	it("offers the general keys otherwise", () => {
		expect(lines(state({ field: "effort" }))).toContain("Enter save/open");
	});

	it("clamps before it renders", () => {
		// The renderer is given whatever state the form holds; an out-of-range
		// cursor must not index past the catalogue and print undefined.
		expect(
			lines(state({ modelOffers: [offer("a/b")], modelCursor: 9 })),
		).toContain("1/1");
	});
});
