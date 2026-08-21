import { parseConsumerGroupId, parseTopicName } from "@hobo/core";
import { first } from "@hobo/core/total-access";
import { describe, expect, it } from "vitest";
import {
	createInMemoryKafkaTransport,
	createKafkaMessaging,
	localRedpandaCluster,
} from "../src/index.js";

describe("kafka live transport path", () => {
	it("refuses live:true without transport", () => {
		expect(() =>
			createKafkaMessaging({
				cluster: localRedpandaCluster("t1"),
				live: true,
			}),
		).toThrow(/requires a KafkaBrokerTransport/);
	});

	it("labels simulated without transport", () => {
		const bus = createKafkaMessaging({
			cluster: localRedpandaCluster("t1"),
		});
		expect(bus.fidelity).toBe("simulated");
		expect(bus.transport).toBeNull();
	});

	it("exercises live client code path via in-memory broker transport", async () => {
		const transport = createInMemoryKafkaTransport();
		const bus = createKafkaMessaging({
			cluster: localRedpandaCluster("acme"),
			transport,
		});
		expect(bus.fidelity).toBe("live");
		expect(bus.transport).toBe(transport);

		const topic = parseTopicName("orders");
		await bus.publish(topic, { id: 1 }, { key: "k1", idempotencyKey: "ik1" });
		const dedup = await bus.publish(
			topic,
			{ id: 1 },
			{ key: "k1", idempotencyKey: "ik1" },
		);
		expect(dedup.deduped).toBe(true);

		const batch = await bus.consume(topic, parseConsumerGroupId("workers"), {
			maxMessages: 10,
		});
		expect(batch).toHaveLength(1);
		expect(batch[0]?.body).toEqual({ id: 1 });

		bus.ack(first(batch).messageId, first(batch).leaseId);
		await bus.flush?.();

		const again = await bus.consume(topic, parseConsumerGroupId("workers"));
		expect(again).toHaveLength(0);

		const types = bus.events().map((e) => e.type);
		expect(types).toContain("messaging.published");
		expect(types).toContain("messaging.acked");
	});

	it("routes produce through the injected transport (not pure emulator)", async () => {
		const transport = createInMemoryKafkaTransport();
		const produceCalls: unknown[] = [];
		const spy: typeof transport = {
			...transport,
			kind: "kafka-broker-transport",
			async produce(req) {
				produceCalls.push(req);
				return transport.produce(req);
			},
			async ensureTopic(t, o) {
				return transport.ensureTopic(t, o);
			},
			async fetch(r) {
				return transport.fetch(r);
			},
			async commit(r) {
				return transport.commit(r);
			},
			async release(r) {
				return transport.release(r);
			},
		};
		const bus = createKafkaMessaging({
			cluster: localRedpandaCluster("acme"),
			transport: spy,
		});
		await bus.publish(parseTopicName("t"), { x: 1 });
		expect(produceCalls).toHaveLength(1);
		expect(bus.fidelity).toBe("live");
	});
});
