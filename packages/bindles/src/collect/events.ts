import { createHash } from "node:crypto";

import type { ManifestHash } from "../manifest/index.js";

// The two facts run-to-collect appends per collection run. `bindle.ResourcesCollected`
// (seq 1) records what the components declared while running in collection mode;
// `bindle.ManifestProduced` (seq 2) records the deterministic manifest IR hash an
// actor folded from them. Ids are content-addressed so two runs of the same
// Bindle emit byte-identical events (determinism gate).

export const COLLECTION_EVENT_SOURCE = "hobo.collector" as const;

export type CollectionEventType =
	| "bindle.ResourcesCollected"
	| "bindle.ManifestProduced";

export interface ResourcesCollectedData {
	readonly bindleId: string;
	readonly resources: readonly string[];
	readonly binds: readonly string[];
}

export interface ManifestProducedData {
	readonly bindleId: string;
	readonly manifestHash: ManifestHash;
}

export interface ResourcesCollectedEvent {
	readonly id: string;
	readonly type: "bindle.ResourcesCollected";
	readonly seq: 1;
	readonly source: typeof COLLECTION_EVENT_SOURCE;
	readonly data: ResourcesCollectedData;
}

export interface ManifestProducedEvent {
	readonly id: string;
	readonly type: "bindle.ManifestProduced";
	readonly seq: 2;
	readonly source: typeof COLLECTION_EVENT_SOURCE;
	readonly data: ManifestProducedData;
}

export type CollectionEvent = ResourcesCollectedEvent | ManifestProducedEvent;

function stableDigest(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(sortKeys(value)))
		.digest("hex");
}

export function createCollectionEvents(input: {
	readonly bindleId: string;
	readonly manifestHash: ManifestHash;
	readonly resources: readonly string[];
	readonly binds: readonly string[];
}): readonly CollectionEvent[] {
	const collected: ResourcesCollectedData = {
		bindleId: input.bindleId,
		resources: [...input.resources],
		binds: [...input.binds],
	};
	const produced: ManifestProducedData = {
		bindleId: input.bindleId,
		manifestHash: input.manifestHash,
	};

	return Object.freeze([
		Object.freeze({
			id: `evt-${stableDigest({ type: "bindle.ResourcesCollected", data: collected }).slice(0, 12)}`,
			type: "bindle.ResourcesCollected",
			seq: 1,
			source: COLLECTION_EVENT_SOURCE,
			data: Object.freeze(collected),
		} satisfies ResourcesCollectedEvent),
		Object.freeze({
			id: `evt-${stableDigest({ type: "bindle.ManifestProduced", data: produced }).slice(0, 12)}`,
			type: "bindle.ManifestProduced",
			seq: 2,
			source: COLLECTION_EVENT_SOURCE,
			data: Object.freeze(produced),
		} satisfies ManifestProducedEvent),
	]);
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (!value || typeof value !== "object") {
		return value;
	}
	return Object.fromEntries(
		Object.keys(value as Record<string, unknown>)
			.sort()
			.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
	);
}
