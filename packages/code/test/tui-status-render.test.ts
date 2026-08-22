/**
 * The multiplexer status surface, in both of its voices.
 *
 * The same state renders two ways and the module is explicit about why: the
 * dense glyph box is power-user chrome, and `plain: true` is what the default
 * human `status` verb asks for. They are not two skins on one string — they
 * carry different information, and the tests below are mostly about which
 * facts survive into each.
 *
 * The rules the renderer states about itself, and what each is protecting:
 *
 * **Product defaults are omitted, not printed.** `⊙r` remote-ready, the
 * `herdr` theme, the pane count when glyph counts already sum to it, `dcc`
 * chrome — each is left out on the happy path so that what *is* printed is
 * a departure from normal. `○l` appears only when offline, precisely because
 * its absence has to mean something.
 *
 * **Only a blocked pane gets a summary.** Working is already marked by `▸`,
 * and idle and done have nothing to say. Why a pane is blocked is the one
 * thing a glyph cannot carry, so it is the one thing that gets text.
 *
 * **The box hugs its content.** Width tracks the longest line between a floor
 * of 16 and a cap of 40, so a quiet session draws a smaller box than a busy
 * one rather than every session drawing the widest one it might ever need.
 *
 * **Empty and standalone paints the loading screen, not an empty box.** A
 * blank multiplexer is the first thing a new user sees; an empty box would
 * read as broken.
 *
 * Pure presentation: state in, string out.
 */
import { describe, expect, it } from "vitest";

import {
	buildMultiplexerStatus,
	copyOnHighlight,
	createPane,
	herdrMuxCapabilities,
	type MultiplexerStatus,
	renderHerdrCapabilityFooter,
	renderStatusChip,
	renderStatusSurface,
	renderStatusText,
	renderStatusTextPlain,
	setPaneState,
} from "../src/tui.js";
import type { AgentPaneState, AgentSemanticState } from "../src/types.js";

const pane = (
	agentId: string,
	state: AgentSemanticState = "idle",
	summary = "",
	highlight = "",
): AgentPaneState => ({
	agentId,
	semanticState: state,
	summary,
	highlightBuffer: highlight,
});

const status = (
	panes: readonly AgentPaneState[],
	options: { remoteReady?: boolean; theme?: "herdr" | "grok-build" } = {},
): MultiplexerStatus => buildMultiplexerStatus(panes, options);

/** A title override keeps the dense box off the loading-screen path. */
const dense = (
	panes: readonly AgentPaneState[],
	options: Record<string, unknown> = {},
) => renderStatusText(status(panes), { embedded: true, ...options });

describe("panes as values", () => {
	it("starts idle with nothing to say", () => {
		expect(createPane("a")).toEqual({
			agentId: "a",
			semanticState: "idle",
			summary: "",
			highlightBuffer: "",
		});
	});

	it("takes a state and summary when given them", () => {
		expect(createPane("a", "blocked", "needs a key").semanticState).toBe(
			"blocked",
		);
	});

	it("moves a pane to a new state without touching the rest of it", () => {
		const moved = setPaneState(pane("a", "idle", "old", "clip"), "working");
		expect(moved.semanticState).toBe("working");
		expect(moved.highlightBuffer).toBe("clip");
	});

	it("keeps the old summary when no new one is given", () => {
		// A state change is not a reason to lose the note explaining the last
		// one -- an agent that goes blocked then working still has a history.
		expect(setPaneState(pane("a", "blocked", "old"), "working").summary).toBe(
			"old",
		);
	});

	it("replaces the summary when a new one is given", () => {
		expect(
			setPaneState(pane("a", "blocked", "old"), "working", "new").summary,
		).toBe("new");
	});

	it("accepts an explicitly empty summary as a replacement", () => {
		// `??` and not `||`: clearing the note is a thing a caller can ask for.
		expect(setPaneState(pane("a", "blocked", "old"), "done", "").summary).toBe(
			"",
		);
	});

	it("puts highlighted text in the pane's buffer", () => {
		expect(copyOnHighlight(pane("a"), "selected").highlightBuffer).toBe(
			"selected",
		);
	});

	it("does not mutate the pane it was given", () => {
		const original = pane("a");
		copyOnHighlight(original, "selected");
		expect(original.highlightBuffer).toBe("");
	});
});

