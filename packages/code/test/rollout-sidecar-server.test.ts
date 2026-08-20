import { describe, expect, it } from "vitest";

import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";
import { startRolloutSidecar } from "../src/rollout-sidecar-server.js";

const canary = {
	name: "canary",
	flag: "feat-x",
	traffic: "flag-only" as const,
	autoRollback: false,
	stages: [{ percent: 10 }, { percent: 100 }],
};

describe("Station OpenDelivery sidecar", () => {
	it("hosts the real engine next to the Station and drives start/step/promote/rollback", async () => {
		const server = await startRolloutSidecar({ port: 0 });
		try {
			expect(server.url).toMatch(/rollout\.code\..*\.hobo\.localhost/);
			expect(server.url).not.toMatch(/127\.0\.0\.1/);
			const origin = loopbackFetchUrl(server.url);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const health = (await (await fetch(origin)).json()) as {
				name: string;
				hosting: string;
				port: string;
				live: boolean;
				fidelity: string;
				engine: string;
			};
			expect(health).toMatchObject({
				name: "rollout",
				hosting: "station",
				port: "hobo:delivery",
				live: true,
				fidelity: "real",
				engine: "OpenDeliveryEngine",
			});

			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const started = (await (
				await fetch(new URL("/rollouts", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(canary),
				})
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { id: string; status: string; percent: number };
			expect(started.status).toBe("running");
			expect(started.percent).toBe(10);

			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const stepped = (await (
				await fetch(new URL(`/rollouts/${started.id}/step`, origin), {
					method: "POST",
				})
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { status: string; percent: number };
			expect(stepped.status).toBe("running");
			expect(stepped.percent).toBe(100);

			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const promoted = (await (
				await fetch(new URL(`/rollouts/${started.id}/promote`, origin), {
					method: "POST",
				})
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { status: string; percent: number };
			expect(promoted.status).toBe("promoted");
			expect(promoted.percent).toBe(100);

			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const second = (await (
				await fetch(new URL("/rollouts", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ ...canary, name: "abort-me" }),
				})
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { id: string };
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const rolled = (await (
				await fetch(new URL(`/rollouts/${second.id}/rollback`, origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ operator: true }),
				})
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { status: string };
			expect(rolled.status).toBe("rolled_back");

			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const listed = (await (
				await fetch(new URL("/rollouts", origin))
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { rollouts: readonly { status: string }[] };
			expect(listed.rollouts.map((row) => row.status).sort()).toEqual([
				"promoted",
				"rolled_back",
			]);
		} finally {
			await server.close();
		}
	});

	it("rejects a mocked-looking policy that is not a real rollout", async () => {
		const server = await startRolloutSidecar({ port: 0 });
		try {
			const response = await fetch(
				new URL("/rollouts", loopbackFetchUrl(server.url)),
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "nope" }),
				},
			);
			expect(response.status).toBe(400);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await response.json()) as { ok: boolean; code?: string };
			expect(body.ok).toBe(false);
			expect(body.code).toBe("rollout-policy-invalid");
		} finally {
			await server.close();
		}
	});
});
