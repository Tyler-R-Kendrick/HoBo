/**
 * Folding an agent's event stream into what the shell draws.
 *
 * The module's header says why this shape exists: the shell used to have a
 * three-case union that could express "some text arrived" and "a tool ran",
 * which is not enough to show what an agent is *doing* and is not a vocabulary
 * anyone else speaks. These are AG-UI events, and `reduceTurn` is the fold
 * that turns a stream of them into a view.
 *
 * **The fold is pure, and that is the feature.** The header states it: the
 * rendering of a stream is reproducible from its events alone, which is what
 * makes a transcript replayable rather than a side effect of arrival order.
 * So the tests below fold the same events twice, fold them in pieces, and fold
 * an event the reducer does not know — and none of that may change the answer.
 *
 * **A tool call is tracked by id, not by position.** Several tools run at once
 * and their argument deltas interleave. Matching on anything but the id would
 * append one tool's arguments to another's, and the rendered line would
 * attribute a command to the wrong call.
 *
 * **Cancelled and failed are different endings.** Both finish the turn; only
 * one is an error. A cancel rendered as a failure sends the user looking for a
 * problem they caused deliberately.
 *
 * **The renderer puts tools above the prose.** Tools are what happened; the
 * prose is what the model said about it. A reader scanning a turn wants the
 * work first.
 */
import { describe, expect, it } from "vitest";

import {
	AGUI_EVENT,
	type AguiEvent,
	EMPTY_TURN,
	reduceTurn,
	renderTurn,
	type TurnView,
} from "../src/agui.js";

const fold = (...events: readonly AguiEvent[]): TurnView =>
	events.reduce(reduceTurn, EMPTY_TURN);

const text = (delta: string): AguiEvent => ({
	type: AGUI_EVENT.textMessageContent,
	messageId: "m1",
	delta,
});

const toolStart = (id: string, name: string): AguiEvent =>
	({
		type: AGUI_EVENT.toolCallStart,
		toolCallId: id,
		toolName: name,
		// SAFETY: the fixture is the event shape the fold is declared over.
	}) as AguiEvent;

const toolArgs = (id: string, delta: string): AguiEvent =>
	({
		type: AGUI_EVENT.toolCallArgs,
		toolCallId: id,
		delta,
		// SAFETY: the fixture is the event shape the fold is declared over.
	}) as AguiEvent;

const toolResult = (id: string, ok: boolean, summary?: string): AguiEvent =>
	({
		type: AGUI_EVENT.toolCallResult,
		toolCallId: id,
		ok,
		...(summary === undefined ? undefined : { summary }),
		// SAFETY: the fixture is the event shape the fold is declared over.
	}) as AguiEvent;

describe("an empty turn", () => {
	it("starts with no text", () => {
		expect(EMPTY_TURN.text).toBe("");
	});

	it("starts with no tools", () => {
		expect(EMPTY_TURN.tools).toStrictEqual([]);
	});

	it("starts unfinished", () => {
		// A turn is unfinished until an event says otherwise; starting finished
		// would render a completed turn before anything arrived.
		expect(EMPTY_TURN.finished).toBe(false);
	});

	it("starts uncancelled", () => {
		expect(EMPTY_TURN.cancelled).toBe(false);
	});

	it("renders as nothing", () => {
		expect(renderTurn(EMPTY_TURN)).toBe("");
	});
});

describe("streaming text", () => {
	it("appends a delta", () => {
		expect(fold(text("hello")).text).toBe("hello");
	});

	it("concatenates deltas in arrival order", () => {
		// Order is the whole contract of a stream; reordering would produce
		// scrambled prose that looks like a model failure.
		expect(fold(text("hel"), text("lo "), text("world")).text).toBe(
			"hello world",
		);
	});

	it("keeps whitespace inside a delta", () => {
		// Deltas break wherever the provider chose, often mid-word. Trimming
		// one would join two words that were meant to be separate.
		expect(fold(text("hello "), text("world")).text).toBe("hello world");
	});

	it("handles an empty delta without disturbing the text", () => {
		expect(fold(text("hello"), text(""), text("!")).text).toBe("hello!");
	});

	it("ignores the message start and end markers", () => {
		// They bracket the stream; the text is carried entirely by the content
		// events, and treating a marker as content would insert a blank.
		expect(
			fold(
				{
					type: AGUI_EVENT.textMessageStart,
					messageId: "m1",
					role: "assistant",
				},
				text("hello"),
				{ type: AGUI_EVENT.textMessageEnd, messageId: "m1" },
			).text,
		).toBe("hello");
	});
});

