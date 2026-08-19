/**
 * A programmable view of what is actually on a pane.
 *
 * tmux gives us panes; it does not give us their *contents* in any form a
 * program can reason about. `capture-pane` returns text with the escape
 * sequences already resolved by tmux's own emulator, which is fine for a human
 * and useless for anything that needs to know when a prompt appeared, whether
 * output stopped, or what the screen looked like at a moment in time.
 *
 * So the harness runs its own terminal emulator over the pane's byte stream
 * (`tmux pipe-pane`). `@xterm/headless` is the same VT parser as xterm.js with
 * the DOM removed: bytes in, a structured screen buffer out. That buffer is
 * what makes the pane observable — an agent's activity becomes something the
 * shell can render, gate on, and record, rather than an opaque rectangle.
 *
 * It is emulation, not a security boundary: a pane that runs a real shell can
 * still do anything that shell can. `virtual-shell.ts` is what narrows that;
 * this is what lets us see it.
 */

import { createRequire } from "node:module";

// `@xterm/headless` ships CommonJS. A named ESM import of it typechecks and
// passes under vitest's transform, then throws `Named export 'Terminal' not
// found` from the built output — so the interop is done explicitly here rather
// than left to whatever the bundler of the day does.
const { Terminal } = createRequire(import.meta.url)(
	"@xterm/headless",
) as typeof import("@xterm/headless");

/** The instance type, kept separate because `Terminal` above is a value. */
type XtermTerminal = InstanceType<typeof Terminal>;

export interface VirtualTerminalOptions {
	readonly cols?: number;
	readonly rows?: number;
	/** Lines of scrollback retained above the screen. */
	readonly scrollback?: number;
}

export interface ScreenSnapshot {
	readonly cols: number;
	readonly rows: number;
	/** Visible screen, one string per row, trailing blanks trimmed. */
	readonly lines: readonly string[];
	readonly cursor: { readonly x: number; readonly y: number };
	/** Bytes consumed since the terminal was created. */
	readonly bytes: number;
}

export interface VirtualTerminal {
	/** Feed raw pane output. Safe to call with partial escape sequences. */
	write(chunk: string | Uint8Array): Promise<void>;
	resize(cols: number, rows: number): void;
	snapshot(): ScreenSnapshot;
	/** Visible screen as one string — what a human would read. */
	text(): string;
	/** Everything retained, scrollback first. */
	history(): string;
	dispose(): void;
}

function rowText(terminal: XtermTerminal, index: number, trim = true): string {
	return terminal.buffer.active.getLine(index)?.translateToString(trim) ?? "";
}

export function createVirtualTerminal(
	options: VirtualTerminalOptions = {},
): VirtualTerminal {
	const cols = options.cols ?? 100;
	const rows = options.rows ?? 30;
	const terminal = new Terminal({
		cols,
		rows,
		scrollback: options.scrollback ?? 1000,
		allowProposedApi: true,
	});
	let bytes = 0;

	return {
		write(chunk) {
			bytes +=
				typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
			// xterm's write is asynchronous — a sequence split across chunks is
			// only resolved once the parser has drained, so callers that snapshot
			// immediately after writing must await this.
			return new Promise<void>((resolve) => {
				terminal.write(chunk as never, () => resolve());
			});
		},
		resize(nextCols, nextRows) {
			terminal.resize(Math.max(1, nextCols), Math.max(1, nextRows));
		},
		snapshot() {
			const buffer = terminal.buffer.active;
			const lines: string[] = [];
			for (let i = 0; i < terminal.rows; i += 1) {
				lines.push(rowText(terminal, buffer.viewportY + i));
			}
			return {
				cols: terminal.cols,
				rows: terminal.rows,
				lines,
				cursor: { x: buffer.cursorX, y: buffer.cursorY },
				bytes,
			};
		},
		text() {
			return this.snapshot().lines.join("\n").replace(/\s+$/u, "");
		},
		history() {
			const buffer = terminal.buffer.active;
			const all: string[] = [];
			for (let i = 0; i < buffer.length; i += 1) all.push(rowText(terminal, i));
			// Trailing blank rows are the unused part of the screen, not content.
			while (all.length > 0 && all[all.length - 1]?.trim() === "") all.pop();
			return all.join("\n");
		},
		dispose() {
			terminal.dispose();
		},
	};
}

/**
 * The tmux command that streams a pane's bytes to a file.
 *
 * `pipe-pane` is the only tmux surface that yields the *raw* stream rather than
 * tmux's already-rendered interpretation of it, which is what the emulator
 * above needs in order to be the thing doing the interpreting.
 */
export function pipePaneCommand(
	target: string,
	sink: string,
): readonly string[] {
	// Single quotes, not JSON.stringify: the sink is interpolated into a shell
	// command tmux runs, and double quotes leave `$`, backticks and backslashes
	// live.
	const quoted = `'${sink.replace(/'/gu, `'\\''`)}'`;
	// -O so existing output is included, not only what arrives after this call.
	return ["pipe-pane", "-O", "-t", target, `cat >> ${quoted}`];
}

/** Stop streaming a pane. */
export function unpipePaneCommand(target: string): readonly string[] {
	return ["pipe-pane", "-t", target];
}
