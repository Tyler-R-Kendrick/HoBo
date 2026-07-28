import { describe, expect, it } from "vitest";

import {
	createInMemoryKafkaTransport,
	createKafkaMessaging,
	localRedpandaCluster,
} from "../src/index.js";

describe("kafka live DLQ", () => {
	it("dead-letters after maxDeliveryAttempts without lease mismatch", async () => {
		const bus = createKafkaMessaging({
			cluster: localRedpandaCluster("acme"),
			transport: createInMemoryKafkaTransport(),
		});
		await bus.ensureSubscription({
			name: "s" as never,
			topic: "fail" as never,
			consumerGroup: "g" as never,
			tenantId: "acme" as never,
			delivery: "at-least-once",
			maxDeliveryAttempts: 2,
		});
		await bus.publish("fail" as never, { x: 1 });

		const r1 = await bus.subscribe("fail" as never, "g" as never, async () => {
			throw new Error("boom");
		});
		expect(r1.handled).toBe(0);
		expect(r1.deadLettered).toBe(0);

		const r2 = await bus.subscribe("fail" as never, "g" as never, async () => {
			throw new Error("boom");
		});
		expect(r2.deadLettered).toBe(1);

		// Group advanced — no further redelivery.
		const again = await bus.consume("fail" as never, "g" as never);
		expect(again).toHaveLength(0);

		const types = bus.events().map((e) => e.type);
		expect(types).toContain("messaging.dead_lettered");
		expect(types).toContain("messaging.delivery.permanent_failure");
	});
});