describe("tracking a tool call", () => {
	it("records a started tool as running", () => {
		expect(fold(toolStart("t1", "grep")).tools[0]).toMatchObject({
			name: "grep",
			state: "running",
		});
	});

	it("starts a tool with empty arguments", () => {
		// The arguments stream in after the start; an undefined here would
		// render as "undefined" in the tool line.
		expect(fold(toolStart("t1", "grep")).tools[0]?.args).toBe("");
	});

	it("appends argument deltas", () => {
		expect(
			fold(
				toolStart("t1", "grep"),
				toolArgs("t1", '{"q":'),
				toolArgs("t1", '"x"}'),
			).tools[0]?.args,
		).toBe('{"q":"x"}');
	});

	it("routes arguments to the tool they belong to", () => {
		// The failure this prevents: several tools run at once and their deltas
		// interleave, so matching on anything but the id would attribute a
		// command to the wrong call.
		const view = fold(
			toolStart("t1", "grep"),
			toolStart("t2", "read"),
			toolArgs("t1", "for-grep"),
			toolArgs("t2", "for-read"),
		);
		expect(view.tools[0]?.args).toBe("for-grep");
		expect(view.tools[1]?.args).toBe("for-read");
	});

	it("ignores arguments for a tool that never started", () => {
		// An out-of-order or duplicated stream. Inventing a tool from an args
		// event would render a call with no name.
		expect(fold(toolArgs("t9", "orphan")).tools).toStrictEqual([]);
	});

	it("marks a successful result", () => {
		expect(
			fold(toolStart("t1", "grep"), toolResult("t1", true)).tools[0]?.state,
		).toBe("ok");
	});

	it("marks a failed result", () => {
		expect(
			fold(toolStart("t1", "grep"), toolResult("t1", false)).tools[0]?.state,
		).toBe("failed");
	});

	it("carries a result summary when there is one", () => {
		expect(
			fold(toolStart("t1", "grep"), toolResult("t1", true, "3 matches"))
				.tools[0]?.summary,
		).toBe("3 matches");
	});

	it("omits the summary rather than setting undefined", () => {
		expect(
			"summary" in
				(fold(toolStart("t1", "grep"), toolResult("t1", true)).tools[0] ?? {}),
		).toBe(false);
	});

	it("resolves only the tool the result names", () => {
		const view = fold(
			toolStart("t1", "grep"),
			toolStart("t2", "read"),
			toolResult("t1", true),
		);
		expect(view.tools[0]?.state).toBe("ok");
		expect(view.tools[1]?.state).toBe("running");
	});

	it("keeps the arguments after a result arrives", () => {
		// The line shows what was run and how it went; dropping the arguments
		// on completion would erase the first half.
		expect(
			fold(
				toolStart("t1", "grep"),
				toolArgs("t1", "pattern"),
				toolResult("t1", true),
			).tools[0]?.args,
		).toBe("pattern");
	});

	it("keeps tools in the order they started", () => {
		// Chronology is what makes a tool list readable as a sequence of work.
		expect(
			fold(toolStart("t1", "first"), toolStart("t2", "second")).tools.map(
				(tool) => tool.name,
			),
		).toStrictEqual(["first", "second"]);
	});
});

