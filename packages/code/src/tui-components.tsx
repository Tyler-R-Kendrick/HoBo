import type { AccentName } from "./rubberhose.js";
import {
	formatHarnessSessionLines,
	type HarnessSessionView,
} from "./harness-session-view.js";
import { formatInkTable, type InkTableRow, wrapMessage } from "./tui-layout.js";
import { TUI_TOKENS } from "./tui-tokens.js";
import { h, type TuiChild, type TuiNode } from "./tui-tree.js";

export interface InkCardProps {
	readonly id?: string;
	readonly title: string;
	readonly accent?: AccentName;
	readonly viewportRows?: number;
	readonly children?: TuiChild;
}

export interface BroadcastFrameProps {
	readonly id?: string;
	readonly title: string;
	readonly accent?: AccentName;
	readonly viewportRows?: number;
	readonly phase?: number;
	readonly children?: TuiChild;
}

/** Old-TV / film-broadcast bezel. Algorithmic sprockets + corner screws. */
export function BroadcastFrame(props: BroadcastFrameProps): TuiNode {
	return (
		<box
			id={props.id ?? "broadcast-frame"}
			role="region"
			className="broadcast-frame"
			phase={props.phase ?? 0}
			style={{
				title: props.title,
				accent: props.accent ?? "none",
				backgroundColor: TUI_TOKENS.paper,
				color: TUI_TOKENS.ink,
				...(props.viewportRows !== undefined
					? { height: props.viewportRows }
					: {}),
			}}
		>
			{props.children}
		</box>
	);
}

export function InkCard(props: InkCardProps): TuiNode {
	return (
		<box
			id={props.id ?? "surface"}
			role="region"
			className="ink-card"
			style={{
				title: props.title,
				accent: props.accent ?? "none",
				backgroundColor: TUI_TOKENS.paper,
				color: TUI_TOKENS.ink,
				...(props.viewportRows !== undefined
					? { height: props.viewportRows }
					: {}),
			}}
		>
			{props.children}
		</box>
	);
}

export interface StatusStrapProps {
	readonly segments: readonly string[];
}

export function StatusStrap(props: StatusStrapProps): TuiNode {
	return (
		<strap
			id="status-strap"
			role="status"
			className="status-strap"
			style={{ backgroundColor: TUI_TOKENS.ink, color: TUI_TOKENS.paper }}
		>
			{props.segments
				.filter((segment) => segment.length > 0)
				.map((segment) => (
					<text>{segment}</text>
				))}
		</strap>
	);
}

export const SHELL_RAIL_COMMANDS = [
	"dev",
	"templates",
	"btw",
	"hobo",
	"auth",
	"status",
	"help",
] as const;

/**
 * Pinned Agents legend — one fixed line on the command rail (not in scroll body).
 * Keep ≤60 cells so CRT inset still shows every token.
 */
export const AGENTS_KEY_LEGEND =
	"Enter attach · PgUp/Dn scroll · [ ] focus · Ctrl+\\ leave";

export interface AgentPanesProps {
	readonly view: HarnessSessionView;
	readonly empty?: string;
	readonly scroll?: number;
	readonly note?: string;
	/** Keys are forwarded to the focused tmux pane. */
	readonly attached?: boolean;
	/** Glass content width for split column layout. */
	readonly contentWidth?: number;
}

/**
 * Herdr-shaped Agents surface: Session → Tab → Pane, live capture, prompt.
 * Nav keys live in the shell reducer — this component only paints.
 */
export function AgentPanes(props: AgentPanesProps): TuiNode {
	const lines =
		props.view.sessions.length === 0
			? [
					props.empty ??
						"no harness sessions · seat agents (mux) or hobo-code session create",
				]
			: [
					...formatHarnessSessionLines(props.view, {
						...(props.attached !== undefined
							? { attached: props.attached }
							: {}),
						...(props.contentWidth !== undefined
							? { contentWidth: props.contentWidth }
							: {}),
					}),
				];
	if (props.note && props.view.sessions.length > 0 && props.attached !== true) {
		lines.splice(1, 0, props.note);
	}
	return (
		<box
			id="agent-panes"
			role="region"
			className="pane-list"
			scroll={props.scroll ?? 0}
			scrollOrigin="end"
		>
			{lines.map((line) => (
				<text className="pane-line">{line}</text>
			))}
		</box>
	);
}

export interface CommandRailProps {
	readonly commands?: readonly string[];
	/** Raw chips (no `/` prefix). */
	readonly chips?: readonly string[];
	/** Single pinned legend line (Agents). Takes precedence over chips/commands. */
	readonly legend?: string;
}

