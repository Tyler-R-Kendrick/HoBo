import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	formatShellCloseout,
	listChatSessions,
	loadChatSession,
	resolveChatSession,
	saveChatSession,
} from "../src/chat-sessions.js";
import {
	createInitialShellState,
	reduceShellKey,
} from "../src/interactive-shell.js";
import { readCurrentSessionContext } from "../src/session-evidence.js";

const temps: string[] = [];
afterEach(() => {
	for (const dir of temps) rmSync(dir, { recursive: true, force: true });
	temps.length = 0;
});

function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-code-chats-"));
	temps.push(dir);
	return dir;
}

describe("interactive chat session store", () => {
	it("saves, lists, and resolves the latest chat for a cwd", () => {
		const home = temp();
		const older = saveChatSession(home, {
			id: "chat-aaa111bbb222",
			cwd: "/proj/a",
			messages: [{ role: "user", text: "older", at: 1 }],
			createdAt: 10,
			updatedAt: 10,
		});
		const newer = saveChatSession(home, {
			id: "chat-ccc333ddd444",
			cwd: "/proj/a",
			messages: [
				{ role: "user", text: "hello world", at: 20 },
				{ role: "assistant", text: "Created hello-world.", at: 21 },
			],
			createdAt: 20,
			updatedAt: 30,
		});
		saveChatSession(home, {
			id: "chat-eee555fff666",
			cwd: "/proj/other",
			messages: [{ role: "user", text: "other cwd", at: 40 }],
			createdAt: 40,
			updatedAt: 50,
		});

		expect(older.id).toBe("chat-aaa111bbb222");
		expect(listChatSessions(home).map((row) => row.id)).toEqual([
			"chat-eee555fff666",
			"chat-ccc333ddd444",
			"chat-aaa111bbb222",
		]);
		expect(loadChatSession(home, "chat-ccc333ddd444")?.messages[0]?.text).toBe(
			"hello world",
		);
		expect(resolveChatSession(home, { cwd: "/proj/a" })?.id).toBe(newer.id);
		expect(resolveChatSession(home, { id: "chat-ccc" })?.id).toBe(newer.id);
		expect(resolveChatSession(home, { id: "missing" })).toBeUndefined();
	});

	it("persists an interactive transcript so resume can find it", () => {
		const home = temp();
		let state = createInitialShellState({
			hoboHome: home,
			cwd: "/proj",
			welcome: false,
		});
		for (const key of "hello") {
			state = reduceShellKey(state, key).state;
		}
		state = reduceShellKey(state, "\r").state;
		expect(state.sessionId).toMatch(/^chat-/u);
		expect(readCurrentSessionContext(home)?.sessionId).toBe(state.sessionId);
		expect(
			resolveChatSession(home, { cwd: "/proj" })?.messages.some(
				(row) => row.text === "hello",
			),
		).toBe(true);
	});

	it("prints a copy-paste resume command for closeout", () => {
		expect(formatShellCloseout("chat-abc123def456")).toBe(
			"hobo-code resume chat-abc123def456",
		);
	});
});