describe("how a turn ends", () => {
	it("finishes on a run-finished event", () => {
		expect(fold({ type: AGUI_EVENT.runFinished, runId: "r1" }).finished).toBe(
			true,
		);
	});

	it("is not cancelled by an ordinary finish", () => {
		expect(fold({ type: AGUI_EVENT.runFinished, runId: "r1" }).cancelled).toBe(
			false,
		);
	});

	it("is cancelled when the finish says so", () => {
		expect(
			fold({ type: AGUI_EVENT.runFinished, runId: "r1", cancelled: true })
				.cancelled,
		).toBe(true);
	});

	it("treats an absent cancelled flag as not cancelled", () => {
		// Explicitly `=== true`, so a missing flag cannot read as truthy.
		expect(fold({ type: AGUI_EVENT.runFinished, runId: "r1" }).cancelled).toBe(
			false,
		);
	});

	it("finishes on an error", () => {
		// An errored run is over; leaving it unfinished would spin the UI
		// forever on a turn that has already failed.
		expect(
			fold({ type: AGUI_EVENT.runError, runId: "r1", message: "boom" })
				.finished,
		).toBe(true);
	});

	it("carries the error message", () => {
		expect(
			fold({ type: AGUI_EVENT.runError, runId: "r1", message: "boom" }).error,
		).toBe("boom");
	});

	it("does not mark an error as a cancellation", () => {
		// Two different endings. A failure rendered as a cancel would look like
		// the user stopped it.
		expect(
			fold({ type: AGUI_EVENT.runError, runId: "r1", message: "boom" })
				.cancelled,
		).toBe(false);
	});

	it("keeps the text a failed turn had already streamed", () => {
		// A partial answer is still worth showing -- often it is where the
		// error is explained.
		expect(
			fold(text("partial "), {
				type: AGUI_EVENT.runError,
				runId: "r1",
				message: "boom",
			}).text,
		).toBe("partial ");
	});
});

describe("the fold itself", () => {
	it("ignores a run-started event", () => {
		// It brackets the turn; there is nothing to record from it.
		expect(fold({ type: AGUI_EVENT.runStarted, runId: "r1" })).toStrictEqual(
			EMPTY_TURN,
		);
	});

	it("ignores an event it does not know", () => {
		// Forward compatibility: an engine emitting a newer event must not
		// blank the view or throw.
		expect(
			// SAFETY: deliberately an event outside the union.
			fold(text("hello"), { type: "SOMETHING_NEW" } as unknown as AguiEvent)
				.text,
		).toBe("hello");
	});

	it("does not mutate the view it was given", () => {
		// The caller keeps the previous view to diff against for rendering.
		const before = fold(text("hello"));
		reduceTurn(before, text(" world"));
		expect(before.text).toBe("hello");
	});

	it("does not mutate the tool list it was given", () => {
		const before = fold(toolStart("t1", "grep"));
		reduceTurn(before, toolArgs("t1", "x"));
		expect(before.tools[0]?.args).toBe("");
	});

	it("produces the same view from the same events", () => {
		// The replayability claim in the module header, stated as a test.
		const events = [toolStart("t1", "grep"), toolArgs("t1", "x"), text("done")];
		expect(fold(...events)).toStrictEqual(fold(...events));
	});

	it("produces the same view whether folded at once or in pieces", () => {
		// Chunk boundaries are the transport's business, not the view's.
		const events: AguiEvent[] = [
			toolStart("t1", "grep"),
			toolArgs("t1", "x"),
			text("done"),
		];
		const atOnce = events.reduce(reduceTurn, EMPTY_TURN);
		const inPieces = events
			.slice(2)
			.reduce(reduceTurn, events.slice(0, 2).reduce(reduceTurn, EMPTY_TURN));
		expect(inPieces).toStrictEqual(atOnce);
	});

	it("records a state note", () => {
		expect(
			// SAFETY: the fixture is the event shape the fold is declared over.
			fold({ type: AGUI_EVENT.stateDelta, label: "thinking" } as AguiEvent)
				.note,
		).toBe("thinking");
	});

	it("replaces an earlier note rather than accumulating them", () => {
		// The note is a status, not a log -- two of them stacked would be a
		// growing line nobody trimmed.
		expect(
			fold(
				// SAFETY: the fixture is the event shape the fold is declared over.
				{ type: AGUI_EVENT.stateDelta, label: "first" } as AguiEvent,
				// SAFETY: the fixture is the event shape the fold is declared over.
				{ type: AGUI_EVENT.stateDelta, label: "second" } as AguiEvent,
			).note,
		).toBe("second");
	});
});

