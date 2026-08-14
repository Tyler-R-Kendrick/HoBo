import { inkCard, statusStripe } from "./rubberhose.js";
import { collectText, type TuiNode } from "./tui-tree.js";

function renderNode(node: TuiNode, width: number): string[] {
	if (node.type === "text" || node.role === "text") {
		return node.text !== undefined
			? [node.text]
			: node.children.flatMap((child) => renderNode(child, width));
	}
	if (node.classList.includes("command-rail")) {
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
		return [` ${chips.join("  ")}`];
	}
	if (node.classList.includes("ink-card")) {
		const body = node.children.flatMap((child) => renderNode(child, width - 3));
		return inkCard(body, {
			width,
			...(node.style.title !== undefined ? { title: node.style.title } : {}),
			...(node.style.accent !== undefined ? { accent: node.style.accent } : {}),
		});
	}
	if (node.type === "strap" || node.classList.includes("status-strap")) {
		return [statusStripe(collectText(node), width)];
	}
	if (node.type === "fragment") {
		return node.children.flatMap((child) => renderNode(child, width));
	}
	return node.children.flatMap((child) => renderNode(child, width));
}

/** Paint a retained TUI tree to a fixed-width frame. */
export function renderTuiTree(node: TuiNode, width: number): string {
	return renderNode(node, width).join("\n");
}
