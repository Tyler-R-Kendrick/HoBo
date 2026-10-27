import { describe, expect, it, vi } from "vitest";
import { unlockAndRelease } from "../src/postgres-session-lock.js";

describe("PostgreSQL session lock release", () => {
	it("returns a session to the pool only after a confirmed unlock", async () => {
		const client = {
			query: vi.fn(async () => ({ rows: [{ unlocked: true }] })),
			release: vi.fn(),
		};
		await unlockAndRelease(client, "scan");
		expect(client.release).toHaveBeenCalledWith(undefined);
	});

	it("destroys the session when the unlock returns false", async () => {
		const client = {
			query: vi.fn(async () => ({ rows: [{ unlocked: false }] })),
			release: vi.fn(),
		};
		await expect(unlockAndRelease(client, "scan")).rejects.toThrow(
			"session lock was not held",
		);
		expect(client.release).toHaveBeenCalledWith(expect.any(Error));
	});

	it("destroys the session when the unlock response is lost", async () => {
		const failure = new Error("connection interrupted");
		const client = {
			query: vi.fn(async (): Promise<{ rows: { unlocked: boolean }[] }> => {
				throw failure;
			}),
			release: vi.fn(),
		};
		await expect(unlockAndRelease(client, "scan")).rejects.toBe(failure);
		expect(client.release).toHaveBeenCalledWith(failure);
	});
});