describe("rendering the turn", () => {
	it("puts tools above the prose", () => {
		// Tools are what happened; the prose is what the model said about it.
		// A reader scanning a turn wants the work first.
		const rendered = renderTurn(
			fold(toolStart("t1", "grep"), text("I searched.")),
		);
		expect(rendered.indexOf("grep")).toBeLessThan(
			rendered.indexOf("I searched"),
		);
	});

	it("marks a running tool", () => {
		expect(renderTurn(fold(toolStart("t1", "grep")))).toContain("…");
	});

	it("marks a finished tool", () => {
		expect(
			renderTurn(fold(toolStart("t1", "grep"), toolResult("t1", true))),
		).toContain("✓");
	});

	it("marks a failed tool", () => {
		// Distinct from the running mark, or a tool that failed would look like
		// one still going and the reader would wait for it.
		expect(
			renderTurn(fold(toolStart("t1", "grep"), toolResult("t1", false))),
		).toContain("✗");
	});

	it("shows the tool's arguments", () => {
		expect(
			renderTurn(fold(toolStart("t1", "grep"), toolArgs("t1", "pattern"))),
		).toContain("pattern");
	});

	it("shortens long arguments rather than wrapping the line", () => {
		// One tool call with a large JSON payload would otherwise push the
		// prose off the screen.
		const rendered = renderTurn(
			fold(toolStart("t1", "grep"), toolArgs("t1", "x".repeat(300))),
		);
		expect(rendered.length).toBeLessThan(120);
	});

	it("omits the argument section entirely when there are none", () => {
		// A trailing space after the tool name is the kind of thing that shows
		// up in every diff of a pasted transcript.
		expect(renderTurn(fold(toolStart("t1", "grep")))).toBe("tool … grep");
	});

	it("shows a result summary after the arguments", () => {
		expect(
			renderTurn(
				fold(toolStart("t1", "grep"), toolResult("t1", true, "3 hits")),
			),
		).toContain("3 hits");
	});

	it("shows a note while the turn is running", () => {
		expect(
			// SAFETY: the fixture is the event shape the fold is declared over.
			renderTurn(
				fold({ type: AGUI_EVENT.stateDelta, label: "thinking" } as AguiEvent),
			),
		).toContain("thinking");
	});

	it("drops the note once the turn is finished", () => {
		// "thinking" under a completed answer is stale by definition.
		expect(
			renderTurn(
				fold(
					// SAFETY: the fixture is the event shape the fold is declared over.
					{ type: AGUI_EVENT.stateDelta, label: "thinking" } as AguiEvent,
					{ type: AGUI_EVENT.runFinished, runId: "r1" },
				),
			),
		).not.toContain("thinking");
	});

	it("says a cancelled turn was cancelled", () => {
		expect(
			renderTurn(
				fold(text("partial"), {
					type: AGUI_EVENT.runFinished,
					runId: "r1",
					cancelled: true,
				}),
			),
		).toContain("(cancelled)");
	});

	it("says a failed turn failed, with the reason", () => {
		expect(
			renderTurn(
				fold({
					type: AGUI_EVENT.runError,
					runId: "r1",
					message: "rate limited",
				}),
			),
		).toContain("(failed: rate limited)");
	});

	it("does not call a cancelled turn a failure", () => {
		expect(
			renderTurn(
				fold({ type: AGUI_EVENT.runFinished, runId: "r1", cancelled: true }),
			),
		).not.toContain("failed");
	});

	it("omits the text line entirely when nothing was said", () => {
		// A blank line between the tools and the ending marker reads as
		// something missing.
		expect(renderTurn(fold(toolStart("t1", "grep")))).not.toContain("\n\n");
	});
});
