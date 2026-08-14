import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openSessionShellStore } from "../src/session-shell-store.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

function store() {
	const home = mkdtempSync(join(tmpdir(), "hobo-shell-"));
	homes.push(home);
	return openSessionShellStore({
		hoboHome: home,
		stationId: "station:local",
		environment: "local-dev",
	});
}

describe("session shell store", () => {
	it("records commands and ranks same-cwd recency over older hits", () => {
		const db = store();
		db.recordCommand({
			sessionId: "s1",
			actor: {
				kind: "human",
				name: "dana",
				instanceId: "i1",
				generation: 1,
			},
			cwd: "/tmp/app",
			command: "pnpm test",
			outcome: { exitCode: 0, durationMs: 12 },
			recordedAt: "2026-01-01T00:00:00.000Z",
		});
		db.recordCommand({
			sessionId: "s1",
			actor: {
				kind: "agent",
				name: "bo",
				instanceId: "i2",
				generation: 3,
			},
			cwd: "/tmp/app",
			command: "pnpm test --filter @hobo/code",
			outcome: { exitCode: 1, durationMs: 40 },
			recordedAt: "2026-08-14T00:00:00.000Z",
		});
		const hits = db.search({ q: "pnpm", cwd: "/tmp/app" });
		expect(hits[0]?.command).toBe("pnpm test --filter @hobo/code");
		expect(hits[0]?.actor.kind).toBe("agent");
		expect(hits[0]?.trust).toBe("hobo-executed");
		const failed = db.search({ q: "pnpm", failedOnly: true });
		expect(failed).toHaveLength(1);
		expect(failed[0]?.outcome?.exitCode).toBe(1);
		db.close();
	});

	it("redacts secrets on record and never stores the material", () => {
		const db = store();
		const row = db.recordCommand({
			sessionId: "s1",
			actor: {
				kind: "human",
				name: "dana",
				instanceId: "i1",
				generation: 1,
			},
			cwd: "/tmp",
			command: "export TOKEN=ghp_aaa111222333444555666777888",
		});
		expect(row.sensitivity).toBe("secret-suspected");
		expect(row.command).not.toContain("ghp_");
		expect(db.search({ q: "TOKEN" })[0]?.command).not.toContain("ghp_");
		db.close();
	});

	it("stores aliases and env vars and exports a shell snippet", () => {
		const db = store();
		db.setAlias("gs", "git status");
		db.setEnv("HOBO_THEME", "ink");
		expect(db.listAliases()).toEqual([
			expect.objectContaining({ name: "gs", body: "git status" }),
		]);
		expect(db.listEnv()).toEqual([
			expect.objectContaining({ name: "HOBO_THEME", value: "ink" }),
		]);
		const sh = db.exportDotfiles("bash");
		expect(sh).toContain("alias gs='git status'");
		expect(sh).toContain("export HOBO_THEME='ink'");
		db.removeAlias("gs");
		db.removeEnv("HOBO_THEME");
		expect(db.listAliases()).toEqual([]);
		expect(db.listEnv()).toEqual([]);
		db.close();
	});

	it("refuses secret alias and env values", () => {
		const db = store();
		expect(() => db.setAlias("tok", "export TOKEN=ghp_aaa")).toThrow(/secret/i);
		expect(() => db.setEnv("TOKEN", "ghp_aaa111222333444555666777888")).toThrow(
			/secret/i,
		);
		db.close();
	});
});
