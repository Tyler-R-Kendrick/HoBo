/**
 * The localhost Yard seed (ADR-0157): the built-in `yard:local` whose binding
 * rows say which local implementation stands in for each Bindle catalog
 * primitive on a developer machine.
 *
 * The function is **pure**. It takes observations — what a Station reported
 * about this host — and returns a record. It never reads the filesystem, never
 * looks at the clock, and never randomizes, so the same observations always
 * produce a deep-equal seed including ordering. Discovery is somebody else's
 * job; this module only decides what a given set of observations entitles the
 * local Yard to claim.
 *
 * Two honesty rules are load-bearing:
 *
 * - **Nothing is silently omitted.** A primitive whose local implementation is
 *   unavailable (its enabling capability was not observed) or does not exist at
 *   all appears in `unavailable` with a reason naming what to do about it. A
 *   dropped primitive would read as "HoBo has no opinion here" when the truth
 *   is "HoBo cannot do this locally".
 * - **Every row carries its fidelity** (ADR-0042). An in-memory queue is
 *   `simulated`, not `real`, and the label rides into the Yard's binding
 *   properties so a downstream report can split coverage by fidelity instead of
 *   showing a bare green tick.
 */

import type { YardBindingInput } from "./binding.js";
import { deepFreeze, isPlainObject } from "./canonical.js";
import { type Yard, yard } from "./yard.js";

export const LOCALHOST_YARD_NAME = "yard:local";
export const LOCALHOST_PROVIDER_ID = "local";

export type SeedProvenance = "default" | "discovered" | "declared";
export type SeedFidelity = "real" | "simulated" | "mocked" | "camp-only";

export interface LocalhostCapabilityObservation {
	readonly capabilityId: string; // e.g. "capability:runtime:node"
	readonly present: boolean;
}

export interface LocalhostYardSeed {
	readonly contract: "hobo.localhost-yard-seed/v1";
	readonly yard: Yard;
	readonly rows: readonly {
		readonly profile: string;
		readonly productId: string;
		readonly provenance: SeedProvenance;
		readonly fidelity: SeedFidelity;
	}[];
	readonly unavailable: readonly {
		readonly profile: string;
		readonly reason: string;
	}[];
}

const LOCALHOST_SEED_CONTRACT = "hobo.localhost-yard-seed/v1" as const;

/** `capability:<kind>:<slug>` — the id form `stationCapability()` mints. */
const CAPABILITY_ID_PATTERN =
	/^capability:[a-z][a-z0-9-]*:[a-z0-9][a-z0-9.-]*$/u;

type SeedCandidate =
	| {
			readonly kind: "local";
			readonly primitive: string;
			readonly profile: string;
			readonly productId: string;
			readonly fidelity: SeedFidelity;
			/** Absent ⇒ the implementation needs nothing from the host. */
			readonly requiresCapability?: string;
	  }
	| {
			readonly kind: "unsupported";
			readonly primitive: string;
			readonly profile: string;
			readonly reason: string;
	  };

/**
 * One entry per Bindle catalog primitive (`web, api, service, data, kv, bucket,
 * queue, topic, secretRef, webhook`), plus the profiles the local host provably
 * cannot satisfy. Fidelity is a declared property of the local implementation,
 * not a measurement.
 */
const LOCALHOST_CANDIDATES: readonly SeedCandidate[] = Object.freeze([
	{
		kind: "local",
		primitive: "api",
		profile: "api.http/v1",
		productId: "local:node-http-server",
		fidelity: "real",
		requiresCapability: "capability:runtime:node",
	},
	{
		kind: "local",
		primitive: "bucket",
		profile: "bucket.filesystem/v1",
		productId: "local:filesystem-bucket",
		fidelity: "real",
		requiresCapability: "capability:runtime:node",
	},
	{
		kind: "local",
		primitive: "data",
		profile: "data.relational/v1",
		productId: "local:sqlite-file",
		fidelity: "real",
		requiresCapability: "capability:toolchain:sqlite",
	},
	{
		kind: "local",
		primitive: "data",
		profile: "data.sqlite/v1",
		productId: "local:sqlite-file",
		fidelity: "real",
		requiresCapability: "capability:toolchain:sqlite",
	},
	{
		kind: "local",
		primitive: "kv",
		profile: "kv.key-value/v1",
		productId: "local:in-memory-kv",
		fidelity: "simulated",
	},
	{
		kind: "local",
		primitive: "queue",
		profile: "queue.at-least-once/v1",
		productId: "local:in-memory-queue",
		fidelity: "simulated",
	},
	{
		kind: "local",
		primitive: "secretRef",
		profile: "secret-ref.locator/v1",
		productId: "local:in-memory-secret-locator",
		fidelity: "simulated",
	},
	{
		kind: "unsupported",
		primitive: "secretRef",
		profile: "secret-ref.dynamic-resolution/v1",
		reason:
			"no local implementation: nothing on a developer host mints short-lived per-identity credentials — bind secret-ref.dynamic-resolution/v1 on a provider Yard with a secrets service",
	},
	{
		kind: "local",
		primitive: "service",
		profile: "service.worker/v1",
		productId: "local:in-process-worker",
		fidelity: "real",
		requiresCapability: "capability:runtime:node",
	},
	{
		kind: "local",
		primitive: "topic",
		profile: "topic.ephemeral-pubsub/v1",
		productId: "local:in-memory-topic",
		fidelity: "simulated",
	},
	{
		kind: "unsupported",
		primitive: "topic",
		profile: "topic.durable-log/v1",
		reason:
			"no local implementation: the local topic is in-memory fan-out with no retention, so it can never satisfy a durable log — bind topic.durable-log/v1 on a provider Yard",
	},
	{
		kind: "local",
		primitive: "web",
		profile: "web.static/v1",
		productId: "local:static-file-server",
		fidelity: "real",
		requiresCapability: "capability:runtime:node",
	},
	{
		kind: "local",
		primitive: "webhook",
		profile: "webhook.inbound-http/v1",
		productId: "local:node-http-server",
		fidelity: "real",
		requiresCapability: "capability:runtime:node",
	},
]);

