/**
 * AG-UI shaped agent→UI event stream.
 *
 * The shell previously invented its own three-case event union, which could
 * only express "some text arrived" and "a tool ran". That is not enough to
 * show what an agent is actually doing, and it is not a standard anyone else
 * speaks. These events follow the AG-UI protocol's vocabulary
 * (https://ag-ui.com): a run brackets the turn, messages stream in
 * start/content/end triples, tool calls stream their arguments, and state or
 * errors are explicit rather than inferred from a message string.
 *
 * Engines emit these; the shell renders them. Anything that can be observed
 * about a turn is an event, so intermediate work is visible instead of the
 * UI freezing until a final answer appears.
 */

// public-contract: AG-UI event names as consumed by the shell renderer.
export const AGUI_EVENT = {
	runStarted: "RUN_STARTED",
	runFinished: "RUN_FINISHED",
	runError: "RUN_ERROR",
	textMessageStart: "TEXT_MESSAGE_START",
	textMessageContent: "TEXT_MESSAGE_CONTENT",
	textMessageEnd: "TEXT_MESSAGE_END",
	toolCallStart: "TOOL_CALL_START",
	toolCallArgs: "TOOL_CALL_ARGS",
	toolCallEnd: "TOOL_CALL_END",
	toolCallResult: "TOOL_CALL_RESULT",
	stateDelta: "STATE_DELTA",
} as const;

export type AguiEvent =
	| { readonly type: typeof AGUI_EVENT.runStarted; readonly runId: string }
	| {
			readonly type: typeof AGUI_EVENT.runFinished;
			readonly runId: string;
			readonly cancelled?: boolean;
	  }
	| {
			readonly type: typeof AGUI_EVENT.runError;
			readonly runId: string;
			readonly message: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.textMessageStart;
			readonly messageId: string;
			readonly role: "assistant";
	  }
	| {
			readonly type: typeof AGUI_EVENT.textMessageContent;
			readonly messageId: string;
			readonly delta: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.textMessageEnd;
			readonly messageId: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.toolCallStart;
			readonly toolCallId: string;
			readonly toolName: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.toolCallArgs;
			readonly toolCallId: string;
			readonly delta: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.toolCallEnd;
			readonly toolCallId: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.toolCallResult;
			readonly toolCallId: string;
			readonly ok: boolean;
			readonly summary?: string;
	  }
	| {
			readonly type: typeof AGUI_EVENT.stateDelta;
			readonly label: string;
	  };

/** What a turn looks like to the renderer at any instant. */
export interface TurnView {
	readonly text: string;
	readonly tools: readonly {
		readonly id: string;
		readonly name: string;
		readonly args: string;
		readonly state: "running" | "ok" | "failed";
		readonly summary?: string;
	}[];
	readonly note?: string;
	readonly finished: boolean;
	readonly cancelled: boolean;
	readonly error?: string;
}

export const EMPTY_TURN: TurnView = {
	text: "",
	tools: [],
	finished: false,
	cancelled: false,
};

/**
 * Fold one event into the view. Pure, so the rendering of a stream is
 * reproducible from its events alone — which is what makes a transcript
 * replayable rather than a side effect of arrival order.
 */
export function reduceTurn(view: TurnView, event: AguiEvent): TurnView {
	switch (event.type) {
		case AGUI_EVENT.textMessageContent:
			return { ...view, text: view.text + event.delta };
		case AGUI_EVENT.toolCallStart:
			return {
				...view,
				tools: [
					...view.tools,
					{
						id: event.toolCallId,
						name: event.toolName,
						args: "",
						state: "running",
					},
				],
			};
		case AGUI_EVENT.toolCallArgs:
			return {
				...view,
				tools: view.tools.map((t) =>
					t.id === event.toolCallId ? { ...t, args: t.args + event.delta } : t,
				),
			};
		case AGUI_EVENT.toolCallResult:
			return {
				...view,
				tools: view.tools.map((t) =>
					t.id === event.toolCallId
						? {
								...t,
								state: event.ok ? "ok" : "failed",
								...(event.summary !== undefined
									? { summary: event.summary }
									: {}),
							}
						: t,
				),
			};
		case AGUI_EVENT.stateDelta:
			return { ...view, note: event.label };
		case AGUI_EVENT.runFinished:
			return { ...view, finished: true, cancelled: event.cancelled === true };
		case AGUI_EVENT.runError:
			return { ...view, finished: true, error: event.message };
		default:
			return view;
	}
}

/** Render the live turn as transcript lines — tools above the prose. */
export function renderTurn(view: TurnView): string {
	const lines: string[] = [];
	for (const tool of view.tools) {
		const mark =
			tool.state === "running" ? "…" : tool.state === "ok" ? "✓" : "✗";
		const args = tool.args.trim();
		const shown = args.length > 60 ? `${args.slice(0, 59)}…` : args;
		lines.push(
			`tool ${mark} ${tool.name}${shown ? ` ${shown}` : ""}${tool.summary ? ` — ${tool.summary}` : ""}`,
		);
	}
	if (view.note && !view.finished) lines.push(view.note);
	if (view.text.length > 0) lines.push(view.text);
	if (view.cancelled) lines.push("(cancelled)");
	if (view.error) lines.push(`(failed: ${view.error})`);
	return lines.join("\n");
}
