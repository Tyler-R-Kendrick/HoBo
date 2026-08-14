import type { AccentName } from "./rubberhose.js";
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

export interface CommandRailProps {
	readonly commands?: readonly string[];
}

/** Always-on command dock so slash verbs are visible, not just typed. */
export function CommandRail(props: CommandRailProps): TuiNode {
	const commands = props.commands ?? SHELL_RAIL_COMMANDS;
	return (
		<box
			id="command-rail"
			role="list"
			className="command-rail"
			style={{ color: TUI_TOKENS.ink, backgroundColor: TUI_TOKENS.paper }}
		>
			{commands.map((name) => (
				<text className="command-chip" role="listitem">{`/${name}`}</text>
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
}

export function ChatTranscript(props: ChatTranscriptProps): TuiNode {
	return (
		<box
			id="transcript"
			role="region"
			className="transcript"
			scroll={props.scroll ?? 0}
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

export interface ApprovalChange {
	readonly status: string;
	readonly path: string;
}

export interface ApprovalDialogProps {
	readonly runId: string;
	readonly sandboxRoot: string;
	readonly changes: readonly ApprovalChange[];
	readonly prompt: string;
}

export function ApprovalDialog(props: ApprovalDialogProps): TuiNode {
	return (
		<box id="approval" role="dialog" className="approval" runId={props.runId}>
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
}

/** Live overlay side-chat. Tracks the parent thread; does not join it. */
export function BtwAside(props: BtwAsideProps): TuiNode {
	const extra = props.newFromParent ?? 0;
	const kicker =
		extra > 0
			? `btw · live · +${extra} new · Esc dismisses`
			: "btw · live · Esc dismisses";
	return (
		<box id="btw-aside" role="region" className="btw-aside overlay">
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
		<box
			id={props.id ?? "ink-table"}
			role="table"
			className="ink-table"
		>
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
}

export function TextPane(props: TextPaneProps): TuiNode {
	return (
		<box id={props.id} role="region" className="text-pane">
			<text>{props.text}</text>
		</box>
	);
}

export interface ShellChromeProps {
	readonly title: string;
	readonly accent?: AccentName;
	readonly segments: readonly string[];
	readonly commands?: readonly string[];
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
					{...(props.commands !== undefined
						? { commands: props.commands }
						: {})}
				/>
				{props.overlay}
			</BroadcastFrame>
			<StatusStrap segments={props.segments} />
		</box>
	);
}
