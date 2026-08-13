import type { AccentName } from "./rubberhose.js";
import { TUI_TOKENS } from "./tui-tokens.js";
import { h, type TuiChild, type TuiNode } from "./tui-tree.js";

export interface InkCardProps {
	readonly id?: string;
	readonly title: string;
	readonly accent?: AccentName;
	readonly children?: TuiChild;
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

export interface ShellChromeProps {
	readonly title: string;
	readonly accent?: AccentName;
	readonly body: readonly string[];
	readonly segments: readonly string[];
	readonly commands?: readonly string[];
}

/** Product chrome: ink card + command rail + inverse strap. */
export function ShellChrome(props: ShellChromeProps): TuiNode {
	return (
		<box id="shell" role="application" className="hobo-shell">
			<InkCard
				title={props.title}
				{...(props.accent !== undefined ? { accent: props.accent } : {})}
				id="surface"
			>
				{props.body.map((row) => (
					<text>{row}</text>
				))}
				<CommandRail
					{...(props.commands !== undefined
						? { commands: props.commands }
						: {})}
				/>
			</InkCard>
			<StatusStrap segments={props.segments} />
		</box>
	);
}
