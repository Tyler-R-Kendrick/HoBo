import { describe, expect, it } from "vitest";

import {
	ReplayDivergenceError,
	canonicalStateBytes,
	defineWorkflow,
	stableStringify,
	testRuntime,
} from "@hobo/runtime/replay";

const checkoutWorkflow = defineWorkflow("checkout", {
	initialState: (order: { id: string }) => ({
		orderId: order.id,
		status: "started",
		approved: false,
		charged: false,
		startedAt: null as string | null,
		paymentDueAt: null as string | null,
		settledAt: null as string | null,
		actorSignal: null as string | null,
		sagaReaction: null as string | null,
	}),
	onStart(ctx, state, order) {
		ctx.emit("checkout.Started", { orderId: order.id });
		ctx.emit("actor.OrderPlaced", { orderId: order.id });
		ctx.emit("saga.FulfillmentRequested", { orderId: order.id });
		ctx.waitForHook("approval");
		return { ...state, startedAt: ctx.now(), actorSignal: "placed", sagaReaction: "requested" };
	},
	onHook(ctx, state, payload) {
		if ((payload as { ok?: boolean }).ok !== true) {
			return { ...state, status: "rejected" };
		}
		const timer = ctx.sleep(10_000, { id: "settle-payment", label: "payment-settle" });
		return { ...state, approved: true, paymentDueAt: timer.fireAt, status: "waiting-for-payment" };
	},
	onTimer(ctx, state, timer) {
		if (timer.label !== "payment-settle") {
			return state;
		}
		ctx.emit("checkout.Confirmed", { orderId: state.orderId });
		return { ...state, charged: true, settledAt: timer.fireAt, status: "confirmed" };
	},
});

describe("hello-bindle replay invariant", () => {
	it("asserts replay equals live for workflow + actor + saga interactions", async () => {
		const w = testRuntime({ seed: "hello-bindle-checkout-seed" });
		const run = await w.start(checkoutWorkflow, { id: "order-hello-bindle" });
		await w.resumeHook(run, { ok: true });
		await w.clock.advance(10_000);

		const liveState = await w.state(run);
		const replayState = await w.replay(run);

		expect(replayState).toEqual(liveState);
		expect(stableStringify(replayState)).toBe(stableStringify(liveState));
		expect(canonicalStateBytes(replayState)).toBe(canonicalStateBytes(liveState));
	});

	it("fails replay when ambient Date.now is read in the workflow body", async () => {
		const badWorkflow = defineWorkflow("bad-clock", {
			initialState: () => ({ sample: null as number | null }),
			onStart() {
				return { sample: Date.now() };
			},
		});

		const w = testRuntime();
		const run = await w.start(badWorkflow, {});

		await expect(w.replay(run)).rejects.toBeInstanceOf(ReplayDivergenceError);
	});

	it("allows Date.now inside a memoized step without divergence", async () => {
		const controlWorkflow = defineWorkflow("step-clock", {
			initialState: () => ({ sample: null as number | null }),
			async onStart(ctx, state) {
				const sample = await ctx.step("capture-clock", () => Date.now());
				return { ...state, sample };
			},
		});

		const w = testRuntime();
		const run = await w.start(controlWorkflow, {});
		const liveState = await w.state(run);
		const replayState = await w.replay(run);

		expect(replayState).toEqual(liveState);
	});
});
