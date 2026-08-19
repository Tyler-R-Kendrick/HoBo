import {
	type DeliveryGuarantee,
	MessagingParseError,
	parseDeliveryGuarantee,
} from "@hobo/core";

import type {
	KafkaClusterKind,
	KafkaClusterSpec,
	KafkaResourceDefinition,
	KafkaTopicResource,
} from "./types.js";

const CLUSTER_KINDS = new Set<KafkaClusterKind>([
	"self-hosted",
	"redpanda",
	"msk",
	"confluent",
	"azure-event-hubs",
	"local-emulator",
]);

function nonEmpty(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new MessagingParseError(field, "non-empty string", value);
	}
	return value;
}

export function parseKafkaClusterKind(value: unknown): KafkaClusterKind {
	if (
		typeof value !== "string" ||
		!CLUSTER_KINDS.has(value as KafkaClusterKind)
	) {
		throw new MessagingParseError("kind", [...CLUSTER_KINDS].join("|"), value);
	}
	return value as KafkaClusterKind;
}

export function parseKafkaClusterSpec(input: unknown): KafkaClusterSpec {
	if (!input || typeof input !== "object") {
		throw new MessagingParseError("KafkaClusterSpec", "object", input);
	}
	const src = input as Record<string, unknown>;
	const servers = Array.isArray(src.bootstrapServers ?? src.bootstrap_servers)
		? ((src.bootstrapServers ?? src.bootstrap_servers) as unknown[]).map((s) =>
				nonEmpty(s, "bootstrapServers[]"),
			)
		: [];
	const kind = parseKafkaClusterKind(src.kind ?? "self-hosted");
	const credentialBindingRef = nonEmpty(
		src.credentialBindingRef ??
			src.credential_binding_ref ??
			"fromBinding:kafka",
		"credentialBindingRef",
	);
	// Reject plaintext credential shapes in the parse boundary.
	for (const forbidden of [
		"password",
		"saslPassword",
		"apiSecret",
		"secretAccessKey",
		"plaintextCredential",
	]) {
		if (forbidden in src) {
			throw new MessagingParseError(
				forbidden,
				"absent (secretless-first)",
				(src as Record<string, unknown>)[forbidden],
			);
		}
	}
	const spec: KafkaClusterSpec = {
		name: nonEmpty(src.name, "name"),
		tenantId: nonEmpty(src.tenantId ?? src.tenant_id, "tenantId"),
		kind,
		bootstrapServers: servers,
		credentialBindingRef,
		transactional: Boolean(src.transactional ?? false),
		idempotentProducer: Boolean(
			src.idempotentProducer ?? src.idempotent_producer ?? true,
		),
		...(src.schemaRegistryRef || src.schema_registry_ref
			? {
					schemaRegistryRef: String(
						src.schemaRegistryRef ?? src.schema_registry_ref,
					),
				}
			: {}),
		...(src.labels && typeof src.labels === "object"
			? { labels: { ...(src.labels as Record<string, string>) } }
			: {}),
	};
	return Object.freeze(spec);
}

export function parseKafkaTopicResource(input: unknown): KafkaTopicResource {
	if (!input || typeof input !== "object") {
		throw new MessagingParseError("KafkaTopicResource", "object", input);
	}
	const src = input as Record<string, unknown>;
	const delivery = parseDeliveryGuarantee(
		src.deliveryGuarantee ?? src.delivery_guarantee ?? "at-least-once",
	) as DeliveryGuarantee;
	const partitions = Number(src.partitions ?? 1);
	const rf = Number(src.replicationFactor ?? src.replication_factor ?? 1);
	if (!Number.isInteger(partitions) || partitions < 1) {
		throw new MessagingParseError("partitions", "int >= 1", src.partitions);
	}
	if (!Number.isInteger(rf) || rf < 1) {
		throw new MessagingParseError("replicationFactor", "int >= 1", rf);
	}
	const topic: KafkaTopicResource = {
		name: nonEmpty(src.name, "name"),
		cluster: nonEmpty(src.cluster, "cluster"),
		tenantId: nonEmpty(src.tenantId ?? src.tenant_id, "tenantId"),
		partitions,
		replicationFactor: rf,
		deliveryGuarantee: delivery,
		...(src.deadLetterTopic || src.dead_letter_topic
			? {
					deadLetterTopic: String(src.deadLetterTopic ?? src.dead_letter_topic),
				}
			: {}),
		...(src.schemaRef || src.schema_ref
			? { schemaRef: String(src.schemaRef ?? src.schema_ref) }
			: {}),
	};
	return Object.freeze(topic);
}

export function parseKafkaResourceDefinition(
	input: unknown,
): KafkaResourceDefinition {
	if (!input || typeof input !== "object") {
		throw new MessagingParseError("KafkaResourceDefinition", "object", input);
	}
	const src = input as Record<string, unknown>;
	const apiVersion = nonEmpty(src.apiVersion ?? src.api_version, "apiVersion");
	if (apiVersion !== "hobo.kafka/v1") {
		throw new MessagingParseError("apiVersion", "hobo.kafka/v1", apiVersion);
	}
	const kind = nonEmpty(src.kind, "kind");
	if (kind !== "KafkaCluster" && kind !== "KafkaTopic") {
		throw new MessagingParseError("kind", "KafkaCluster|KafkaTopic", kind);
	}
	const name = nonEmpty(
		src.name ?? (src.metadata as { name?: string })?.name,
		"name",
	);
	const tenantId = nonEmpty(
		src.tenantId ??
			src.tenant_id ??
			(src.metadata as { tenantId?: string })?.tenantId,
		"tenantId",
	);
	const body = src.spec ?? src;
	const spec =
		kind === "KafkaCluster"
			? parseKafkaClusterSpec({ ...body, name, tenantId })
			: parseKafkaTopicResource({ ...body, name, tenantId });
	return Object.freeze({
		apiVersion: "hobo.kafka/v1",
		kind,
		name,
		tenantId,
		spec,
	});
}
