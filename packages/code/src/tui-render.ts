import { fitCells, inkCard, statusStripe } from "./rubberhose.js";
import { BROADCAST_INNER_INSET, broadcastFrame } from "./tui-broadcast.js";
import {
	blitBlock,
	centerLine,
	padLines,
	windowAround,
	wrapText,
} from "./tui-layout.js";
import { collectText, type TuiNode } from "./tui-tree.js";

function renderNode(node: TuiNode, width: number, height?: number): string[] {
	if (node.type === "text" || node.role === "text") {
		return node.text !== undefined
			? [node.text]
			: node.children.flatMap((child) => renderNode(child, width));
	}
	if (node.classList.includes("command-rail")) {
		if (node.classList.includes("agents-legend")) {
			const legend = node.children
				.flatMap((child) => collectText(child))
				.join(" ")
				.trim();
			if (legend.length <= width) return [centerLine(legend, width)];
			return [legend.slice(0, Math.max(0, width - 1)) + "…"];
		}
		const chips: string[] = [];
		let used = 1;
		for (const name of node.children.flatMap((child) => collectText(child))) {
			if (name.length === 0) continue;
			const chip = `[ ${name} ]`;
			const next = used + (chips.length === 0 ? 0 : 2) + chip.length;
			if (next > width) break;
			chips.push(chip);
			used = next;
		}
		return [centerLine(chips.join("  "), width)];
	}
	const scrollOf = (target: TuiNode): number =>
		typeof target.props.scroll === "number" ? target.props.scroll : 0;
	const originOf = (target: TuiNode): "end" | "start" =>
		target.props.scrollOrigin === "start" ? "start" : "end";
	if (
		node.classList.includes("ink-card") ||
		node.classList.includes("broadcast-frame")
	) {
		const viewport = node.style.height ?? height;
		const inset = node.classList.includes("broadcast-frame")
			? BROADCAST_INNER_INSET
			: 3;
		const rail = node.children.filter((child) =>
			child.classList.includes("command-rail"),
		);
		const overlays = node.children.filter((child) =>
			child.classList.includes("overlay"),
		);
		const rest = node.children.filter(
			(child) =>
				!child.classList.includes("command-rail") &&
				!child.classList.includes("overlay"),
		);
		const innerWidth = width - inset;
		const body = rest.flatMap((child) =>
			renderNode(child, innerWidth, viewport),
		);
		let padded = viewport === undefined ? body : padLines(body, viewport);
		if (overlays.length > 0) {
			const glass = viewport ?? padded.length;
			const cardWidth = Math.min(
				42,
				Math.max(24, Math.floor(innerWidth * 0.58)),
			);
			const raw = overlays.flatMap((child) =>
				renderNode(child, Math.max(12, cardWidth - 2)),
			);
			const maxBody = Math.max(3, glass - 4);
			const overlayScroll = overlays.reduce(
				(max, child) => Math.max(max, scrollOf(child)),
				0,
			);
			const card = inkCard(padLines(raw, maxBody, overlayScroll, "end"), {
				width: cardWidth,
				title: "btw",
			});
			const clipped =
				card.length > glass ? card.slice(card.length - glass) : card;
			const col = Math.max(0, innerWidth - cardWidth);
			const row = Math.max(0, padded.length - clipped.length);
			padded = blitBlock(padded, clipped, row, col, innerWidth);
		}
		const railLines = rail.flatMap((child) => renderNode(child, innerWidth));
		const chrome = {
			width,
			...(node.style.title !== undefined ? { title: node.style.title } : {}),
			...(node.style.accent !== undefined ? { accent: node.style.accent } : {}),
		};
		if (node.classList.includes("broadcast-frame")) {
			const phase = typeof node.props.phase === "number" ? node.props.phase : 0;
			return broadcastFrame([...padded, ...railLines], { ...chrome, phase });
		}
		return inkCard([...padded, ...railLines], chrome);
	}
	if (node.classList.includes("transcript")) {
		const lines: string[] = [];
		for (const child of node.children) {
			lines.push(...renderNode(child, width));
			lines.push("");
		}
		return height === undefined
			? lines
			: padLines(lines, height, scrollOf(node), originOf(node));
	}
	if (node.classList.includes("slash-palette")) {
		const items = node.children.flatMap((child) => renderNode(child, width));
		const selected =
			typeof node.props.selectedIndex === "number"
				? node.props.selectedIndex
				: 0;
		if (height === undefined) return items;
		return [...windowAround(items, height, selected).lines];
	}
	if (node.classList.includes("approval")) {
		const lines = node.children.flatMap((child) => renderNode(child, width));
		return height === undefined
			? lines
			: padLines(lines, height, scrollOf(node), "start");
	}
	if (node.classList.includes("ink-table")) {
		const lines = node.children.flatMap((child) => renderNode(child, width));
		return height === undefined ? lines : padLines(lines, height);
	}
	if (node.classList.includes("chat-surface")) {
		const lines = node.children.flatMap((child) => renderNode(child, width));
		return height === undefined
			? lines
			: padLines(lines, height, scrollOf(node), originOf(node));
	}
	if (node.classList.includes("btw-aside")) {
		const lines = node.children.flatMap((child) =>
			wrapText(collectText(child).join(" "), width),
		);
		if (node.classList.includes("overlay")) return lines;
		return height === undefined ? lines : padLines(lines, height);
	}
	if (node.classList.includes("pane-list")) {
		const lines = node.children.flatMap((child) =>
			renderNode(child, width).flatMap((line) => {
				// Pre-shaped split / capture rows — fitCells only. wrapText would
				// break │ columns when a line is one cell over the glass width.
				return [fitCells(line, width)];
			}),
		);
		return height === undefined
			? lines
			: padLines(lines, height, scrollOf(node), originOf(node));
	}
	if (node.classList.includes("text-pane")) {
		const lines = wrapText(collectText(node).join("\n"), width);
		return height === undefined
			? lines
			: padLines(lines, height, scrollOf(node), originOf(node));
	}
	if (node.type === "strap" || node.classList.includes("status-strap")) {
		return [statusStripe(collectText(node), width)];
	}
	if (node.type === "fragment") {
		return node.children.flatMap((child) => renderNode(child, width, height));
	}
	return node.children.flatMap((child) => renderNode(child, width, height));
}

/** Paint a retained TUI tree to a fixed-width frame. */
export function renderTuiTree(node: TuiNode, width: number): string {
	return renderNode(node, width).join("\n");
}
