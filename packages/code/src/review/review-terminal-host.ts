import type { Readable, Writable } from "node:stream";

import {
	createLocalReviewControl,
	type LocalReviewControl,
} from "./local-review-control.js";
import { REVIEW_COMMAND_SCHEMA } from "./review-ports.js";
import type { ReviewCommand } from "./review-ports.js";
import { projectReviewInboxItem } from "./review-inbox.js";
import { reduceReviewTerminalKey } from "./review-terminal-actions.js";
import {
	createInitialReviewTerminalState,
	type ReviewTerminalDocument,
	type ReviewTerminalState,
} from "./review-terminal-model.js";
import { renderReviewTerminalPane } from "./review-terminal-pane.js";

type TtyInput = Readable & {
	readonly isTTY?: boolean;
	readonly isRaw?: boolean;
	readonly readableFlowing?: boolean | null;
	setRawMode?: (mode: boolean) => void;
};

type SizedOutput = Writable & { columns?: number; rows?: number };

export async function buildReviewTerminalDocument(
	control: LocalReviewControl,
	activeReviewId?: string,
): Promise<ReviewTerminalDocument> {
	const snapshots = await control.list();
	const inbox = snapshots.map((snapshot) =>
		projectReviewInboxItem({ snapshot }),
	);
	const selected =
		snapshots.find((item) => item.reviewId === activeReviewId) ?? snapshots[0];
	if (!selected) {
		return {
			inbox,
			chunks: [],
			threads: [],
			messages: [],
			coverage: [],
			routedAgents: {},
			messageBodies: {},
		};
	}
	const view = await control.loadView(selected.reviewId);
	return {
		inbox,
		snapshot: view.snapshot,
		generations: Object.values(view.aggregate.generations),
		...(view.snapshot.currentGenerationId === undefined
			? {}
			: {
					generation:
						view.aggregate.generations[view.snapshot.currentGenerationId],
				}),
		chunks: [],
		threads: Object.values(view.aggregate.threads),
		messages: Object.values(view.aggregate.messages),
		coverage: Object.values(view.aggregate.coverage),
		routedAgents: view.aggregate.routedAgents,
		messageBodies: {},
		...(view.pending === undefined ? {} : { pending: view.pending }),
	};
}

export async function runReviewTerminalPane(options: {
	readonly hoboHome: string;
	readonly reviewId?: string;
	readonly input?: Readable;
	readonly output?: Writable;
}): Promise<number> {
	const input = (options.input ?? process.stdin) as TtyInput;
	const output = (options.output ?? process.stdout) as SizedOutput;
	if (!input.isTTY || typeof input.setRawMode !== "function") {
		throw new Error(
			"Review pane requires a TTY; run it inside the resident tmux session",
		);
	}
	const control = createLocalReviewControl({ hoboHome: options.hoboHome });
	const wasRaw = input.isRaw === true;
	try {
		let state: ReviewTerminalState = {
			...createInitialReviewTerminalState(),
			...(options.reviewId === undefined
				? {}
				: { activeReviewId: options.reviewId }),
		};
		let document = await buildReviewTerminalDocument(
			control,
			state.activeReviewId,
		);
		let stopped = false;
		const redraw = (): void => {
			output.write(
				`\u001b[2J\u001b[H${renderReviewTerminalPane(document, state, output.columns, output.rows).frame}`,
			);
		};
		const apply = async (next: {
			readonly state: ReviewTerminalState;
			readonly command?: ReviewCommand;
			readonly quit?: boolean;
		}): Promise<void> => {
			state = next.state;
			if (next.quit) {
				stopped = true;
				return;
			}
			if (next.command && document.snapshot) {
				const result = await control.execute({
					schemaVersion: REVIEW_COMMAND_SCHEMA,
					commandId: `tui-${Date.now()}`,
					actorId: "review-terminal",
					reviewId: document.snapshot.reviewId,
					expectedRevision: document.snapshot.revision,
					command: next.command,
				});
				state = { ...state, activeReviewId: result.reviewId };
			}
			document = await buildReviewTerminalDocument(
				control,
				state.activeReviewId,
			);
			redraw();
		};
		input.setRawMode?.(true);
		redraw();
		await new Promise<void>((resolve) => {
			const onData = (chunk: Buffer | string) => {
				if (stopped) {
					resolve();
					return;
				}
				void apply(reduceReviewTerminalKey(state, document, String(chunk))).then(
					() => {
						if (stopped) resolve();
					},
				);
			};
			input.on("data", onData);
			process.once("SIGINT", () => {
				stopped = true;
				resolve();
			});
		});
		return 0;
	} finally {
		if (!wasRaw) input.setRawMode?.(false);
		control.close();
	}
}