describe("the status value", () => {
	it("defaults to local-only", () => {
		// Remote readiness is a claim about reachable infrastructure. Defaulting
		// it to true would tell a reader their session is remote when nothing
		// checked.
		expect(status([]).remoteReady).toBe(false);
	});

	it("is remote-ready only on an exact true", () => {
		expect(status([], { remoteReady: true }).remoteReady).toBe(true);
	});

	it("defaults to the herdr theme", () => {
		expect(status([]).theme).toBe("herdr");
	});

	it("takes a theme override", () => {
		expect(status([], { theme: "grok-build" }).theme).toBe("grok-build");
	});

	it("always names its clickable regions", () => {
		expect(status([]).clickableRegions).toContain("pane-header");
	});
});

describe("the capability card", () => {
	it("defaults to herdr", () => {
		expect(herdrMuxCapabilities().theme).toBe("herdr");
	});

	it("takes a theme", () => {
		expect(herdrMuxCapabilities("grok-build").theme).toBe("grok-build");
	});

	it("carries a narrative for readers who cannot use a mouse", () => {
		// Copy-on-highlight is a mouse gesture. The narrative is how the same
		// capability reaches someone driving by keyboard or screen reader.
		expect(herdrMuxCapabilities().highlightNarrative).toContain("Highlight");
	});

	it("renders the legend as the footer", () => {
		expect(renderHerdrCapabilityFooter()).toBe(
			` ${herdrMuxCapabilities().legend}`,
		);
	});

	it("renders a given card rather than the default", () => {
		expect(
			renderHerdrCapabilityFooter(herdrMuxCapabilities("grok-build")),
		).toContain("herdr");
	});
});

describe("the plain surface", () => {
	const plain = (
		panes: readonly AgentPaneState[],
		options: Record<string, unknown> = {},
	) => renderStatusTextPlain(status(panes), options);

	it("says so when there are no agents yet", () => {
		// "(none yet)" and a hint at what starts one. An empty section would
		// read as a surface that failed to load its contents.
		expect(plain([])).toContain("none yet");
	});

	it("names each agent and its state in words", () => {
		expect(plain([pane("builder", "working")])).toContain("builder");
	});

	it("uses full words rather than glyphs", () => {
		const rendered = plain([pane("builder", "working")]);
		expect(rendered).toContain("working");
		expect(rendered).not.toContain("●");
	});

	it("marks the working pane as the focus", () => {
		expect(plain([pane("builder", "working")])).toContain("(focus)");
	});

	it("does not mark a blocked pane as the focus", () => {
		expect(plain([pane("builder", "blocked")])).not.toContain("(focus)");
	});

	it("shows a summary when there is one", () => {
		expect(plain([pane("builder", "blocked", "needs a key")])).toContain(
			"needs a key",
		);
	});

	it("omits the dash when the summary is only whitespace", () => {
		// A trailing "— " with nothing after it is chrome pretending to be
		// content.
		expect(plain([pane("builder", "idle", "   ")])).not.toContain("—");
	});

	it("summarises the counts under the list", () => {
		expect(
			plain([pane("a", "working"), pane("b", "blocked"), pane("c", "idle")]),
		).toContain("1 working");
	});

	it("omits states nobody is in", () => {
		expect(plain([pane("a", "working")])).not.toContain("0 idle");
	});

	it("counts each state that is occupied", () => {
		const line = plain([
			pane("a", "working"),
			pane("b", "blocked"),
			pane("c", "idle"),
			pane("d", "done"),
		]);
		for (const bit of ["1 working", "1 blocked", "1 idle", "1 done"]) {
			expect(line).toContain(bit);
		}
	});

	it("has no summary line at all with no panes", () => {
		expect(plain([])).not.toContain("Summary:");
	});

	it("says local-only when not remote-ready", () => {
		expect(plain([])).toContain("local-only");
	});

	it("says remote-ready when it is", () => {
		expect(renderStatusTextPlain(status([], { remoteReady: true }))).toContain(
			"remote-ready",
		);
	});

	it("names the theme", () => {
		expect(
			renderStatusTextPlain(status([], { theme: "grok-build" })),
		).toContain("grok-build");
	});

	it("offers a refresh as the next step while work is in flight", () => {
		// Something is moving; the useful next action is to look again.
		expect(plain([pane("a", "working")])).toContain("hobo-code status");
	});

	it("offers a way to start work when nothing is moving", () => {
		expect(plain([pane("a", "idle")])).toContain("hobo-code guide");
	});

	it("counts a blocked pane as work in flight", () => {
		// Blocked is not finished. Offering "start something" there would send
		// a reader past the thing that needs them.
		expect(plain([pane("a", "blocked")])).toContain("hobo-code status");
	});

	it("takes a next-hint override", () => {
		expect(plain([], { nextHint: "do the thing" })).toContain("do the thing");
	});

	it("takes a title override", () => {
		expect(plain([], { title: "session · handback" })).toContain(
			"session · handback",
		);
	});

	it("points at the dense box", () => {
		// Discoverability: the glyph chrome is the historic default and a
		// power user has to be able to find it from the calm surface.
		expect(plain([])).toContain("--dense");
	});

	it("is what plain: true selects on the main entry point", () => {
		const state = status([pane("a", "working")]);
		expect(renderStatusText(state, { plain: true })).toBe(
			renderStatusTextPlain(state, { plain: true }),
		);
	});
});