/** Always-on command dock so slash verbs / Agents keys stay pinned and visible. */
export function CommandRail(props: CommandRailProps): TuiNode {
	if (props.legend !== undefined) {
		return (
			<box
				id="command-rail"
				role="note"
				className="command-rail agents-legend"
				style={{ color: TUI_TOKENS.ink, backgroundColor: TUI_TOKENS.paper }}
			>
				<text className="command-legend">{props.legend}</text>
			</box>
		);
	}
	const chips =
		props.chips ??
		(props.commands ?? SHELL_RAIL_COMMANDS).map((name) => `/${name}`);
	return (
		<box
			id="command-rail"
			role="list"
			className="command-rail"
			style={{ color: TUI_TOKENS.ink, backgroundColor: TUI_TOKENS.paper }}
		>
			{chips.map((label) => (
				<text className="command-chip" role="listitem">
					{label}
				</text>
			))}
		</box>
	);
}

export interface ChatMessage {
	readonly role: "system" | "user" | "assistant" | "product";
	readonly text: string;
}

export interface ChatTranscriptProps {
	readonly messages: readonly ChatMessage[];
	readonly width: number;
	readonly scroll?: number;
	readonly scrollOrigin?: "start" | "end";
}

export function ChatTranscript(props: ChatTranscriptProps): TuiNode {
	return (
		<box
			id="transcript"
			role="region"
			className="transcript"
			scroll={props.scroll ?? 0}
			{...(props.scrollOrigin !== undefined
				? { scrollOrigin: props.scrollOrigin }
				: {})}
		>
			{props.messages.map((message, index) => (
				<box
					id={`message-${index}`}
					role="region"
					className={`message message-${message.role}`}
				>
					{wrapMessage(message, props.width).map((line) => (
						<text>{line}</text>
					))}
				</box>
			))}
		</box>
	);
}

export interface SlashItemView {
	readonly name: string;
	readonly description: string;
}

export interface SlashPaletteProps {
	readonly items: readonly SlashItemView[];
	readonly selectedIndex: number;
}

export function SlashPalette(props: SlashPaletteProps): TuiNode {
	return (
		<box
			id="slash-palette"
			role="list"
			className="slash-palette"
			selectedIndex={props.selectedIndex}
		>
			{props.items.length === 0 ? (
				<text className="slash-empty">{"  (nothing matches that)"}</text>
			) : (
				props.items.map((item, index) => {
					const selected = index === props.selectedIndex;
					return (
						<text
							id={`slash-${item.name}`}
							role="listitem"
							className={selected ? "slash-item selected" : "slash-item"}
							name={item.name}
							selected={selected}
						>{`${selected ? "▸" : " "} /${item.name.padEnd(9)} ${item.description}`}</text>
					);
				})
			)}
		</box>
	);
}

export interface AgentsCatalogRowView {
	readonly id: string;
	readonly label: string;
	readonly depth: number;
	readonly expandable: boolean;
	readonly expanded: boolean;
}

export interface AgentsCatalogProps {
	readonly rows: readonly AgentsCatalogRowView[];
	readonly cursor: number;
	readonly scroll: number;
	readonly viewportRows: number;
}

/** Navigable harness / subagent tree for `/agents`. */
export function AgentsCatalog(props: AgentsCatalogProps): TuiNode {
	const view = Math.max(1, props.viewportRows);
	const slice = props.rows.slice(props.scroll, props.scroll + view);
	return (
		<box
			id="agents-catalog"
			role="tree"
			className="agents-catalog"
			selectedIndex={props.cursor}
		>
			{slice.length === 0 ? (
				<text className="agents-catalog-empty">
					{"  (no harnesses registered)"}
				</text>
			) : (
				slice.map((row, index) => {
					const absolute = props.scroll + index;
					const selected = absolute === props.cursor;
					const indent = "  ".repeat(Math.max(0, row.depth));
					const twisty = row.expandable
						? row.expanded
							? "▾ "
							: "▸ "
						: "· ";
					return (
						<text
							id={`agents-catalog-${row.id}`}
							role="treeitem"
							className={
								selected
									? "agents-catalog-item selected"
									: "agents-catalog-item"
							}
							selected={selected}
						>{`${selected ? "▸" : " "} ${indent}${twisty}${row.label}`}</text>
					);
				})
			)}
		</box>
	);
}

export interface ApprovalChange {
	readonly status: string;
	readonly path: string;
}

export interface ApprovalDialogProps {
	readonly runId: string;
	readonly sandboxRoot: string;
	readonly changes: readonly ApprovalChange[];
	readonly prompt: string;
	readonly scroll?: number;
}

