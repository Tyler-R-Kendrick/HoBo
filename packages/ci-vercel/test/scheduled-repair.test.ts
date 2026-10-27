import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createScheduledRepairHandler } from "../src/scheduled-repair.js";
import { createHostedWorker } from "../src/worker.js";

const secret = "secret-for-our-cron-needs-32-bytes";
const request = (authorization?: string, method = "GET") =>
	new Request("https://relay.example/internal/tick", {
		method,
		headers: authorization ? { authorization } : {},
	});

describe("scheduled repair", () => {
	it("does not configure an unauthenticated Vercel Cron target", async () => {
		const config = JSON.parse(
			await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
		);
		expect(config.crons).toBeUndefined();
		expect(config.schedules).toBeUndefined();
	});
	it("requires a sufficiently strong secret and rejects unauthorized requests", async () => {
		const enqueue = vi.fn(async () => {});
		expect(() =>
			createScheduledRepairHandler({ secret: "short", enqueue }),
		).toThrow();
		const handler = createScheduledRepairHandler({ secret, enqueue });
		for (const bad of [
			request(),
			request("Bearer wrong"),
			request(`Bearer ${secret}`, "POST"),
		])
			expect((await handler(bad)).status).toBe(403);
		expect(enqueue).not.toHaveBeenCalled();
	});
	it("enqueues authenticated repair and reports queue failure for later retry", async () => {
		const enqueue = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("unavailable"));
		const handler = createScheduledRepairHandler({ secret, enqueue });
		expect((await handler(request(`Bearer ${secret}`))).status).toBe(204);
		expect((await handler(request(`Bearer ${secret}`))).status).toBe(503);
		expect(enqueue).toHaveBeenCalledTimes(2);
	});
	it("records schedule and repair health only after the private consumer succeeds", async () => {
		const marks: [string, boolean][] = [];
		const worker = createHostedWorker({
			tick: async () => {},
			repair: async () => ({ truncated: false, more: false }),
			continueRepair: async () => {},
			health: {
				mark: async (component, ok) => {
					marks.push([component, ok]);
				},
				ready: async () => true,
			},
		});
		let queued = false;
		const handler = createScheduledRepairHandler({
			secret,
			enqueue: async () => {
				queued = true;
			},
		});
		expect((await handler(request(`Bearer ${secret}`))).status).toBe(204);
		expect(queued).toBe(true);
		expect(marks).toEqual([]);
		await worker.run({ source: "static", name: "hobo-ci-repair" });
		expect(marks).toEqual([
			["queue", true],
			["repair", true],
			["schedule", true],
		]);
	});
});
