import type { Readable, Writable } from "node:stream";

import type { GitSelection, GitWorkbenchSnapshot } from "./git-workbench.js";
import {
	readGitWorkbenchSnapshot,
	runGitWorkbenchAction,
} from "./git-workbench.js";
import {
	createLocalSessionControl,
	sessionCommandEnvelope,
} from "./local-session-control.js";
import {
	SessionApprovalRequiredError,
	sessionDeliveryApprovalDigest,
	sessionProcessRunner,
} from "./session-orchestrator.js";

type Panel = "status" | "files" | "branches" | "commits" | "stash";

export interface GitTerminalPaneState {
	readonly panel: Panel;
	readonly selected: Readonly<Record<Panel, number>>;
	readonly message?: string;
}

const PANELS: readonly Panel[] = [
	"status",
	"files",
	"branches",
	"commits",
	"stash",
];

export const INITIAL_GIT_TERMINAL_STATE: GitTerminalPaneState = {
	panel: "files",
	selected: { status: 0, files: 0, branches: 0, commits: 0, stash: 0 },
};

export function consumeGitTerminalPromptChunk(
	value: string,
	text: string,
): { readonly done: boolean; readonly value?: string } {
	if (text.includes("\u0003") || text.includes("\u001b")) return { done: true };
	const terminator = text.search(/[\r\n]/u);
	if (terminator < 0) return { done: false, value: value + text };
	const answer = `${value}${text.slice(0, terminator)}`.trim();
	return { done: true, ...(answer ? { value: answer } : {}) };
}

function crop(value: string, width: number): string {
	const clean = value.replace(/[\r\n\t]/gu, " ");
	return clean.length <= width
		? clean.padEnd(width)
		: `${clean.slice(0, Math.max(0, width - 1))}…`;
}

function rowsFor(
	snapshot: GitWorkbenchSnapshot,
	panel: Panel,
): readonly string[] {
	switch (panel) {
		case "status":
			return [
				`${snapshot.branch ?? "detached"}${snapshot.upstream ? ` → ${snapshot.upstream}` : ""}`,
				`↑${snapshot.ahead} ↓${snapshot.behind} · ${snapshot.files.length} changed`,
			];
		case "files":
			return snapshot.files.map(
				(file) =>
					`${file.staged ? "S" : " "}${file.unstaged ? "M" : " "}${file.untracked ? "?" : " "} ${file.path}`,
			);
		case "branches":
			return snapshot.branches.map(
				(branch) =>
					`${branch.current ? "*" : " "} ${branch.name} ${branch.subject}`,
			);
		case "commits":
			return snapshot.commits.map(
				(commit) => `${commit.graph}${commit.shortOid} ${commit.subject}`,
			);
		case "stash":
			return snapshot.stashes.map((stash) => `${stash.ref} ${stash.subject}`);
	}
}

function selectionFor(
	snapshot: GitWorkbenchSnapshot,
	state: GitTerminalPaneState,
): GitSelection | undefined {
	const index = state.selected[state.panel] ?? 0;
	switch (state.panel) {
		case "files": {
			const value = snapshot.files[index]?.path;
			return value ? { kind: "file", value } : undefined;
		}
		case "branches": {
			const value = snapshot.branches[index]?.name;
			return value ? { kind: "branch", value } : undefined;
		}
		case "commits": {
			const value = snapshot.commits[index]?.oid;
			return value ? { kind: "commit", value } : undefined;
		}
		case "stash": {
			const value = snapshot.stashes[index]?.ref;
			return value ? { kind: "stash", value } : undefined;
		}
		default:
			return undefined;
	}
}

function box(
	title: string,
	values: readonly string[],
	width: number,
	height: number,
	active: boolean,
	selected: number,
): string[] {
	const inner = Math.max(8, width - 2);
	const capacity = Math.max(0, height - 2);
	const start = Math.max(
		0,
		Math.min(selected - capacity + 1, Math.max(0, values.length - capacity)),
	);
	const position =
		active && values.length > capacity
			? ` ${selected + 1}/${values.length}`
			: "";
	const heading = ` ${active ? "▸ " : ""}${title}${position} `;
	const lines = [
		`┏${heading}${"━".repeat(Math.max(0, inner - heading.length))}┓`,
	];
	for (let index = 0; index < capacity; index += 1) {
		const valueIndex = start + index;
		const marker =
			active && valueIndex === selected && values[valueIndex] ? "▸" : " ";
		lines.push(`┃${crop(`${marker} ${values[valueIndex] ?? ""}`, inner)}┃`);
	}
	lines.push(`┗${"━".repeat(inner)}┛`);
	return lines;
}

