/**
 * Messaging adapter conformance seed (ADR-0138).
 * Full runner integration can load this suite against Kafka/Dapr adapters.
 */

import { createConformanceSuite } from "../suite.js";

export const MESSAGING_CONFORMANCE_SUITE = createConformanceSuite({
	id: "hobo.messaging.wasi-messaging/v1",
	port: {
		wit: "wasi:messaging/messaging@0.2.0",
		functions: ["publish", "subscribe", "consume", "ack", "nack"],
	},
	coverage: {
		requiredFunctions: ["publish", "consume", "ack"],
	},
	cases: [
		{
			id: "messaging.publish-consume-ack",
			tier: "local",
			call: { function: "publish", args: { topic: "t", body: { x: 1 } } },
			expect: { consumed: 1, acked: true },
		},
		{
			id: "messaging.consumer-group-isolation",
			tier: "local",
			call: {
				function: "consume",
				args: { topic: "t", groups: ["g1", "g2"] },
			},
			expect: { eachGroupSeesMessage: true },
		},
		{
			id: "messaging.dead-letter-max-attempts",
			tier: "local",
			call: {
				function: "subscribe",
				args: { fail: true, maxAttempts: 2 },
			},
			expect: { deadLettered: true },
		},
		{
			id: "messaging.exactly-once-capability-gate",
			tier: "local",
			call: {
				function: "publish",
				args: { delivery: "exactly-once" },
			},
			expect: { capabilityChecked: true },
		},
	],
});