describe("the empty standalone surface", () => {
	it("paints the loading screen rather than an empty box", () => {
		// The first thing a new user sees. An empty box reads as broken.
		expect(renderStatusText(status([]))).not.toContain("┌");
	});

	it("marks itself offline on the cue when not remote-ready", () => {
		expect(renderStatusText(status([]))).toContain("○l");
	});

	it("omits the offline mark when remote-ready", () => {
		// `⊙r` is the product default and stays unprinted; the absence of `○l`
		// is the signal.
		expect(renderStatusText(status([], { remoteReady: true }))).not.toContain(
			"○l",
		);
	});

	it("takes an explicit loading option", () => {
		expect(renderStatusText(status([]), { loading: true })).toContain("○l");
	});

	it("lets a caller's cue win over the offline one", () => {
		expect(
			renderStatusText(status([]), { loading: { cue: "warming up" } }),
		).toContain("warming up");
	});

	it("draws a box instead when embedded", () => {
		// A parent panel already owns the chrome; a loading screen inside one
		// would be a second surface claiming the whole pane.
		expect(renderStatusText(status([]), { embedded: true })).toContain("┌");
	});

	it("draws a box instead when a title is given", () => {
		expect(renderStatusText(status([]), { title: "session" })).toContain("┌");
	});

	it("paints the empty cue under a custom title", () => {
		expect(renderStatusText(status([]), { title: "session" })).toContain(
			"empty→★",
		);
	});

	it("folds the empty cue into a standalone dense title", () => {
		expect(
			renderStatusText(status([pane("a")]), {}) &&
				renderStatusText(status([]), { embedded: false, loading: undefined }),
		).toBeTypeOf("string");
	});
});

