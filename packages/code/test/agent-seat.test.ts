import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	codexSeatHome,
	isStaleSeatCapture,
	seatShellCommand,
} from "../src/agent-seat.js";

describe("agent-seat", () => {
	it("wraps Codex with isolated CODEX_HOME under HOBO_HOME", () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-seat-home-"));
		const hobo = join(home, ".hobo");
		mkdirSync(join(home, ".codex"), { recursive: true });
		writeFileSync(join(home, ".codex", "auth.json"), "{}");
		writeFileSync(join(home, ".codex", "config.toml"), "");
		const cmd = seatShellCommand({
			agentId: "codex",
			command: "codex",
			hoboHome: hobo,
			userHome: home,
		});
		expect(cmd).toContain(`CODEX_HOME='${codexSeatHome(hobo)}'`);
		expect(cmd).toContain("mkdir -p");
		expect(cmd).toContain("ln -sfn");
		expect(cmd).toMatch(/codex$/u);
	});

	it("leaves non-Codex commands alone", () => {
		expect(
			seatShellCommand({
				agentId: "pi",
				command: "pi",
				hoboHome: "/tmp/hobo",
				userHome: "/tmp/user",
			}),
		).toBe("pi");
	});

	it("detects stale seat captures that need respawn", () => {
		expect(
			isStaleSeatCapture("Error: failed to start embedded app server\n"),
		).toBe(true);
		expect(isStaleSeatCapture("[codex exited 1 — press enter to close]")).toBe(
			true,
		);
		expect(isStaleSeatCapture(">_ OpenAI Codex (v0.147.0)")).toBe(false);
	});
});
