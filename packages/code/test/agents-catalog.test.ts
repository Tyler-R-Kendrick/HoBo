/**
 * The `/agents` catalog tree and its key reducer.
 *
 * `reduceAgentsCatalogKey` is a pure function from (state, key, viewport) to a
 * new state, which makes a TUI's navigation testable without a terminal. That
 * matters here because the reducer carries real interaction decisions, not just
 * cursor arithmetic:
 *
 *   - expanding a node lands the cursor on its first child, so a user who
 *     expands does not then have to hunt for what appeared;
 *   - collapsing a leaf walks *up* to its parent rather than doing nothing,
 *     which is what makes left-arrow feel like "back";
 *   - the cursor clamps at both ends instead of wrapping, because wrapping in a
 *     tree loses your place.
 *
 * Each of those is pinned separately, since each is a choice someone could
 * plausibly "simplify" away.
 */
import { describe, expect, it } from "vitest";
import type { HarnessSpec } from "../src/agent-harness-adapters.js";
import {
	type AgentsCatalogState,
	buildAgentsCatalog,
	flattenVisible,
	isValidEveAgentId,
	type ProjectEveAgent,
	reduceAgentsCatalogKey,
} from "../src/agents-catalog.js";

function spec(id: string, label = id): HarnessSpec {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return { id, label, kind: "cli", command: id } as HarnessSpec;
}

function eve(
	id: string,
	children: readonly ProjectEveAgent[] = [],
): ProjectEveAgent {
	return {
		id,
		path: `/proj/.hobo/agents/${id}/instructions.md`,
		source: "hobo-agents",
		children: children.map((child) => ({ ...child, parentId: id })),
	};
}

/** Hobo Bo with two Eve agents, the second of which has a subagent. */
function catalog(): AgentsCatalogState {
	return buildAgentsCatalog(
		[spec("hobo-code", "Hobo Bo"), spec("other", "Other")],
		[eve("alpha"), eve("beta", [eve("beta-child")])],
	);
}

const ids = (state: AgentsCatalogState) =>
	flattenVisible(state).map((row) => row.id);

describe("isValidEveAgentId", () => {
	it.each(["a", "agent", "a-b-c", "a1", "abc-123"])("accepts %s", (id) => {
		expect(isValidEveAgentId(id)).toBe(true);
	});

	it.each([
		["", "empty"],
		["1abc", "leading digit"],
		["-abc", "leading dash"],
		["Abc", "uppercase"],
		["a_b", "underscore"],
		["a b", "space"],
		["a/b", "slash"],
	])("rejects %s (%s)", (id) => {
		expect(isValidEveAgentId(id)).toBe(false);
	});

	it("accepts exactly 63 characters and rejects 64", () => {
		expect(isValidEveAgentId(`a${"b".repeat(62)}`)).toBe(true);
		expect(isValidEveAgentId(`a${"b".repeat(63)}`)).toBe(false);
	});
});

describe("buildAgentsCatalog", () => {
	it("starts collapsed at the top", () => {
		const state = catalog();
		expect(state.cursor).toBe(0);
		expect(state.scroll).toBe(0);
		expect(state.expanded.size).toBe(0);
	});

	it("shows only harnesses before anything is expanded", () => {
		expect(ids(catalog())).toEqual(["harness:hobo-code", "harness:other"]);
	});

	it("gives the Eve agents to Hobo Bo and not to an unrelated harness", () => {
		const state = catalog();
		const hobo = state.roots.find((r) => r.harnessId === "hobo-code");
		const other = state.roots.find((r) => r.harnessId === "other");
		expect(hobo?.children.length).toBe(2);
		expect(other?.children).toEqual([]);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("labels the hobo-code harness as Hobo Bo", () => {
		expect(
			buildAgentsCatalog([spec("hobo-code", "raw")], []).roots[0]?.label,
		).toBe("Hobo Bo");
	});

	it("always synthesizes a Hobo Bo row, even from no harnesses at all", () => {
		// The catalog is never empty: `sortHarnesses` falls back to a synthetic
		// hobo-code spec, so `/agents` always has something to select rather than
		// presenting a blank pane a user cannot act on.
		expect(ids(buildAgentsCatalog([], []))).toEqual(["harness:hobo-code"]);
	});
});

describe("closing the catalog", () => {
	it.each(["\x1b", "q"])("closes on %s", (key) => {
		expect(reduceAgentsCatalogKey(catalog(), key, 10).close).toBe(true);
	});

	it("closes and asks for the slash menu on /", () => {
		const result = reduceAgentsCatalogKey(catalog(), "/", 10);
		expect(result.close).toBe(true);
		expect(result.openSlash).toBe(true);
	});

	it("does not open the slash menu on an ordinary close", () => {
		expect(
			reduceAgentsCatalogKey(catalog(), "q", 10).openSlash,
		).toBeUndefined();
	});
});

describe("expanding", () => {
	it.each([" ", "\x1b[C", "l"])("expands on %s", (key) => {
		const next = reduceAgentsCatalogKey(catalog(), key, 10).state;
		expect(ids(next)).toContain("eve:hobo:alpha");
	});

	it("lands the cursor on the first child, so nothing has to be hunted for", () => {
		const next = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		expect(next.cursor).toBe(1);
		expect(flattenVisible(next)[next.cursor]?.id).toBe("eve:hobo:alpha");
	});

	it("collapses again on a second press, without moving the cursor onward", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		const onRoot = { ...opened, cursor: 0 };
		const closed = reduceAgentsCatalogKey(onRoot, " ", 10).state;
		expect(ids(closed)).toEqual(["harness:hobo-code", "harness:other"]);
	});

	it("does nothing on a row with no children", () => {
		const state = { ...catalog(), cursor: 1 }; // harness:other, no children
		const next = reduceAgentsCatalogKey(state, " ", 10).state;
		expect(next).toBe(state);
	});

	it("does nothing when the row under the cursor has no children", () => {
		const state = buildAgentsCatalog([], []);
		expect(reduceAgentsCatalogKey(state, " ", 10).state).toBe(state);
	});
});

describe("collapsing and going up", () => {
	it.each(["\x1b[D", "h"])("collapses an expanded node on %s", (key) => {
		const opened = {
			...reduceAgentsCatalogKey(catalog(), " ", 10).state,
			cursor: 0,
		};
		expect(ids(reduceAgentsCatalogKey(opened, key, 10).state)).toEqual([
			"harness:hobo-code",
			"harness:other",
		]);
	});

	it("moves to the parent from a leaf, which is what makes left mean back", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state; // cursor on alpha
		const next = reduceAgentsCatalogKey(opened, "h", 10).state;
		expect(flattenVisible(next)[next.cursor]?.id).toBe("harness:hobo-code");
	});

	it("does nothing at the top level with nothing expanded", () => {
		const state = catalog();
		expect(reduceAgentsCatalogKey(state, "h", 10).state).toBe(state);
	});
});

