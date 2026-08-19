import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripSgr as plain } from "../src/ansi.js";
import {
	answerBtw,
	captureBtwSnapshot,
	isBtwDismiss,
	matchBtwInput,
} from "../src/btw.js";
import {
	appendAssistant,
	buildShellTree,
	createInitialShellState,
	DEFAULT_SLASH_ITEMS,
	reduceShellKey,
	renderShellFrame,
	slashItemForInput,
} from "../src/interactive-shell.js";
import { findDescendantById, query } from "../src/tui-tree.js";

const overlayFixture = join(
	dirname(fileURLToPath(import.meta.url)),
	"visual",
	"shell-btw-overlay.tui.txt",
);

describe("btw side-chat", () => {
	it("matches btw / /btw prefixes and dismiss words", () => {
		expect(matchBtwInput("btw what's going on")).toEqual({
			question: "what's going on",
		});
		expect(matchBtwInput("/btw what are you doing")).toEqual({
			question: "what are you doing",
		});
		expect(matchBtwInput("btw")).toEqual({ question: "" });
		expect(matchBtwInput("/btw")).toEqual({ question: "" });
		expect(matchBtwInput("create a hello world app")).toBeUndefined();
		expect(isBtwDismiss("done")).toBe(true);
		expect(isBtwDismiss("never mind")).toBe(true);
		expect(isBtwDismiss("what's going on")).toBe(false);
	});

	it("answers from a borrowed snapshot without inventing work", () => {
		const snapshot = captureBtwSnapshot({
			focus: "chat",
			agentState: "working",
			stationLabel: "station:local",
			envLabel: "env:local-dev",
			modelLabel: "engine:none",
			usageLabel: "",
			slashOpen: false,
			messages: [
				{ role: "user", text: "run it" },
				{ role: "assistant", text: "bindle · http://127.0.0.1:48211/" },
			],
		});
		const now = answerBtw(snapshot, "what's going on");
		expect(now).toMatch(/working/);
		expect(now).toMatch(/station:local/);
		expect(now).toMatch(/run it/);
		expect(now).toMatch(/127\.0\.0\.1:48211/);
		expect(answerBtw(snapshot, "what did I just say")).toMatch(/run it/);
		const other = answerBtw(snapshot, "create a hello world app");
		expect(other).toMatch(/will not run/);
		expect(other).not.toMatch(/src\/bindle/);
	});

	it("opens a temporary aside that does not join the main transcript", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const before = state.messages.length;
		for (const key of "btw what's going on") {
			state = reduceShellKey(state, key).state;
		}
		state = reduceShellKey(state, "\r").state;
		expect(state.messages).toHaveLength(before);
		expect(state.btw?.turns.some((turn) => turn.role === "user")).toBe(true);
		expect(state.btw?.turns.some((turn) => turn.role === "assistant")).toBe(
			true,
		);
		expect(state.focus).toBe("btw");
		const tree = buildShellTree(state);
		expect(findDescendantById(tree, "btw-aside")?.id).toBe("btw-aside");
		expect(query(tree, ".btw-aside")).toBeDefined();
		expect(findDescendantById(tree, "transcript")?.id).toBe("transcript");
		expect(plain(renderShellFrame(state))).toMatch(/btw/);
		expect(plain(renderShellFrame(state))).toMatch(/live|Esc/i);

		state = reduceShellKey(state, "\u001b").state;
		expect(state.btw).toBeNull();
		expect(state.focus).toBe("chat");
		expect(
			findDescendantById(buildShellTree(state), "btw-aside"),
		).toBeUndefined();
	});

	it("answers from live parent updates after the aside opens", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		for (const key of "btw what's going on") {
			state = reduceShellKey(state, key).state;
		}
		state = reduceShellKey(state, "\r").state;
		const originCount = state.btw?.originMessageCount ?? 0;
		expect(originCount).toBe(state.messages.length);

		state = appendAssistant(state, "Created hello-world bindle.");
		expect(
			state.messages.some((message) => /hello-world/u.test(message.text)),
		).toBe(true);
		expect(state.btw).not.toBeNull();
		expect(state.btw?.snapshot.lastAssistant).toMatch(/hello-world/);
		expect(state.btw?.snapshot.messageCount).toBeGreaterThan(originCount);

		for (const key of "what did you just do") {
			state = reduceShellKey(state, key).state;
		}
		state = reduceShellKey(state, "\r").state;
		const lastAside = [...(state.btw?.turns ?? [])]
			.reverse()
			.find((turn) => turn.role === "assistant");
		expect(lastAside?.text).toMatch(/hello-world/);
		expect(
			state.messages.some((message) => message.text.includes("hello-world")),
		).toBe(true);
	});

	it("paints btw as an overlay so the parent thread stays visible", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			messages: [
				{
					role: "user",
					text: "make a hello world app",
					at: 1,
				},
				{
					role: "assistant",
					text: "Created hello-world.",
					at: 2,
				},
			],
		};
		for (const key of "btw what's going on") {
			state = reduceShellKey(state, key).state;
		}
		state = reduceShellKey(state, "\r").state;
		const tree = buildShellTree(state);
		expect(findDescendantById(tree, "transcript")?.id).toBe("transcript");
		expect(findDescendantById(tree, "btw-aside")?.id).toBe("btw-aside");
		expect(query(tree, ".overlay")).toBeDefined();
		const frame = plain(renderShellFrame(state));
		mkdirSync(dirname(overlayFixture), { recursive: true });
		writeFileSync(overlayFixture, `${frame}\n`, "utf8");
		expect(frame).toMatch(/hello world/i);
		expect(frame).toMatch(/btw/);
		expect(frame).toMatch(/live/i);
		const overlay = findDescendantById(tree, "btw-aside");
		expect(overlay?.classList).toContain("overlay");
	});

	it("exposes /btw on the slash palette", () => {
		expect(DEFAULT_SLASH_ITEMS.some((item) => item.name === "btw")).toBe(true);
		expect(slashItemForInput("/btw what's going on")?.action).toBe("btw");
	});
});
