import { describe, expect, it } from "vitest";

import {
	buildShellTree,
	createInitialShellState,
	reduceShellKey,
} from "../src/interactive-shell.js";
import {
	collectText,
	findDescendantById,
	getChildren,
	query,
	queryAll,
} from "../src/tui-tree.js";

describe("hobo-code TUI semantic tree", () => {
	it("exposes a retained, queryable chrome tree", () => {
		const state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const tree = buildShellTree(state);
		expect(tree.role).toBe("application");
		expect(tree.id).toBe("shell");
		expect(findDescendantById(tree, "status-strap")?.role).toBe("status");
		expect(query(tree, ".broadcast-frame")?.style.title).toBe("chat");
		expect(query(tree, "[role=status]")?.id).toBe("status-strap");
		expect(getChildren(tree).map((child) => child.id)).toEqual([
			"surface",
			"status-strap",
		]);
		expect(findDescendantById(tree, "command-rail")?.role).toBe("list");
		const rail = findDescendantById(tree, "command-rail");
		expect(rail).toBeDefined();
		if (rail === undefined) throw new Error("missing command-rail");
		expect(collectText(rail)).toEqual(
			expect.arrayContaining(["/templates", "/dev", "/help"]),
		);
		expect(queryAll(tree, "text").length).toBeGreaterThan(0);
		expect(findDescendantById(tree, "transcript")?.classList).toContain(
			"transcript",
		);
	});

	it("exposes chat messages as queryable controls, not pre-baked card rows", () => {
		const base = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const tree = buildShellTree({
			...base,
			messages: [
				{ role: "user", text: "make a hello world app", at: 1 },
				{ role: "assistant", text: "Created hello-world.", at: 2 },
			],
		});
		expect(query(tree, ".transcript")?.id).toBe("transcript");
		expect(queryAll(tree, ".message-user").length).toBe(1);
		expect(queryAll(tree, ".message-assistant").length).toBe(1);
		const user = query(tree, ".message-user");
		expect(user).toBeDefined();
		if (user === undefined) throw new Error("missing user message");
		expect(collectText(user).join(" ")).toMatch(/make a hello world app/);
		expect(query(tree, ".slash-palette")).toBeUndefined();
		expect(query(tree, "[role=dialog]")).toBeUndefined();
	});

	it("exposes every slash verb as a listitem, with the focused one selected", () => {
		let state = createInitialShellState({
			width: 80,
			height: 14,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "/").state;
		state = reduceShellKey(state, "\x1b[B").state;
		const tree = buildShellTree(state);
		const palette = findDescendantById(tree, "slash-palette");
		expect(palette?.role).toBe("list");
		const items = queryAll(tree, ".slash-item");
		expect(items.length).toBeGreaterThan(8);
		expect(items.some((item) => item.props.name === "help")).toBe(true);
		expect(items.some((item) => item.props.name === "template")).toBe(true);
		const selected = items.find((item) => item.props.selected === true);
		expect(selected?.props.name).toBe("about");
		expect(selected?.classList).toContain("selected");
		expect(query(tree, ".transcript")).toBeUndefined();
	});

	it("exposes the promote gate as a dialog with queryable file rows", () => {
		const base = createInitialShellState({
			width: 90,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const tree = buildShellTree({
			...base,
			pendingApproval: {
				runId: "run-42",
				sandboxRoot: "/tmp/sandbox/run-42",
				changes: [
					{ status: "M", path: "src/a.ts" },
					{ status: "A", path: "src/b.ts" },
				],
			},
		});
		const dialog = query(tree, "[role=dialog]");
		expect(dialog?.id).toBe("approval");
		expect(dialog?.props.runId).toBe("run-42");
		expect(queryAll(tree, ".change").map((row) => row.props.path)).toEqual([
			"src/a.ts",
			"src/b.ts",
		]);
		expect(dialog).toBeDefined();
		if (dialog === undefined) throw new Error("missing approval dialog");
		expect(collectText(dialog).join(" ")).toMatch(/y promote/);
	});

	it("exposes agents only after subagent work, then status and resources", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "\t").state;
		expect(findDescendantById(buildShellTree(state), "status-pane")?.id).toBe(
			"status-pane",
		);
		state = {
			...state,
			focus: "chat",
			agentWork: true,
			livePanes: {
				session: "hobo",
				windows: [{ name: "codex", target: "%1", kind: "coding-agent" }],
				focused: 0,
				capture: "codex ›",
				note: "in-session",
				tmux: true,
			},
		};
		state = reduceShellKey(state, "\t").state;
		expect(findDescendantById(buildShellTree(state), "agent-panes")?.id).toBe(
			"agent-panes",
		);
		state = reduceShellKey(state, "\t").state;
		expect(findDescendantById(buildShellTree(state), "status-pane")?.id).toBe(
			"status-pane",
		);
		state = reduceShellKey(state, "\t").state;
		expect(
			findDescendantById(buildShellTree(state), "resources-pane")?.id,
		).toBe("resources-pane");
	});
});
