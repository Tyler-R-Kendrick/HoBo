import { describe, expect, it, vi } from "vitest";
import {
	validateDirectDatabaseUrl,
	verifyRepairDatabase,
	withRepairPool,
} from "../src/database-connections.js";

describe("repair PostgreSQL connections", () => {
	it.each([
		"BEGIN",
		"ROLLBACK",
		"DELETE",
	])("discards the primary session after an uncertain %s failure", async (phase) => {
		const client = {
			query: vi.fn(async (sql: string) => {
				if (
					sql === phase ||
					(phase === "DELETE" &&
						sql.startsWith("DELETE FROM hobo_ci_database_probes WHERE id"))
				)
					throw new Error("connection lost");
				if (phase === "ROLLBACK" && sql.includes("pg_advisory_xact_lock"))
					throw new Error("query failed");
				return {
					rows: sql.startsWith("SELECT current_database")
						? [{ database: "ci", username: "owner" }]
						: [],
					rowCount: 1,
				};
			}),
			release: vi.fn(),
		};
		const direct = {
			query: vi.fn(async () => ({
				rows: [{ database: "ci", username: "owner" }],
				rowCount: 1,
			})),
		};
		await expect(
			verifyRepairDatabase({ connect: async () => client }, direct),
		).rejects.toThrow();
		expect(client.release).toHaveBeenCalledWith(true);
	});
	it("closes the temporary direct pool after success and failure", async () => {
		const success = { end: vi.fn(async () => {}) };
		await expect(withRepairPool(success, async () => "ok")).resolves.toBe("ok");
		expect(success.end).toHaveBeenCalledOnce();
		const failure = { end: vi.fn(async () => {}) };
		await expect(
			withRepairPool(failure, async () => {
				throw new Error("repair failed");
			}),
		).rejects.toThrow("repair failed");
		expect(failure.end).toHaveBeenCalledOnce();
	});

	it("requires an explicit direct endpoint and rejects Neon's pooler", () => {
		expect(() => validateDirectDatabaseUrl(undefined)).toThrow(
			"DATABASE_URL_UNPOOLED",
		);
		expect(() =>
			validateDirectDatabaseUrl(
				"postgresql://db:password@ep-name-pooler.us-east-1.aws.neon.tech/db",
			),
		).toThrow("direct PostgreSQL URL");
		for (const host of [
			"ep-name%2Dpooler.us-east-1.aws.neon.tech",
			"ep-name-pooler.us-east-1.aws.neon.tech.",
		])
			expect(() =>
				validateDirectDatabaseUrl(`postgresql://db:password@${host}/db`),
			).toThrow("direct PostgreSQL URL");
		expect(() =>
			validateDirectDatabaseUrl(
				"postgresql://db:password@db.example/db?host=other",
			),
		).toThrow("direct PostgreSQL URL");
		expect(
			validateDirectDatabaseUrl(
				"postgresql://db:password@ep-name.us-east-1.aws.neon.tech/db",
			),
		).toContain("ep-name.us-east-1.aws.neon.tech");
	});

	it("commits a unique marker and removes it after confirming the same database and role", async () => {
		const calls: string[] = [];
		let marker: unknown;
		const client = {
			query: vi.fn(async (sql: string, values?: unknown[]) => {
				calls.push(sql);
				if (sql.startsWith("INSERT INTO hobo_ci_database_probes"))
					marker = values?.[0];
				return {
					rows: sql.startsWith("SELECT current_database")
						? [{ database: "ci", username: "owner" }]
						: [],
					rowCount: 1,
				};
			}),
			release: vi.fn(),
		};
		const direct = {
			query: vi.fn(async (_sql: string, values?: unknown[]) => ({
				rows:
					values?.[0] === marker ? [{ database: "ci", username: "owner" }] : [],
				rowCount: values?.[0] === marker ? 1 : 0,
			})),
		};
		await verifyRepairDatabase({ connect: async () => client }, direct);
		expect(calls.indexOf("COMMIT")).toBeLessThan(
			calls.findIndex((sql) =>
				sql.startsWith("DELETE FROM hobo_ci_database_probes WHERE id"),
			),
		);
		expect(direct.query).toHaveBeenCalledWith(expect.any(String), [marker]);
		expect(client.release).toHaveBeenCalledOnce();
	});

	it.each([
		"different database",
		"different role",
		"direct query error",
	])("fails closed and cleans the marker on %s", async (scenario) => {
		const client = {
			query: vi.fn(async (sql: string) => ({
				rows: sql.startsWith("SELECT current_database")
					? [{ database: "ci", username: "owner" }]
					: [],
				rowCount: 1,
			})),
			release: vi.fn(),
		};
		const direct = {
			query: vi.fn(async () => {
				if (scenario === "direct query error") throw new Error("unavailable");
				return {
					rows:
						scenario === "different database"
							? []
							: [{ database: "ci", username: "other" }],
					rowCount: scenario === "different database" ? 0 : 1,
				};
			}),
		};
		await expect(
			verifyRepairDatabase({ connect: async () => client }, direct),
		).rejects.toThrow();
		expect(client.query).toHaveBeenCalledWith(
			"DELETE FROM hobo_ci_database_probes WHERE id = $1",
			[expect.any(String)],
		);
		expect(client.release).toHaveBeenCalledOnce();
	});
});