export function ApprovalDialog(props: ApprovalDialogProps): TuiNode {
	return (
		<box
			id="approval"
			role="dialog"
			className="approval"
			runId={props.runId}
			scroll={props.scroll ?? 0}
			scrollOrigin="start"
		>
			<text>The canonical tree is untouched until you say yes.</text>
			<text></text>
			{props.changes.map((change) => (
				<text
					className="change"
					status={change.status}
					path={change.path}
				>{`  ${change.status.padEnd(2)} ${change.path}`}</text>
			))}
			{props.changes.length === 0 ? (
				<text>{"  (no file changes detected in the sandbox)"}</text>
			) : undefined}
			<text></text>
			<text>{`  ${props.prompt}`}</text>
			<text>{`  squash-only, gated, audited · ${props.sandboxRoot}`}</text>
		</box>
	);
}

export interface BtwTurnView {
	readonly role: "user" | "assistant";
	readonly text: string;
}

export interface BtwAsideProps {
	readonly turns: readonly BtwTurnView[];
	readonly parentLatest?: string;
	readonly newFromParent?: number;
	readonly scroll?: number;
}

/** Live overlay side-chat. Tracks the parent thread; does not join it. */
export function BtwAside(props: BtwAsideProps): TuiNode {
	const extra = props.newFromParent ?? 0;
	const kicker =
		extra > 0
			? `btw · live · +${extra} new · Esc dismisses`
			: "btw · live · Esc dismisses";
	return (
		<box
			id="btw-aside"
			role="region"
			className="btw-aside overlay"
			scroll={props.scroll ?? 0}
		>
			<text className="btw-kicker">{kicker}</text>
			{props.parentLatest ? (
				<text className="btw-parent">{`parent · ${props.parentLatest}`}</text>
			) : undefined}
			{props.turns.map((turn, index) => (
				<text
					id={`btw-${index}`}
					className={`btw-turn btw-${turn.role}`}
				>{`${turn.role === "user" ? "you · " : "btw · "}${turn.text}`}</text>
			))}
		</box>
	);
}

export interface InkTableProps {
	readonly id?: string;
	readonly rows: readonly InkTableRow[];
}

/** Two-column label/value table for welcome + occupancy endpoints. */
export function InkTable(props: InkTableProps): TuiNode {
	return (
		<box id={props.id ?? "ink-table"} role="table" className="ink-table">
			{formatInkTable(props.rows)
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => (
					<text className="ink-row">{line}</text>
				))}
		</box>
	);
}

export interface TextPaneProps {
	readonly id: string;
	readonly text: string;
	readonly scroll?: number;
}

export function TextPane(props: TextPaneProps): TuiNode {
	return (
		<box
			id={props.id}
			role="region"
			className="text-pane"
			scroll={props.scroll ?? 0}
			scrollOrigin="start"
		>
			<text>{props.text}</text>
		</box>
	);
}

export interface WelcomeSurfaceProps {
	readonly art?: ChatMessage;
	readonly rows: readonly InkTableRow[];
	readonly rest?: readonly ChatMessage[];
	readonly width: number;
	readonly scroll?: number;
}

/** Welcome art + occupancy table + later chat, one retained surface. */
export function WelcomeSurface(props: WelcomeSurfaceProps): TuiNode {
	return (
		<box
			id="chat-surface"
			role="region"
			className="chat-surface"
			scroll={props.scroll ?? 0}
		>
			{props.art ? (
				<ChatTranscript messages={[props.art]} width={props.width} />
			) : undefined}
			<InkTable id="welcome-table" rows={props.rows} />
			{props.rest && props.rest.length > 0 ? (
				<ChatTranscript messages={props.rest} width={props.width} />
			) : undefined}
		</box>
	);
}

export interface ShellChromeProps {
	readonly title: string;
	readonly accent?: AccentName;
	readonly segments: readonly string[];
	readonly commands?: readonly string[];
	readonly railChips?: readonly string[];
	readonly railLegend?: string;
	readonly viewportRows: number;
	readonly phase?: number;
	readonly overlay?: TuiChild;
	readonly children?: TuiChild;
}

/** Product chrome: broadcast bezel + command rail + inverse strap. */
export function ShellChrome(props: ShellChromeProps): TuiNode {
	return (
		<box id="shell" role="application" className="hobo-shell">
			<BroadcastFrame
				title={props.title}
				{...(props.accent !== undefined ? { accent: props.accent } : {})}
				id="surface"
				viewportRows={props.viewportRows}
				phase={props.phase ?? 0}
			>
				{props.children}
				<CommandRail
					{...(props.railLegend !== undefined
						? { legend: props.railLegend }
						: props.railChips !== undefined
							? { chips: props.railChips }
							: props.commands !== undefined
								? { commands: props.commands }
								: {})}
				/>
				{props.overlay}
			</BroadcastFrame>
			<StatusStrap segments={props.segments} />
		</box>
	);
}