function joinColumns(
	left: readonly string[],
	right: readonly string[],
): string[] {
	const length = Math.max(left.length, right.length);
	const leftWidth = left[0]?.length ?? 0;
	return Array.from(
		{ length },
		(_, index) =>
			`${left[index] ?? " ".repeat(leftWidth)} ${right[index] ?? ""}`,
	);
}

export function renderGitTerminalPane(
	snapshot: GitWorkbenchSnapshot,
	state: GitTerminalPaneState,
	columns = 80,
	rows = 24,
): string {
	const width = Math.max(60, columns);
	const bodyHeight = Math.max(20, rows - 4);
	const leftWidth = Math.max(24, Math.floor(width * 0.38));
	const rightWidth = width - leftWidth - 1;
	const diffLines = (
		snapshot.selectedDiff?.text ?? "Select a file, branch, commit, or stash."
	)
		.split("\n")
		.slice(0, Math.max(3, bodyHeight - 13));
	const left = [
		...box(
			"1 Status",
			rowsFor(snapshot, "status"),
			leftWidth,
			4,
			state.panel === "status",
			0,
		),
		...box(
			snapshot.truncated.files
				? `2 Files (first ${snapshot.files.length}+)`
				: "2 Files",
			rowsFor(snapshot, "files"),
			leftWidth,
			bodyHeight - 9,
			state.panel === "files",
			state.selected.files,
		),
		...box(
			"3 Branches",
			rowsFor(snapshot, "branches"),
			leftWidth,
			5,
			state.panel === "branches",
			state.selected.branches,
		),
	];
	const right = [
		...box("Diff", diffLines, rightWidth, bodyHeight - 11, false, 0),
		...box(
			"4 Commits",
			rowsFor(snapshot, "commits"),
			rightWidth,
			6,
			state.panel === "commits",
			state.selected.commits,
		),
		...box(
			"5 Stash",
			rowsFor(snapshot, "stash"),
			rightWidth,
			5,
			state.panel === "stash",
			state.selected.stash,
		),
	];
	return [
		crop(
			`hobo-code · Git · ${snapshot.branch ?? "detached"} · ↑${snapshot.ahead} ↓${snapshot.behind}`,
			width,
		),
		...joinColumns(left, right).slice(0, bodyHeight),
		crop(
			state.message ??
				"1–5 focus · ↑↓/jk move · Space stage · Enter act · ? keys · q close",
			width,
		),
		crop(
			"c commit · p push · o PR · S stack · M merge · f fetch · P pull",
			width,
		),
	].join("\n");
}

export function moveGitTerminalSelection(
	snapshot: GitWorkbenchSnapshot,
	state: GitTerminalPaneState,
	delta: number,
): GitTerminalPaneState {
	const count = rowsFor(snapshot, state.panel).length;
	if (count === 0) return state;
	const current = state.selected[state.panel] ?? 0;
	return {
		...state,
		selected: {
			...state.selected,
			[state.panel]: Math.max(0, Math.min(count - 1, current + delta)),
		},
	};
}

type TtyInput = Readable & {
	isTTY?: boolean;
	isRaw?: boolean;
	setRawMode?: (value: boolean) => void;
};
type SizedOutput = Writable & { columns?: number; rows?: number };

