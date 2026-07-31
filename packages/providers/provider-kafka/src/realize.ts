import { MESSAGING_WIT_INTERFACE } from "@hobo/core";

import { parseKafkaClusterSpec, parseKafkaTopicResource } from "./parse.js";
import type {
	KafkaClusterSpec,
	KafkaRealizeResult,
	KafkaTopicResource,
} from "./types.js";

export interface RealizeKafkaInput {
	readonly cluster: unknown;
	readonly topics?: readonly unknown[];
}

/**
 * Matching / Resource Definition realization: plan Kafka cluster + topics.
 * Emits IaC hints; actual cloud resources go through the Camp's IacProvider.
 * Credentials remain binding refs only.
 */
export function realizeKafkaResources(
	input: RealizeKafkaInput,
): KafkaRealizeResult {
	const cluster = parseKafkaClusterSpec(input.cluster);
	const topics: KafkaTopicResource[] = (input.topics ?? []).map((t) =>
		parseKafkaTopicResource({
			...(t as object),
			cluster: (t as { cluster?: string }).cluster ?? cluster.name,
			tenantId:
				(t as { tenantId?: string; tenant_id?: string }).tenantId ??
				(t as { tenant_id?: string }).tenant_id ??
				cluster.tenantId,
		}),
	);

	const iacHints = [
		`kafka.cluster:${cluster.kind}:${cluster.name}`,
		...topics.map(
			(t) =>
				`kafka.topic:${t.name}:partitions=${t.partitions}:rf=${t.replicationFactor}`,
		),
		`credential.binding:${cluster.credentialBindingRef}`,
	];

	return Object.freeze({
		cluster,
		topics,
		messagingBackend: "native-kafka",
		witExports: [MESSAGING_WIT_INTERFACE, "hobo:queue/queue@0.1.0"],
		iacHints,
		secretless: true as const,
	});
}

export function localRedpandaCluster(
	tenantId: string,
	name = "local-redpanda",
): KafkaClusterSpec {
	return parseKafkaClusterSpec({
		name,
		tenantId,
		kind: "local-emulator",
		bootstrapServers: ["localhost:9092"],
		credentialBindingRef: "fromBinding:local-redpanda",
		transactional: true,
		idempotentProducer: true,
		schemaRegistryRef: "local://schema-registry",
	});
}
