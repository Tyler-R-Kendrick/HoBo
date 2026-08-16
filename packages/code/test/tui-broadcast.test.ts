import { describe, expect, it } from "vitest";
import { cellWidth } from "../src/rubberhose.js";
import {
	BROADCAST,
	BROADCAST_CHROME_ROWS,
	BROADCAST_INNER_INSET,
	broadcastFrame,
	sprocketBand,
} from "../src/tui-broadcast.js";
import { BroadcastFrame } from "../src/tui-components.js";
import { centerLine } from "../src/tui-layout.js";
import { renderTuiTree } from "../src/tui-render.js";
import { findDescendantById, h, query } from "../src/tui-tree.js";

function plain(value: string): string {
	return value.replace(
		new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
		"",
	);
}

describe("broadcast frame (cartoon CRT / film bezel)", () => {
	it("paints a rounded pixel-ink silhouette, not a decorated unicode box", () => {
		const lines = broadcastFrame(["hello"], { width: 40, title: "chat" });
		const frame = lines.join("\n");
		expect(frame).toContain(BROADCAST.block);
		expect(frame).toContain(BROADCAST.hood);
		expect(frame).toContain(BROADCAST.chin);
		expect(frame).toContain(BROADCAST.glassLeft);
		expect(frame).toContain(BROADCAST.sprocket);
		expect(frame).toContain("chat");
		expect(frame).toContain("hello");
		expect(frame).not.toContain("───");
		expect(frame).not.toContain("---");
		expect(frame).not.toContain("┌");
		expect(frame).not.toContain("─");
		expect(frame).not.toContain("┏");
		expect(frame).not.toMatch(/┃▪┃/);
	});

	it("centres the title plaque in the hood", () => {
		const top = broadcastFrame(["x"], { width: 48, title: "chat" })[0] ?? "";
		const at = top.indexOf("chat");
		expect(at).toBeGreaterThan(0);
		const left = at;
		const right = top.length - at - "chat".length;
		expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
	});

	it("places film perfs symmetrically on the lips", () => {
		const lip = broadcastFrame(["a"], { width: 48, title: "reel" })[1] ?? "";
		const first = lip.indexOf(BROADCAST.sprocket);
		const last = lip.lastIndexOf(BROADCAST.sprocket);
		expect(first).toBeGreaterThan(0);
		expect(last).toBeGreaterThan(first);
		expect(Math.abs(first - (lip.length - 1 - last))).toBeLessThanOrEqual(2);
	});

	it("advances the sprocket phase like a film gate", () => {
		expect(sprocketBand(17, 0)).not.toBe(sprocketBand(17, 1));
		const still = broadcastFrame(["a", "b"], { width: 36, phase: 0 });
		const advanced = broadcastFrame(["a", "b"], { width: 36, phase: 1 });
		expect(still[1]).not.toBe(advanced[1]);
	});

	it("keeps the right glass bezel when body lines carry tmux ANSI", () => {
		const ansi =
			"\x1b[38;2;138;190;183mTrust project folder?\x1b[39m";
		const lines = broadcastFrame([ansi, "plain"], {
			width: 48,
			title: "Pi",
		});
		for (const line of lines) {
			expect(cellWidth(line)).toBe(48);
			const plainLine = plain(line);
			if (plainLine.includes(BROADCAST.glassLeft)) {
				expect(plainLine).toContain(BROADCAST.glassRight);
				expect(plainLine.endsWith("▒") || plainLine.includes("▐█▒")).toBe(
					true,
				);
			}
		}
	});

	it("keeps every line exactly the requested width and a stable row count", () => {
		for (const width of [24, 40, 72, 100]) {
			const lines = broadcastFrame(["short", "a".repeat(200)], {
				width,
				title: "tv",
			});
			for (const line of lines) expect(cellWidth(line)).toBe(width);
			expect(lines.length).toBe(2 + BROADCAST_CHROME_ROWS);
			expect(lines.length).toBe(
				broadcastFrame(["y", "z".repeat(200)], { width, title: "tv" }).length,
			);
		}
	});

	it("drops a hard sticker shadow under the tube, not a soft elevation", () => {
		const lines = broadcastFrame(["body"], { width: 32, title: "on air" });
		expect(lines[lines.length - 1]?.includes("▒")).toBe(true);
		expect(lines[lines.length - 1]?.startsWith("▒")).toBe(false);
	});
});

describe("BroadcastFrame component", () => {
	it("is a queryable chrome control that paints the bezel", () => {
		const tree = BroadcastFrame({
			title: "chat",
			viewportRows: 3,
			children: h("text", { children: "bo" }),
		});
		expect(tree.id).toBe("broadcast-frame");
		expect(tree.classList).toContain("broadcast-frame");
		expect(query(tree, ".broadcast-frame")?.style.title).toBe("chat");
		expect(findDescendantById(tree, "broadcast-frame")?.style.color).toBe(
			"#101010",
		);
		const painted = plain(renderTuiTree(tree, 48));
		expect(painted).toContain(BROADCAST.sprocket);
		expect(painted).toContain("chat");
		expect(painted).toContain(BROADCAST.block);
	});
});

describe("broadcast inset + centering", () => {
	it("reserves glass + sticker columns", () => {
		expect(BROADCAST_INNER_INSET).toBe(6);
	});

	it("centres a short line in a fixed cell width", () => {
		expect(centerLine("bo", 6)).toBe("  bo  ");
		expect(cellWidth(centerLine("hello", 20))).toBe(20);
	});
});
