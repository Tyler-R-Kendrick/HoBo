import { describe, expect, it } from "vitest";

import { compactTranscript, estimateTokens } from "../src/compact.js";
import {
	applyCompact,
	createInitialShellState,
	reduceShellKey,
	slashItemForInput,
} from "../src/interactive-shell.js";

function turns(
	rows: readonly { role: "user" | "assistant" | "product"; text: string }[],
) {
	return rows.map((row, index) => ({ ...row, at: index + 1 }));
}

describe("compact skill", () => {
	it("keeps the last user turns and a deterministic briefing, never invents work", () => {
		const messages = turns([
			{ role: "user", text: "make a hello world app" },
			{
				role: "assistant",
				text: "Created hello-world bindle at src/bindle.ts",
			},
			{ role: "user", text: "run it" },
			{
				role: "assistant",
				text: "dev spawn hobo ENOENT — bindle not loadable",
			},
			{ role: "user", text: "fix the named endpoint" },
			{
				role: "assistant",
				text: "named http://web.hello-world.local.hobo.localhost:48211/",
			},
		]);
		const plan = compactTranscript({
			messages,
			keepUserTurns: 2,
			stationLabel: "station:local",
			envLabel: "env:local-dev",
			focus: "keep the named URL",
		});
		expect(plan.droppedCount).toBeGreaterThan(0);
		expect(plan.working[0]?.role).toBe("product");
		expect(plan.working[0]?.text).toMatch(/compact · /);
		expect(plan.working[0]?.text).toMatch(/Goal/);
		expect(plan.working[0]?.text).toMatch(/hello world/i);
		expect(plan.working[0]?.text).toMatch(/src\/bindle\.ts/);
		expect(plan.working[0]?.text).toMatch(/ENOENT/);
		expect(plan.working[0]?.text).toMatch(/named URL/);
		expect(plan.working[0]?.text).toMatch(/station:local/);
		expect(
			plan.working.some((row) => row.text === "fix the named endpoint"),
		).toBe(true);
		expect(
			plan.working.some((row) => row.text.includes("localhost:48211")),
		).toBe(true);
		expect(
			plan.working.some((row) => row.text === "make a hello world app"),
		).toBe(false);
		expect(plan.working.length).toBeLessThan(plan.journal.length);
		expect(estimateTokens("abcd")).toBe(1);
		expect(slashItemForInput("/compact keep bindle.ts")?.action).toBe(
			"compact",
		);
	});

	it("is a no-drop when the transcript is already short", () => {
		const messages = turns([
			{ role: "user", text: "status" },
			{ role: "assistant", text: "idle" },
		]);
		const plan = compactTranscript({ messages });
		expect(plan.droppedCount).toBe(0);
		expect(plan.working).toEqual(messages);
		expect(plan.briefing).toMatch(/nothing to drop/i);
	});

	it("rewrites the working pane via /compact and keeps the journal", () => {
		let state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const script = [
			"make a hello world app",
			"run it",
			"fix the named endpoint",
		];
		for (const [index, line] of script.entries()) {
			for (const key of line) {
				state = reduceShellKey(state, key).state;
			}
			state = reduceShellKey(state, "\r").state;
			state = {
				...state,
				messages: [
					...state.messages,
					{
						role: "assistant",
						text: `step ${index} src/bindle.ts`,
						at: Date.now(),
					},
				],
				agentState: "idle",
			};
		}
		const before = state.messages.length;
		state = applyCompact(state, "keep bindle.ts");
		expect(state.messages.length).toBeLessThan(before);
		expect(state.messages[0]?.text).toMatch(/compact · /);
		expect(state.messages[0]?.text).toMatch(/bindle\.ts/);
		expect(state.journal?.length).toBe(before);
		expect(
			state.journal?.some((row) => row.text === "make a hello world app"),
		).toBe(true);
	});
});