/** Pure. Deterministic given observations. No I/O, no clock, no randomness. */
export function seedLocalhostYard(
	observations: readonly LocalhostCapabilityObservation[],
): LocalhostYardSeed {
	const present = presentCapabilities(observations);

	const rows: {
		readonly profile: string;
		readonly productId: string;
		readonly provenance: SeedProvenance;
		readonly fidelity: SeedFidelity;
	}[] = [];
	const unavailable: { readonly profile: string; readonly reason: string }[] =
		[];

	for (const candidate of LOCALHOST_CANDIDATES) {
		if (candidate.kind === "unsupported") {
			unavailable.push({
				profile: candidate.profile,
				reason: candidate.reason,
			});
			continue;
		}
		const required = candidate.requiresCapability;
		if (required !== undefined && !present.has(required)) {
			unavailable.push({
				profile: candidate.profile,
				reason: `no local implementation: the local ${candidate.primitive} product "${candidate.productId}" requires ${required}, which was not observed on this host — install it and re-run capability discovery, or bind ${candidate.profile} on a provider Yard`,
			});
			continue;
		}
		rows.push({
			profile: candidate.profile,
			productId: candidate.productId,
			// A row justified by an observation is discovered; one that needs
			// nothing from the host is a platform default.
			provenance: required === undefined ? "default" : "discovered",
			fidelity: candidate.fidelity,
		});
	}

	rows.sort(compareRows);
	unavailable.sort(compareUnavailable);

	const bindings: readonly YardBindingInput[] = rows.map((row) => ({
		profile: row.profile,
		productId: row.productId,
		properties: {
			"local.fidelity": row.fidelity,
			"local.provenance": row.provenance,
		},
	}));

	return deepFreeze({
		contract: LOCALHOST_SEED_CONTRACT,
		// A real Yard, parsed by the same `yard()` every authored Yard goes
		// through — the seed gets no private construction path.
		yard: yard(LOCALHOST_YARD_NAME, {
			provider: LOCALHOST_PROVIDER_ID,
			bindings,
			camps: [],
		}),
		rows,
		unavailable,
	});
}

/**
 * Presence is a union over the observations, never last-write-wins: two
 * observations of the same capability must not make the seed depend on input
 * order.
 */
function presentCapabilities(
	observations: readonly LocalhostCapabilityObservation[],
): ReadonlySet<string> {
	if (!Array.isArray(observations)) {
		throw new TypeError("localhost capability observations must be an array");
	}
	const present = new Set<string>();
	for (const observation of observations) {
		if (!isPlainObject(observation)) {
			throw new TypeError("localhost capability observation must be an object");
		}
		const capabilityId = observation.capabilityId;
		if (
			typeof capabilityId !== "string" ||
			!CAPABILITY_ID_PATTERN.test(capabilityId)
		) {
			throw new TypeError(
				`localhost capability observation id must match capability:<kind>:<slug> (got ${JSON.stringify(capabilityId)})`,
			);
		}
		if (typeof observation.present !== "boolean") {
			throw new TypeError(
				`localhost capability observation present must be a boolean (${capabilityId})`,
			);
		}
		if (observation.present) present.add(capabilityId);
	}
	return present;
}

function compareRows(
	a: { readonly profile: string; readonly productId: string },
	b: { readonly profile: string; readonly productId: string },
): number {
	if (a.profile !== b.profile) return a.profile < b.profile ? -1 : 1;
	if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
	return 0;
}

function compareUnavailable(
	a: { readonly profile: string },
	b: { readonly profile: string },
): number {
	if (a.profile !== b.profile) return a.profile < b.profile ? -1 : 1;
	return 0;
}
