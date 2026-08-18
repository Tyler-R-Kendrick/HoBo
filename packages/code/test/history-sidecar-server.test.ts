import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startHistorySidecar } from "../src/history-sidecar-server.js";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

describe("history sidecar", () => {
	it("serves search, aliases, and env from Station SQLite", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-history-"));
		homes.push(hoboHome);
		const server = await startHistorySidecar({
			hoboHome,
			stationId: "station:local",
			environment: "local-dev",
			port: 0,
		});
		try {
			expect(server.url).toMatch(/history\.code\..*\.hobo\.localhost/);
			const origin = loopbackFetchUrl(server.url);
			const health = (await (await fetch(origin)).json()) as {
				name: string;
				hosting: string;
				live: boolean;
			};
			expect(health).toMatchObject({
				name: "history",
				hosting: "station",
				live: true,
			});
			const created = await fetch(new URL("/commands", origin), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					command: "hobo-code status",
					cwd: "/tmp/app",
					sessionId: "s1",
					outcome: { exitCode: 0, durationMs: 4 },
				}),
			});
			expect(created.status).toBe(201);
			const listed = (await (
				await fetch(new URL("/commands?q=status", origin))
			).json()) as { commands: { command: string }[] };
			expect(listed.commands[0]?.command).toBe("hobo-code status");
			await fetch(new URL("/aliases/gs", origin), {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ body: "git status" }),
			});
			const aliases = (await (
				await fetch(new URL("/aliases", origin))
			).json()) as {
				aliases: { name: string }[];
			};
			expect(aliases.aliases.map((row) => row.name)).toEqual(["gs"]);
			const denied = await fetch(new URL("/env/TOKEN", origin), {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ value: "ghp_aaa111222333444555666777888" }),
			});
			expect(denied.status).toBe(400);
		} finally {
			await server.close();
		}
	});
});