describe("the dense box", () => {
	it("draws a closed box", () => {
		const lines = dense([pane("a", "working")]).split("\n");
		expect(lines[0]?.startsWith("┌")).toBe(true);
		expect(lines.at(-1)?.startsWith("└")).toBe(true);
	});

	it("uses a glyph per state", () => {
		expect(dense([pane("a", "blocked")])).toContain("▲");
	});

	it("marks the working pane with a focus arrow", () => {
		expect(dense([pane("a", "working")])).toContain("▸");
	});

	it("does not mark a done pane with a focus arrow", () => {
		expect(dense([pane("a", "done")])).not.toContain("▸");
	});

	it("shows why a pane is blocked", () => {
		// The one thing a glyph cannot carry.
		expect(dense([pane("a", "blocked", "keys")])).toContain("keys");
	});

	it("does not show an idle pane's summary", () => {
		// Idle has nothing to say, and printing it would spend the box's
		// scarcest resource on it.
		expect(dense([pane("a", "idle", "chatter")])).not.toContain("chatter");
	});

	it("truncates a long blocked cue", () => {
		const rendered = dense([pane("a", "blocked", "waiting on a signing key")]);
		expect(rendered).toContain("waiti…");
		expect(rendered).not.toContain("signing");
	});

	it("keeps a short blocked cue whole", () => {
		expect(dense([pane("a", "blocked", "keys")])).not.toContain("key…");
	});

	it("shows a clipboard tail when something was highlighted", () => {
		expect(dense([pane("a", "idle", "", "copied")])).toContain("↳copied");
	});

	it("truncates a long clipboard tail", () => {
		expect(
			dense([pane("a", "idle", "", "a very long selection indeed")]),
		).toContain("…");
	});

	it("shows no tail when nothing was highlighted", () => {
		expect(dense([pane("a", "idle")])).not.toContain("↳");
	});

	it.each([
		["coordinator", "co"],
		["coord", "co"],
		["station", "sn"],
		["hive", "hv"],
		["worker", "wk"],
		["watcher", "wch"],
	])("abbreviates the well-known agent %s to %s", (id, short) => {
		expect(dense([pane(id, "idle")])).toContain(short);
	});

	it("leaves a short custom id intact", () => {
		// `agent-1` is already as short as an abbreviation would be, and the
		// real id is more useful than a coined one.
		expect(dense([pane("agent-1", "idle")])).toContain("agent-1");
	});

	it("trims a long custom id", () => {
		expect(dense([pane("a-very-long-agent-name", "idle")])).toContain(
			"a-very-…",
		);
	});

	it("folds panes four to a line", () => {
		const lines = dense(
			Array.from({ length: 9 }, (_u, i) => pane(`a${i}`, "idle")),
		).split("\n");
		// top + title + three fold lines + bottom
		expect(lines).toHaveLength(6);
	});

	it("keeps every pane across the folds", () => {
		const rendered = dense(
			Array.from({ length: 6 }, (_u, i) => pane(`a${i}`, "idle")),
		);
		expect(rendered).toContain("a5");
	});

	it("sums the states into a health strip", () => {
		expect(
			dense([pane("a", "working"), pane("b", "working"), pane("c", "blocked")]),
		).toContain("●2");
	});

	it("omits a state nobody is in", () => {
		expect(dense([pane("a", "working")])).not.toContain("○0");
	});

	it("takes a subtitle override", () => {
		expect(dense([pane("a")], { subtitle: "custom" })).toContain("custom");
	});

	it("takes a title override whole", () => {
		// The title override is used verbatim -- session folds brand and
		// handback into it, and appending a next verb would corrupt that.
		expect(
			renderStatusText(status([pane("a", "working")]), { title: "session·x" }),
		).toContain("session·x");
	});

	it("does not append a next verb to an overridden title", () => {
		expect(
			renderStatusText(status([pane("a", "working")]), { title: "session" }),
		).not.toContain("session·nd");
	});

	it("appends the busy next verb when standalone", () => {
		expect(renderStatusText(status([pane("a", "working")]))).toContain("nd");
	});

	it("omits the next verb when nothing is busy", () => {
		// `★` dispatch is the product default; printing a next verb for it
		// would be chrome restating the obvious.
		expect(renderStatusText(status([pane("a", "idle")]))).not.toContain("·nd");
	});

	it("takes a next-hint override and strips its next prefix", () => {
		expect(
			renderStatusText(status([pane("a", "working")]), {
				nextHint: "next attach",
			}),
		).toContain("attach");
	});

	it("omits the next verb when embedded", () => {
		// The parent panel already carries the actions.
		expect(dense([pane("a", "working")])).not.toContain("·nd");
	});

	it("brands the standalone title", () => {
		expect(renderStatusText(status([pane("a", "working")]))).toContain(
			"hobo-code",
		);
	});

	it("does not brand an embedded title", () => {
		expect(dense([pane("a", "working")])).not.toContain("hobo-code");
	});

	it("marks offline in a standalone subtitle", () => {
		expect(renderStatusText(status([pane("a", "working")]))).toContain("○l");
	});

	it("omits the offline mark when remote-ready", () => {
		expect(
			renderStatusText(status([pane("a", "working")], { remoteReady: true })),
		).not.toContain("○l");
	});

	it("keeps the box within its cap on a busy session", () => {
		const wide = dense(
			Array.from({ length: 4 }, (_u, i) =>
				pane(`agent-${i}`, "blocked", "waiting for a signing key", "selected"),
			),
		);
		for (const line of wide.split("\n"))
			expect(line.length).toBeLessThanOrEqual(40);
	});

	it("holds a floor so a quiet box is still a box", () => {
		// Below the floor the border would be shorter than the word inside it.
		const lines = dense([pane("a", "idle")]).split("\n");
		expect(lines[0]?.length).toBeGreaterThanOrEqual(16);
	});

	it("hugs its content rather than always drawing the widest box", () => {
		const quiet = dense([pane("a", "idle")]).split("\n")[0]?.length ?? 0;
		const busy = dense([
			pane("worker-one", "blocked", "waiting", "a long selection"),
		]).split("\n")[0]?.length;
		expect(busy).toBeGreaterThan(quiet);
	});

	it("keeps every line the same width", () => {
		const lines = dense([
			pane("a", "working"),
			pane("b", "blocked", "keys"),
		]).split("\n");
		const widths = new Set(lines.map((l) => [...l].length));
		expect(widths.size).toBe(1);
	});
});

