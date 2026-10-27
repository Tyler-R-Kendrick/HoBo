import { describe, expect, it, vi } from "vitest";
import { createNeonRepairTrigger } from "../src/neon-trigger.js";

const NOW = Date.parse("2026-10-27T00:00:00Z");
const secret = "s".repeat(32);
const original = {
	version: 1,
	invocation_id: "invocation-1",
	trigger: { type: "schedule", id: "trigger-1", name: "hobo-ci-repair" },
	data: { scheduled_at: new Date(NOW).toISOString() },
};
const setup = (send: typeof fetch) =>
	createNeonRepairTrigger({
		triggerId: "trigger-1",
		triggerName: "hobo-ci-repair",
		publicOrigin: "https://hobo-ci.vercel.app",
		cronSecret: secret,
		fetch: send,
		now: () => NOW,
	});
const delivery = (
	body: typeof original & { padding?: string } = original,
	id = "invocation-1",
) =>
	new Request("https://broker.example/internal/trigger", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-neon-trigger-invocation-id": id,
		},
		body: JSON.stringify(body),
	});

describe("Neon repair trigger", () => {
	it("forwards a verified scheduled invocation once with the broker-held secret", async () => {
		const send = vi.fn(async () => new Response(null, { status: 204 }));
		const handle = setup(send);
		expect((await handle(delivery())).status).toBe(204);
		expect((await handle(delivery())).status).toBe(204);
		expect(send).toHaveBeenCalledTimes(1);
		const [url, options] = send.mock.calls[0] ?? [];
		expect(url).toBe("https://hobo-ci.vercel.app/internal/tick");
		expect(options).toMatchObject({
			method: "GET",
			headers: { authorization: `Bearer ${secret}` },
			redirect: "error",
		});
	});
	it("rejects missing or mismatched provenance, identity and stale schedules", async () => {
		const send = vi.fn(async () => new Response(null, { status: 204 }));
		const handle = setup(send);
		const noHeader = new Request("https://broker.example/internal/trigger", {
			method: "POST",
			body: JSON.stringify(original),
		});
		expect((await handle(noHeader)).status).toBe(403);
		expect((await handle(delivery(original, "other"))).status).toBe(403);
		expect(
			(
				await handle(
					delivery({
						...original,
						trigger: { ...original.trigger, id: "other" },
					}),
				)
			).status,
		).toBe(403);
		expect(
			(
				await handle(
					delivery({
						...original,
						trigger: { ...original.trigger, name: "other" },
					}),
				)
			).status,
		).toBe(403);
		expect(
			(
				await handle(
					delivery({
						...original,
						data: { scheduled_at: new Date(NOW - 31 * 60_000).toISOString() },
					}),
				)
			).status,
		).toBe(403);
		expect(send).not.toHaveBeenCalled();
	});
	it("permits retry after a failed wakeup without accepting concurrent duplicate work", async () => {
		let finish: ((response: Response) => void) | undefined;
		const send = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const handle = setup(send);
		const first = handle(delivery());
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect((await handle(delivery())).status).toBe(409);
		finish?.(new Response(null, { status: 503 }));
		expect((await first).status).toBe(503);
		const retry = handle(delivery());
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
		finish?.(new Response(null, { status: 204 }));
		expect((await retry).status).toBe(204);
	});
	it("rejects oversized bodies before attempting a wakeup", async () => {
		const send = vi.fn(async () => new Response(null, { status: 204 }));
		const handle = setup(send);
		expect(
			(await handle(delivery({ ...original, padding: "x".repeat(4097) })))
				.status,
		).toBe(413);
		expect(send).not.toHaveBeenCalled();
	});
});