describe("moving the cursor", () => {
	it.each(["\x1b[B", "j"])("moves down on %s", (key) => {
		expect(reduceAgentsCatalogKey(catalog(), key, 10).state.cursor).toBe(1);
	});

	it.each(["\x1b[A", "k"])("moves up on %s", (key) => {
		const state = { ...catalog(), cursor: 1 };
		expect(reduceAgentsCatalogKey(state, key, 10).state.cursor).toBe(0);
	});

	it("clamps at the bottom rather than wrapping", () => {
		// Wrapping in a tree loses your place.
		const state = { ...catalog(), cursor: 1 };
		expect(reduceAgentsCatalogKey(state, "j", 10).state.cursor).toBe(1);
	});

	it("clamps at the top rather than wrapping", () => {
		expect(reduceAgentsCatalogKey(catalog(), "k", 10).state.cursor).toBe(0);
	});

	it("clamps on a single-row catalog", () => {
		const single = buildAgentsCatalog([], []);
		expect(reduceAgentsCatalogKey(single, "j", 10).state.cursor).toBe(0);
	});

	it("pages down by a viewport and clamps", () => {
		const next = reduceAgentsCatalogKey(catalog(), "\x1b[6~", 1).state;
		expect(next.cursor).toBe(1);
	});

	it("pages up and clamps at zero rather than going negative", () => {
		const state = { ...catalog(), cursor: 1 };
		expect(reduceAgentsCatalogKey(state, "\x1b[5~", 5).state.cursor).toBe(0);
	});

	it("scrolls the viewport to keep the cursor visible", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 1).state;
		expect(opened.scroll).toBe(opened.cursor);
	});
});

describe("selecting", () => {
	it.each(["\r", "\n"])("picks the row under the cursor on %s", (key) => {
		const pick = reduceAgentsCatalogKey(catalog(), key, 10).pick;
		expect(pick).toEqual({ kind: "configure-hobo-bo", label: "Hobo Bo" });
	});

	it("picks a plain harness by id", () => {
		const state = { ...catalog(), cursor: 1 };
		expect(reduceAgentsCatalogKey(state, "\r", 10).pick).toMatchObject({
			kind: "configure-harness",
			harnessId: "other",
		});
	});

	it("picks an Eve agent by its path", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		expect(reduceAgentsCatalogKey(opened, "\r", 10).pick).toMatchObject({
			kind: "configure-eve",
			path: "/proj/.hobo/agents/alpha/instructions.md",
		});
	});

	it("keeps the catalog open after a pick, so Esc returns here", () => {
		expect(reduceAgentsCatalogKey(catalog(), "\r", 10).close).toBeUndefined();
	});

	it("picks the synthesized Hobo Bo row even with no harnesses registered", () => {
		// There is no "no row" case to test: the catalog always carries a Hobo Bo
		// row, so Enter always has something to select.
		const empty = buildAgentsCatalog([], []);
		expect(reduceAgentsCatalogKey(empty, "\r", 10).pick).toEqual({
			kind: "configure-hobo-bo",
			label: "Hobo Bo",
		});
	});
});

describe("unhandled keys", () => {
	it.each(["x", "\x1b[Z", "1"])("leaves the state untouched for %s", (key) => {
		const state = catalog();
		const result = reduceAgentsCatalogKey(state, key, 10);
		expect(result.state).toBe(state);
		expect(result.close).toBeUndefined();
		expect(result.pick).toBeUndefined();
	});
});

describe("flattenVisible", () => {
	it("reports depth so a renderer can indent", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		const rows = flattenVisible(opened);
		expect(rows.find((r) => r.id === "harness:hobo-code")?.depth).toBe(0);
		expect(rows.find((r) => r.id === "eve:hobo:alpha")?.depth).toBe(1);
	});

	it("marks a node with children expandable and a leaf not", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		const rows = flattenVisible(opened);
		expect(rows.find((r) => r.id === "eve:hobo:beta")?.expandable).toBe(true);
		expect(rows.find((r) => r.id === "eve:hobo:alpha")?.expandable).toBe(false);
	});

	it("hides grandchildren until their parent is expanded too", () => {
		const opened = reduceAgentsCatalogKey(catalog(), " ", 10).state;
		expect(ids(opened)).not.toContain("eve:hobo:beta:beta-child");
	});

	it("is a pure function of the state", () => {
		const state = catalog();
		expect(flattenVisible(state)).toEqual(flattenVisible(state));
	});
});
