/**
 * pi-tui Terminal implementation over injectable streams.
 *
 * The InteractiveShell drives pi-tui's differential renderer through this
 * adapter so the same code path runs against the real TTY (bin) and against
 * fake streams (tests, scripted evidence capture). Input is split into
 * complete escape sequences via pi-tui's StdinBuffer, so components always
 * receive atomic keys (arrow keys, bracketed paste, …).
 */

import type { Readable, Writable } from "node:stream";
import { StdinBuffer, type Terminal } from "@earendil-works/pi-tui";

export interface StreamTerminalOptions {
	readonly stdin: Readable;
	readonly stdout: Writable;
	/** Fixed size fallback when the stream carries no dimensions. */
	readonly columns?: number;
	readonly rows?: number;
	/** Enable raw mode + bracketed paste on start (real TTY only). */
	readonly rawMode?: boolean;
	/**
	 * Use the xterm alternate screen (CSI ?1049). Live TTY sessions set this
	 * so quit restores the prior buffer instead of leaving the frame in
	 * scrollback. Capture / scripted streams leave it off.
	 */
	readonly alternateScreen?: boolean;
}

interface MaybeTtyReadable extends Readable {
	isTTY?: boolean;
	isRaw?: boolean;
	setRawMode?: (raw: boolean) => void;
}

interface MaybeSizedWritable extends Writable {
	columns?: number;
	rows?: number;
}

export class StreamTerminal implements Terminal {
	private readonly stdin: MaybeTtyReadable;
	private readonly stdout: MaybeSizedWritable;
	private readonly fallbackColumns: number;
	private readonly fallbackRows: number;
	private readonly rawMode: boolean;
	private readonly alternateScreen: boolean;
	private wasRaw = false;
	private stdinBuffer?: StdinBuffer;
	private dataHandler?: (chunk: Buffer | string) => void;
	private resizeHandler?: () => void;
	/** Total bytes written — perceptual-metrics hook for tests/evidence. */
	bytesWritten = 0;
	/** Number of write() calls — repaint-economy hook for tests. */
	writeCount = 0;

	constructor(options: StreamTerminalOptions) {
		this.stdin = options.stdin as MaybeTtyReadable;
		this.stdout = options.stdout as MaybeSizedWritable;
		this.fallbackColumns = options.columns ?? 80;
		this.fallbackRows = options.rows ?? 24;
		this.rawMode = options.rawMode === true;
		this.alternateScreen = options.alternateScreen === true;
	}

	get kittyProtocolActive(): boolean {
		return false;
	}

	get columns(): number {
		return typeof this.stdout.columns === "number" && this.stdout.columns > 0
			? this.stdout.columns
			: this.fallbackColumns;
	}

	get rows(): number {
		return typeof this.stdout.rows === "number" && this.stdout.rows > 0
			? this.stdout.rows
			: this.fallbackRows;
	}

	start(onInput: (data: string) => void, onResize: () => void): void {
		if (this.alternateScreen) {
			this.write("\x1b[?1049h");
		}
		if (this.rawMode && typeof this.stdin.setRawMode === "function") {
			this.wasRaw = this.stdin.isRaw === true;
			this.stdin.setRawMode(true);
			// Bracketed paste: terminal wraps pastes in \x1b[200~ … \x1b[201~
			this.write("\x1b[?2004h");
		}
		this.stdinBuffer = new StdinBuffer({ timeout: 10 });
		this.stdinBuffer.on("data", (sequence) => onInput(sequence));
		this.stdinBuffer.on("paste", (content) =>
			onInput(`\x1b[200~${content}\x1b[201~`),
		);
		this.dataHandler = (chunk) => this.stdinBuffer?.process(chunk);
		this.stdin.on("data", this.dataHandler);
		if (typeof this.stdin.resume === "function") this.stdin.resume();
		this.resizeHandler = onResize;
		this.stdout.on("resize", onResize);
	}

	stop(): void {
		if (this.dataHandler) this.stdin.removeListener("data", this.dataHandler);
		if (this.resizeHandler)
			this.stdout.removeListener("resize", this.resizeHandler);
		this.stdinBuffer?.destroy();
		delete this.stdinBuffer;
		if (this.rawMode && typeof this.stdin.setRawMode === "function") {
			this.write("\x1b[?2004l");
			this.stdin.setRawMode(this.wasRaw);
		}
		if (this.alternateScreen) {
			this.write("\x1b[?25h");
			this.write("\x1b[?1049l");
		}
		if (typeof this.stdin.pause === "function") this.stdin.pause();
	}

	async drainInput(maxMs = 1000, idleMs = 50): Promise<void> {
		// Stream stdin has no kitty release events to drain; yield once so slow
		// pipes settle, bounded by idleMs.
		await new Promise((resolve) =>
			setTimeout(resolve, Math.min(idleMs, maxMs)),
		);
	}

	write(data: string): void {
		this.writeCount += 1;
		this.bytesWritten += Buffer.byteLength(data, "utf8");
		this.stdout.write(data);
	}

	moveBy(lines: number): void {
		if (lines > 0) this.write(`\x1b[${lines}B`);
		else if (lines < 0) this.write(`\x1b[${-lines}A`);
	}

	hideCursor(): void {
		this.write("\x1b[?25l");
	}

	showCursor(): void {
		this.write("\x1b[?25h");
	}

	clearLine(): void {
		this.write("\x1b[K");
	}

	clearFromCursor(): void {
		this.write("\x1b[J");
	}

	clearScreen(): void {
		this.write("\x1b[2J\x1b[H");
	}

	setTitle(title: string): void {
		this.write(`\x1b]0;${title}\x07`);
	}

	setProgress(active: boolean): void {
		// OSC 9;4 — indeterminate progress on (3) / off (0). Terminals that do
		// not understand it ignore it, so this is safe over any stream.
		this.write(active ? "\u001b]9;4;3;\u0007" : "\u001b]9;4;0;\u0007");
	}
}
