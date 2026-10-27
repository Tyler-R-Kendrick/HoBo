import { describe, expect, it, vi } from "vitest";
import {
	createQueueWakeupHandler,
	forwardQueueWakeup,
	normalizeQueueWakeup,
} from "../src/queue-forwarding.js";

const origin = "https://hobo.example";
const secret = "x".repeat(43);
const wakeup = (body: string, authorization = `Bearer ${secret}`) =>
	new Request(`${origin}/internal/queue-wakeup`, {
		method: "POST",
		headers: { authorization, "content-type": "application/json" },
		body,
	});

describe("deployment queue handoff", () => {
	it("acknowledges a handoff only after the current worker succeeds", async () => {
		const run = vi.fn(async () => {});
		const handle = createQueueWakeupHandler({ origin, secret, run });
		const send: typeof fetch = async (input, init) =>
			handle(new Request(input, init));
		await forwardQueueWakeup({
			origin,
			secret,
			message: { deliveryId: "one" },
			fetch: send,
		});
		expect(run).toHaveBeenCalledWith({ deliveryId: "one" });
		run.mockRejectedValueOnce(new Error("worker failed"));
		await expect(
			forwardQueueWakeup({
				origin,
				secret,
				message: { deliveryId: "two" },
				fetch: send,
			}),
		).rejects.toThrow("queue handoff failed");
	});
	it("forwards only a validated, minimal wakeup to the canonical HTTPS endpoint", async () => {
		const send = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(null, { status: 204 }),
		);
		await forwardQueueWakeup({
			origin,
			secret,
			message: { deliveryId: "delivery-1", extra: "discard" },
			fetch: send,
		});
		expect(send).toHaveBeenCalledOnce();
		const [url, init] = send.mock.calls[0] ?? [];
		expect(url).toBe(`${origin}/internal/queue-wakeup`);
		expect(init).toMatchObject({
			method: "POST",
			redirect: "error",
			body: '{"deliveryId":"delivery-1"}',
		});
		expect(
			normalizeQueueWakeup({
				source: "static",
				name: "hobo-ci-repair",
				payload: { ignored: true },
			}),
		).toEqual({ source: "static", name: "hobo-ci-repair" });
		expect(normalizeQueueWakeup(null)).toBeNull();
		expect(() => normalizeQueueWakeup({ deliveryId: "../bad" })).toThrow();
		expect(() =>
			normalizeQueueWakeup({
				deliveryId: "a",
				source: "static",
				name: "hobo-ci-repair",
			}),
		).toThrow();
	});
	it("fails rather than acknowledging on rejection, network error or invalid origin", async () => {
		await expect(
			forwardQueueWakeup({
				origin,
				secret,
				message: null,
				fetch: async () => new Response(null, { status: 503 }),
			}),
		).rejects.toThrow("queue handoff failed");
		await expect(
			forwardQueueWakeup({
				origin,
				secret,
				message: null,
				fetch: async () => {
					throw new Error("private-token");
				},
			}),
		).rejects.toThrow("queue handoff unavailable");
		await expect(
			forwardQueueWakeup({
				origin: "https://user:pass@hobo.example",
				secret,
				message: null,
			}),
		).rejects.toThrow("invalid queue handoff origin");
	});
	it("authenticates before reading and executes only strict messages", async () => {
		const run = vi.fn(async () => {});
		const handle = createQueueWakeupHandler({ origin, secret, run });
		let pulls = 0;
		const stream = new ReadableStream(
			{
				pull() {
					pulls++;
					throw new Error("read before auth");
				},
			},
			{ highWaterMark: 0 },
		);
		const init: RequestInit & { duplex: "half" } = {
			method: "POST",
			headers: {
				authorization: "Bearer bad",
				"content-type": "application/json",
			},
			body: stream,
			duplex: "half",
		};
		const unauth = new Request(`${origin}/internal/queue-wakeup`, init);
		expect((await handle(unauth)).status).toBe(403);
		expect(pulls).toBe(0);
		expect(
			(await handle(wakeup('{"deliveryId":"one","extra":true}'))).status,
		).toBe(400);
		expect(
			(await handle(wakeup('{"source":"static","name":"hobo-ci-repair"}')))
				.status,
		).toBe(204);
		expect(run).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledWith({
			source: "static",
			name: "hobo-ci-repair",
		});
	});
	it("bounds input and returns failure when the active worker fails", async () => {
		const run = vi.fn(async () => {
			throw new Error("private-worker-secret");
		});
		const handle = createQueueWakeupHandler({ origin, secret, run });
		expect(
			(await handle(wakeup(JSON.stringify({ deliveryId: "x".repeat(5000) }))))
				.status,
		).toBe(413);
		const response = await handle(wakeup('{"deliveryId":"one"}'));
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("private-worker-secret");
	});
	it("abandons an authenticated stalled body without running work", async () => {
		vi.useFakeTimers();
		try {
			const run = vi.fn(async () => {});
			const handle = createQueueWakeupHandler({ origin, secret, run });
			const stream = new ReadableStream(
				{ pull: () => new Promise(() => {}) },
				{ highWaterMark: 0 },
			);
			const init: RequestInit & { duplex: "half" } = {
				method: "POST",
				headers: {
					authorization: `Bearer ${secret}`,
					"content-type": "application/json",
				},
				body: stream,
				duplex: "half",
			};
			const pending = handle(
				new Request(`${origin}/internal/queue-wakeup`, init),
			);
			await vi.advanceTimersByTimeAsync(5001);
			expect((await pending).status).toBe(400);
			expect(run).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