export async function runGitTerminalPane(options: {
	readonly sessionId: string;
	readonly hoboHome: string;
	readonly input?: Readable;
	readonly output?: Writable;
}): Promise<number> {
	const input = (options.input ?? process.stdin) as TtyInput;
	const output = (options.output ?? process.stdout) as SizedOutput;
	if (!input.isTTY || typeof input.setRawMode !== "function") {
		throw new Error(
			"Git pane requires a TTY; run it inside the resident tmux session",
		);
	}
	const control = createLocalSessionControl({ hoboHome: options.hoboHome });
	const wasRaw = input.isRaw === true;
	const wasFlowing = input.readableFlowing;
	let onData: ((chunk: Buffer | string) => Promise<void>) | undefined;
	let onResize: (() => void) | undefined;
	try {
		let state = INITIAL_GIT_TERMINAL_STATE;
		let snapshot = await control.load(options.sessionId);
		if (!snapshot?.session)
			throw new Error(`session ${options.sessionId} does not exist`);
		const worktree = snapshot.session.worktreePath;
		const runner = sessionProcessRunner();
		let git = await readGitWorkbenchSnapshot(worktree, runner);
		let stopped = false;
		let busy = false;
		const redraw = async (): Promise<void> => {
			const selected = selectionFor(git, state);
			git = await readGitWorkbenchSnapshot(worktree, runner, selected).catch(
				() => readGitWorkbenchSnapshot(worktree, runner),
			);
			output.write(
				`\u001b[2J\u001b[H${renderGitTerminalPane(git, state, output.columns, output.rows)}`,
			);
		};
		const prompt = async (label: string): Promise<string | undefined> => {
			input.setRawMode?.(false);
			output.write(`\n${label}: `);
			return await new Promise((resolve) => {
				let value = "";
				let finished = false;
				const finish = (answer: string | undefined) => {
					if (finished) return;
					finished = true;
					input.removeListener("data", onData);
					process.removeListener("SIGINT", onInterrupt);
					input.setRawMode?.(true);
					resolve(answer);
				};
				const onInterrupt = () => {
					stopped = true;
					finish(undefined);
				};
				const onData = (chunk: Buffer | string) => {
					const next = consumeGitTerminalPromptChunk(value, String(chunk));
					if (next.done) finish(next.value);
					else value = next.value ?? "";
				};
				input.on("data", onData);
				process.once("SIGINT", onInterrupt);
			});
		};
		const approve = async (
			label: string,
			command: string,
			value: Readonly<Record<string, unknown>>,
		): Promise<void> => {
			const envelope = sessionCommandEnvelope(
				options.sessionId,
				snapshot?.revision ?? 0n,
				"git-terminal-pane",
				command,
				value,
			);
			let challenge: SessionApprovalRequiredError;
			try {
				await control.execute(envelope);
				throw new Error("delivery command completed without approval");
			} catch (error) {
				if (!(error instanceof SessionApprovalRequiredError)) throw error;
				challenge = error;
			}
			const digest = sessionDeliveryApprovalDigest(challenge.approval);
			output.write(
				`\n${label}\nExact effect:\n${JSON.stringify(challenge.approval.details, null, 2)}\nApproval ${digest}\n`,
			);
			if ((await prompt("Type the approval digest to continue")) !== digest)
				return;
			snapshot = await control.execute(envelope, digest);
		};
		const local = async (
			action: Parameters<typeof runGitWorkbenchAction>[2],
		) => {
			await runGitWorkbenchAction(worktree, runner, action);
		};
		const confirmLocal = async (
			label: string,
			action: Parameters<typeof runGitWorkbenchAction>[2],
		): Promise<void> => {
			if ((await prompt(`${label} — type yes to approve`)) === "yes") {
				await local(action);
			}
		};
		onData = async (chunk: Buffer | string): Promise<void> => {
			if (busy || stopped) return;
			busy = true;
			try {
				const key = String(chunk);
				if (key === "q" || key === "\u0003") stopped = true;
				else if (/^[1-5]$/u.test(key))
					state = { ...state, panel: PANELS[Number(key) - 1] ?? "files" };
				else if (key === "j" || key === "\u001b[B")
					state = moveGitTerminalSelection(git, state, 1);
				else if (key === "k" || key === "\u001b[A")
					state = moveGitTerminalSelection(git, state, -1);
				else if (key === " " && state.panel === "files") {
					const file = git.files[state.selected.files];
					if (file) {
						snapshot = await control.execute(
							sessionCommandEnvelope(
								options.sessionId,
								snapshot?.revision ?? 0n,
								"git-terminal-pane",
								file.staged && !file.unstaged ? "unstagePaths" : "stagePaths",
								{ paths: [file.path] },
							),
						);
					}
				} else if (key === "f") await local({ action: "fetch" });
				else if (key === "P") await local({ action: "pull" });
				else if (key === "n") {
					const name = await prompt("New branch name");
					if (name) await local({ action: "branch-create", name });
				} else if (key === "i" && state.panel === "files") {
					const selection = selectionFor(git, state);
					if (selection)
						await confirmLocal(`ignore ${selection.value}`, {
							action: "file-ignore",
							selection,
						});
				} else if (key === "x") {
					const selection = selectionFor(git, state);
					const action =
						selection?.kind === "file"
							? ({ action: "file-discard", selection } as const)
							: selection?.kind === "branch"
								? ({ action: "branch-delete", selection } as const)
								: selection?.kind === "commit"
									? ({ action: "commit-revert", selection } as const)
									: selection?.kind === "stash"
										? ({ action: "stash-drop", selection } as const)
										: undefined;
					if (action && selection)
						await confirmLocal(`${action.action} ${selection.value}`, action);
				} else if (key === "\r" && state.panel === "branches") {
					const selection = selectionFor(git, state);
					if (selection) await local({ action: "branch-checkout", selection });
				} else if (key === "s") {
					const message = await prompt("Stash message");
					if (message) await local({ action: "stash-create", message });
				} else if (key === "a" && state.panel === "stash") {
					const selection = selectionFor(git, state);
					if (selection) await local({ action: "stash-apply", selection });
				} else if (key === "O" && state.panel === "stash") {
					const selection = selectionFor(git, state);
					if (selection)
						await confirmLocal(`pop ${selection.value}`, {
							action: "stash-pop",
							selection,
						});
				} else if (key === "c") {
					if (git.truncated.files) {
						throw new Error(
							"Commit disabled: more than 200 changed files; use git status for a complete review",
						);
					}
					const message = await prompt("Commit message");
					if (message)
						await approve(
							`commit staged changes as ${JSON.stringify(message)}`,
							"commit",
							{ message, stagedOnly: true },
						);
				} else if (key === "p")
					await approve("push current branch to origin", "push", {
						remote: "origin",
					});
				else if (key === "o") {
					const title = await prompt("Pull request title");
					if (title)
						await approve(
							`open pull request ${JSON.stringify(title)}`,
							"openPullRequest",
							{ title, body: "", draft: false },
						);
				} else if (key === "S") {
					const parentBranch = await prompt("Parent branch");
					const title = parentBranch
						? await prompt("Pull request title")
						: undefined;
					if (parentBranch && title)
						await approve(
							`stack ${JSON.stringify(title)} onto ${parentBranch}`,
							"stackPullRequest",
							{ parentBranch, title, body: "" },
						);
				} else if (key === "M") {
					const number = Number(await prompt("Pull request number"));
					if (Number.isSafeInteger(number) && number > 0)
						await approve(
							`squash merge pull request #${number}`,
							"mergePullRequest",
							{ pullRequestNumber: number },
						);
				} else if (key === "?")
					state = {
						...state,
						message:
							"Enter checkout · n branch · i ignore · x discard/delete/revert/drop · s/a/O stash",
					};
				if (stopped) state = { ...state, message: "closing Git pane…" };
			} catch (error) {
				state = {
					...state,
					message: error instanceof Error ? error.message : String(error),
				};
			} finally {
				try {
					if (!stopped) await redraw();
				} catch (error) {
					state = {
						...state,
						message: error instanceof Error ? error.message : String(error),
					};
					stopped = true;
				} finally {
					busy = false;
				}
			}
		};
		onResize = () => {
			if (busy || stopped) return;
			void redraw().catch(() => {
				stopped = true;
			});
		};
		input.setRawMode(true);
		input.resume();
		input.on("data", onData);
		output.on("resize", onResize);
		output.write("\u001b[?25l\u001b[?1049h");
		await redraw();
		await new Promise<void>((resolve) => {
			const timer = setInterval(() => {
				if (stopped) {
					clearInterval(timer);
					resolve();
				}
			}, 25);
		});
		return 0;
	} finally {
		try {
			if (onData) input.removeListener("data", onData);
			if (onResize) output.removeListener("resize", onResize);
			try {
				if (wasFlowing !== true) input.pause();
			} finally {
				try {
					input.setRawMode(wasRaw);
				} finally {
					output.write("\u001b[?1049l\u001b[?25h");
				}
			}
		} finally {
			control.close();
		}
	}
}