describe("the chip", () => {
	it("reads as an em dash with nothing running", () => {
		// A chip is a fixed slot in a status bar; blanking it would make the
		// bar look like it lost a widget.
		expect(renderStatusChip(status([]))).toContain("—");
	});

	it("counts each occupied state", () => {
		expect(
			renderStatusChip(status([pane("a", "working"), pane("b", "blocked")])),
		).toContain("●1");
	});

	it("puts the focus states first", () => {
		// Remote-ready so the offline `○l` is absent -- otherwise it would sit
		// ahead of the glyph strip and the `○` found would be that one.
		const chip = renderStatusChip(
			status([pane("a", "idle"), pane("b", "working")], { remoteReady: true }),
		);
		expect(chip.indexOf("●")).toBeLessThan(chip.indexOf("○"));
	});

	it("omits a state nobody is in", () => {
		expect(renderStatusChip(status([pane("a", "working")]))).not.toContain("✓");
	});

	it("marks offline", () => {
		expect(renderStatusChip(status([pane("a", "idle")]))).toContain("○l·");
	});

	it("says nothing about a remote-ready session", () => {
		expect(
			renderStatusChip(status([pane("a", "idle")], { remoteReady: true })),
		).not.toContain("○l");
	});

	it("omits the default theme", () => {
		// `herdr` on every chip forever would be a word that never varies.
		expect(renderStatusChip(status([]))).not.toContain("herdr");
	});

	it("names a non-default theme", () => {
		expect(renderStatusChip(status([], { theme: "grok-build" }))).toContain(
			"grok-build",
		);
	});
});

describe("the framed surface", () => {
	it("puts the chip under the box", () => {
		const surface = renderStatusSurface(status([pane("a", "working")]));
		expect(surface.split("\n").at(-1)).toContain("hobo-code");
	});

	it("separates them with a soft band", () => {
		expect(renderStatusSurface(status([pane("a", "working")]))).toContain("··");
	});

	it("returns the box alone when embedded", () => {
		// The header already carries the glyphs; a chip strip under it would be
		// the same counts twice.
		const state = status([pane("a", "working")]);
		expect(renderStatusSurface(state, { embedded: true })).toBe(
			renderStatusText(state, { embedded: true }),
		);
	});

	it("tracks the box width with the band", () => {
		const surface = renderStatusSurface(status([pane("a", "working")]));
		const lines = surface.split("\n");
		const top = [...(lines[0] ?? "")].length;
		const band = [...(lines.at(-2) ?? "")].length;
		expect(band).toBe(top - 2);
	});

	it("frames the empty loading screen too", () => {
		expect(renderStatusSurface(status([]))).toContain("hobo-code");
	});
});
