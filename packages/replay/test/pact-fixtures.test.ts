import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("PACT contracts present", () => {
	it("tracker→ingest pact has kill-switch interaction", () => {
		const pact = JSON.parse(
			readFileSync(
				join(root, "contracts/pacts/replay-tracker-ingest.pact.json"),
				"utf8",
			),
		);
		expect(pact.consumer.name).toBe("@hobo/replay-tracker");
		expect(
			pact.interactions.some((i: { description: string }) =>
				i.description.includes("kill switch"),
			),
		).toBe(true);
	});

	it("player→store pact has station boundary interaction", () => {
		const pact = JSON.parse(
			readFileSync(
				join(root, "contracts/pacts/replay-player-store.pact.json"),
				"utf8",
			),
		);
		expect(pact.consumer.name).toBe("@hobo/replay-player");
		expect(
			pact.interactions.some(
				(i: { response: { body: { code?: string } } }) =>
					i.response.body?.code === "REPLAY_STATION_BOUNDARY",
			),
		).toBe(true);
	});
});
