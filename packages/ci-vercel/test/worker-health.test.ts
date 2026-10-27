import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresWorkerHealth } from "../src/worker-health.js";

describe("deployment-scoped worker health", () => {
	it("isolates writes and readiness reads from older deployments", async () => {
		const pool = new pg.Pool();
		const query = vi.spyOn(pool, "query").mockImplementation(async () => ({
			command: "SELECT",
			rowCount: 1,
			oid: 0,
			fields: [],
			rows: [{ count: "4" }],
		}));
		try {
			const current = new PostgresWorkerHealth(pool, "dpl_current");
			const old = new PostgresWorkerHealth(pool, "dpl_previous");
			await old.mark("repair", false);
			await current.mark("repair", true);
			expect(await current.ready()).toBe(true);
			expect(query.mock.calls[0]?.[1]).toEqual(["dpl_previous:repair", false]);
			expect(query.mock.calls[1]?.[1]).toEqual(["dpl_current:repair", true]);
			expect(query.mock.calls[2]?.[1]).toEqual([
				[
					"dpl_current:queue",
					"dpl_current:schedule",
					"dpl_current:repair-deliveries",
					"dpl_current:repair-queued",
				],
				["dpl_current:repair-deliveries", "dpl_current:repair-queued"],
				"dpl_current:repair",
			]);
		} finally {
			query.mockRestore();
			await pool.end();
		}
	});
	it("rejects malformed deployment IDs and preserves the local development namespace", async () => {
		const pool = new pg.Pool();
		const query = vi.spyOn(pool, "query").mockImplementation(async () => ({
			command: "SELECT",
			rowCount: 1,
			oid: 0,
			fields: [],
			rows: [{ count: "4" }],
		}));
		try {
			expect(() => new PostgresWorkerHealth(pool, "dpl_bad:repair")).toThrow(
				"invalid worker deployment ID",
			);
			await new PostgresWorkerHealth(pool).mark("queue", true);
			expect(query.mock.calls[0]?.[1]).toEqual(["queue", true]);
		} finally {
			query.mockRestore();
			await pool.end();
		}
	});
});
