/**
 * The prompt line, backed by pi-tui's `Editor`.
 *
 * The first version was an append-only string: backspace bytes never reached
 * it on a real terminal, Esc did nothing, and there was no cursor, no word
 * kill, no undo and no history — "backwards navigation is poor" was an
 * understatement. Rather than reimplement readline badly, this uses the
 * library's own editor, which already handles editing keys, kill-ring, undo,
 * bracketed paste, horizontal scroll and history.
 *
 * Slash commands ride the editor's autocomplete provider instead of a bespoke
 * palette, so there is one way to discover commands rather than two.
 */

import {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	Editor,
	type EditorTheme,
	type TUI,
} from "@earendil-works/pi-tui";
import { ACCENT, colourEnabled } from "./rubberhose.js";

/** Strict B&W by default; the palette stays closed (site/DESIGN.md). */
export function inkEditorTheme(): EditorTheme {
	const paint = (code: string) => (text: string) =>
		colourEnabled() ? `${code}${text}${ACCENT.reset}` : text;
	return {
		borderColor: (s) => s,
		selectList: {
			selectedPrefix: paint(ACCENT.bold),
			selectedText: paint(ACCENT.bold),
			description: paint(ACCENT.dim),
			scrollInfo: paint(ACCENT.dim),
			noMatch: paint(ACCENT.dim),
		},
	};
}

export interface CommandSpec {
	readonly name: string;
	readonly description: string;
}

/**
 * Completes `/name` at the start of the buffer. Deliberately narrow: commands
 * are a prefix concept, not a general token completer.
 */
export class SlashCommandProvider implements AutocompleteProvider {
	readonly triggerCharacters = ["/"];
	private readonly commands: readonly CommandSpec[];

	constructor(commands: readonly CommandSpec[]) {
		this.commands = commands;
	}

	async getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): Promise<AutocompleteSuggestions | null> {
		const line = lines[cursorLine] ?? "";
		if (!line.startsWith("/")) return null;
		const upToCursor = line.slice(0, cursorCol);
		// Only while still typing the command word itself.
		if (upToCursor.includes(" ")) return null;
		const typed = upToCursor.slice(1).toLowerCase();
		const items: AutocompleteItem[] = this.commands
			.filter((c) => c.name.startsWith(typed))
			.map((c) => ({
				value: `/${c.name}`,
				label: `/${c.name}`,
				description: c.description,
			}));
		if (items.length === 0) return null;
		return { items, prefix: upToCursor };
	}

	applyCompletion(
		lines: string[],
		cursorLine: number,
		_cursorCol: number,
		item: AutocompleteItem,
	) {
		const next = [...lines];
		next[cursorLine] = item.value;
		return {
			lines: next,
			cursorLine,
			cursorCol: item.value.length,
		};
	}
}

export interface ShellInputOptions {
	readonly tui: TUI;
	readonly commands: readonly CommandSpec[];
	readonly onSubmit: (text: string) => void;
	readonly onChange?: (text: string) => void;
}

export interface ShellInput {
	readonly editor: Editor;
	/** Lines the editor will occupy, so the transcript can size itself. */
	height(width: number): number;
	text(): string;
	clear(): void;
	remember(text: string): void;
}

export function createShellInput(options: ShellInputOptions): ShellInput {
	const editor = new Editor(options.tui, inkEditorTheme(), { paddingX: 0 });
	editor.setAutocompleteProvider(new SlashCommandProvider(options.commands));
	editor.onSubmit = (text: string) => {
		const trimmed = text.trim();
		if (trimmed.length === 0) return;
		editor.addToHistory(trimmed);
		editor.setText("");
		options.onSubmit(trimmed);
	};
	if (options.onChange) editor.onChange = options.onChange;
	return {
		editor,
		height: (width: number) => Math.max(1, editor.render(width).length),
		text: () => editor.getText(),
		clear: () => editor.setText(""),
		remember: (text: string) => editor.addToHistory(text),
	};
}
