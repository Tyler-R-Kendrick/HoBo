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

export interface AgentTaskRow {
	readonly summary: string;
	readonly state?: string;
	readonly branch?: string;
	readonly isolation?: string;
}

export interface AgentPaneRow {
	readonly name: string;
	readonly focused?: boolean;
	readonly tasks?: readonly AgentTaskRow[];
}

export interface AgentPanesProps {
	readonly note?: string;
	readonly windows: readonly AgentPaneRow[];
	readonly unclaimed?: readonly AgentTaskRow[];
	readonly capture?: string;
	readonly empty?: string;
	readonly scroll?: number;
	readonly parent?: readonly string[];
}

/** In-session agent windows as a list, not a dumped TextPane blob. */
export function AgentPanes(props: AgentPanesProps): TuiNode {
	const unclaimed = props.unclaimed ?? [];
	if (props.windows.length === 0 && unclaimed.length === 0) {
		return (
			<box
				id="agent-panes"
				role="region"
				className="text-pane pane-list"
				scroll={props.scroll ?? 0}
				scrollOrigin="start"
			>
				<text>
					{props.empty ??
						"no agent panes yet · install a coding CLI on PATH · tmux required"}
				</text>
			</box>
		);
	}
	return (
		<box
			id="agent-panes"
			role="list"
			className="pane-list"
			scroll={props.scroll ?? 0}
			scrollOrigin="start"
		>
			{props.note ? <text className="pane-note">{props.note}</text> : undefined}
			{props.parent && props.parent.length > 0 ? (
				<text className="pane-note">{`parent · ${props.parent.join(" · ")}`}</text>
			) : undefined}
			{props.windows.map((row) => (
				<box role="list" className="agent-group">
					<text
						role="listitem"
						className={row.focused ? "pane-item selected" : "pane-item"}
						selected={row.focused === true}
					>{`${row.focused ? "▸" : " "} ${row.name}`}</text>
					{(row.tasks ?? []).map((task) => (
						<text role="listitem" className="pane-task">
							{formatAgentTask(task)}
						</text>
					))}
					{(row.tasks ?? []).length === 0 ? (
						<text className="pane-task">{"    (no claimed tasks)"}</text>
					) : undefined}
				</box>
			))}
			{unclaimed.length > 0 ? (
				<box role="list" className="agent-group">
					<text role="listitem" className="pane-item">
						{"  unclaimed"}
					</text>
					{unclaimed.map((task) => (
						<text role="listitem" className="pane-task">
							{formatAgentTask(task)}
						</text>
					))}
				</box>
			) : undefined}
			<text></text>
			<text className="pane-capture">
				{props.capture ||
					"(type to steer this subagent · Tab back to chat keeps context)"}
			</text>
		</box>
	);
}

function formatAgentTask(task: AgentTaskRow): string {
	const glyph =
		task.state === "working" || task.state === "captured"
			? "●"
			: task.state === "done" || task.state === "verified"
				? "✓"
				: task.state === "blocked" || task.state === "stale"
					? "▲"
					: "○";
	const extra = [task.branch, task.isolation].filter(Boolean).join(" · ");
	return extra
		? `    ${glyph} ${task.summary} · ${extra}`
		: `    ${glyph} ${task.summary}`;
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
