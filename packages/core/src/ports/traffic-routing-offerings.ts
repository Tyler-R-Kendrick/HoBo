import { deepFreeze, enumValue, expectObject } from "../parse-utils.js";
import {
	parseRoutingProvider,
	TrafficRoutingParseError,
	type TrafficRoutingProvider,
} from "./traffic-routing.js";

/**
 * Portable TrafficRouting offerings (ADR-0143).
 * Providers declare these up front; apply-result capabilities prove realization.
 */
export type TrafficRoutingOfferingId =
	| "lb.lifecycle"
	| "lb.weighted"
	| "lb.health"
	| "lb.locality"
	| "edge.path"
	| "edge.header"
	| "edge.canary"
	| "dns.weighted"
	| "dns.failover"
	| "overlay.funnel"
	| "overlay.funnel.multi"
	| "inprocess.weighted"
	| "driver.route-bind"
	| "mesh.optional"
	| "observe.health"
	| "observe.location"
	| "resiliency.edge";

export type TrafficRoutingOfferingStability =
	| "stable"
	| "preview"
	| "experimental";

export type TrafficRoutingOfferingFidelity =
	| "real"
	| "simulated"
	| "mocked"
	| "camp-only";

export type TrafficRoutingNegotiation = "prefer" | "require";

export interface TrafficRoutingOffering {
	readonly id: TrafficRoutingOfferingId;
	readonly stability: TrafficRoutingOfferingStability;
	readonly fidelity: TrafficRoutingOfferingFidelity;
	readonly features: readonly string[];
}

export interface TrafficRoutingProviderProfile {
	readonly provider: TrafficRoutingProvider;
	readonly offerings: readonly TrafficRoutingOffering[];
	/** Ordered fallback offering ids when native realization cannot cover the plan. */
	readonly fallbacks: readonly TrafficRoutingOfferingId[];
}

export interface TrafficRoutingPortRequest {
	readonly features?: readonly TrafficRoutingOfferingId[];
	readonly negotiation?: TrafficRoutingNegotiation;
}

export type TrafficRoutingMatch =
	| { readonly kind: "full"; readonly offerings: readonly TrafficRoutingOfferingId[] }
	| {
			readonly kind: "partial";
			readonly offerings: readonly TrafficRoutingOfferingId[];
			readonly missing: readonly TrafficRoutingOfferingId[];
			readonly fallbacks: readonly TrafficRoutingOfferingId[];
	  }
	| {
			readonly kind: "none";
			readonly missing: readonly TrafficRoutingOfferingId[];
			readonly remediation: string;
	  };

export type TrafficRoutingResolveResult =
	| {
			readonly kind: "resolved";
			readonly provider: TrafficRoutingProvider;
			readonly strategy: readonly TrafficRoutingOfferingId[];
			readonly match: TrafficRoutingMatch;
	  }
	| {
			readonly kind: "unresolved";
			readonly missing: readonly TrafficRoutingOfferingId[];
			readonly remediation: string;
	  };

const OFFERINGS = new Set<TrafficRoutingOfferingId>([
	"lb.lifecycle",
	"lb.weighted",
	"lb.health",
	"lb.locality",
	"edge.path",
	"edge.header",
	"edge.canary",
	"dns.weighted",
	"dns.failover",
	"overlay.funnel",
	"overlay.funnel.multi",
	"inprocess.weighted",
	"driver.route-bind",
	"mesh.optional",
	"observe.health",
	"observe.location",
	"resiliency.edge",
]);

const STABILITIES = new Set<TrafficRoutingOfferingStability>([
	"stable",
	"preview",
	"experimental",
]);

const FIDELITIES = new Set<TrafficRoutingOfferingFidelity>([
	"real",
	"simulated",
	"mocked",
	"camp-only",
]);

/** Default portable fallback ladder when a profile omits `fallbacks`. */
export const DEFAULT_TRAFFIC_ROUTING_FALLBACKS: readonly TrafficRoutingOfferingId[] =
	[
		"edge.canary",
		"edge.path",
		"edge.header",
		"dns.weighted",
		"dns.failover",
		"overlay.funnel.multi",
		"overlay.funnel",
		"inprocess.weighted",
		"driver.route-bind",
	];

export function parseTrafficRoutingOfferingId(
	value: unknown,
	path = "offeringId",
): TrafficRoutingOfferingId {
	return enumValue(value, OFFERINGS, path, TrafficRoutingParseError);
}

export function parseTrafficRoutingOffering(
	value: unknown,
	path = "offering",
): TrafficRoutingOffering {
	const input = expectObject(value, path, TrafficRoutingParseError);
	const features = Array.isArray(input.features)
		? input.features.map((feature, index) => {
				if (typeof feature !== "string" || feature.trim().length === 0) {
					throw new TrafficRoutingParseError(
						`${path}.features[${index}]`,
						"non-empty string",
						feature,
					);
				}
				return feature.trim();
			})
		: [];
	return deepFreeze({
		id: parseTrafficRoutingOfferingId(input.id, `${path}.id`),
		stability: enumValue(
			input.stability ?? "stable",
			STABILITIES,
			`${path}.stability`,
			TrafficRoutingParseError,
		),
		fidelity: enumValue(
			input.fidelity ?? "real",
			FIDELITIES,
			`${path}.fidelity`,
			TrafficRoutingParseError,
		),
		features: deepFreeze(features),
	});
}

export function parseTrafficRoutingProviderProfile(
	value: unknown,
	path = "profile",
): TrafficRoutingProviderProfile {
	const input = expectObject(value, path, TrafficRoutingParseError);
	const offerings = (
		Array.isArray(input.offerings)
			? input.offerings
			: fail(path, "offerings array", input.offerings)
	).map((entry, index) =>
		parseTrafficRoutingOffering(entry, `${path}.offerings[${index}]`),
	);
	const ids = new Set(offerings.map((entry) => entry.id));
	if (ids.size !== offerings.length) {
		fail(`${path}.offerings`, "unique offering ids", input.offerings);
	}
	const fallbacks = Array.isArray(input.fallbacks)
		? input.fallbacks.map((entry, index) =>
				parseTrafficRoutingOfferingId(
					entry,
					`${path}.fallbacks[${index}]`,
				),
			)
		: [...DEFAULT_TRAFFIC_ROUTING_FALLBACKS];
	return deepFreeze({
		provider: parseRoutingProvider(input.provider, `${path}.provider`),
		offerings,
		fallbacks: deepFreeze(fallbacks),
	});
}

/**
 * Match requested offerings against a provider profile with prefer/require
 * negotiation and the profile's fallback ladder.
 */
export function matchTrafficRoutingOfferings(
	profile: TrafficRoutingProviderProfile,
	request: TrafficRoutingPortRequest = {},
): TrafficRoutingMatch {
	const requested = request.features ?? [];
	const negotiation = request.negotiation ?? "prefer";
	const native = new Set(profile.offerings.map((entry) => entry.id));
	const fallbacks = profile.fallbacks.filter((id) => !native.has(id));
	const available = new Set([...native, ...fallbacks]);

	if (requested.length === 0) {
		return {
			kind: "full",
			offerings: profile.offerings.map((entry) => entry.id),
		};
	}

	const present = requested.filter((id) => available.has(id));
	const missing = requested.filter((id) => !available.has(id));
	const usedFallbacks = present.filter((id) => fallbacks.includes(id));

	if (missing.length === 0 && usedFallbacks.length === 0) {
		return { kind: "full", offerings: present };
	}
	if (missing.length === 0) {
		return {
			kind: "partial",
			offerings: present,
			missing: [],
			fallbacks: usedFallbacks,
		};
	}
	if (negotiation === "require") {
		return {
			kind: "none",
			missing,
			remediation: `provider ${profile.provider} lacks required traffic-routing offerings: ${missing.join(", ")}`,
		};
	}
	if (present.length === 0) {
		return {
			kind: "none",
			missing,
			remediation: `provider ${profile.provider} cannot satisfy traffic-routing offerings: ${missing.join(", ")}`,
		};
	}
	return {
		kind: "partial",
		offerings: present,
		missing,
		fallbacks: usedFallbacks,
	};
}

/**
 * Resolve a plan request against candidate provider profiles.
 * First profile that is not `none` wins (callers should rank by cost/policy).
 */
export function resolveTrafficRouting(
	profiles: readonly TrafficRoutingProviderProfile[],
	request: TrafficRoutingPortRequest = {},
): TrafficRoutingResolveResult {
	if (profiles.length === 0) {
		return {
			kind: "unresolved",
			missing: request.features ?? ["inprocess.weighted"],
			remediation: "no traffic-routing provider profiles registered",
		};
	}
	let lastMissing: readonly TrafficRoutingOfferingId[] = request.features ?? [];
	let lastRemediation = "no provider satisfied traffic-routing request";
	for (const profile of profiles) {
		const match = matchTrafficRoutingOfferings(profile, request);
		if (match.kind === "none") {
			lastMissing = match.missing;
			lastRemediation = match.remediation;
			continue;
		}
		const strategy =
			match.kind === "full"
				? match.offerings
				: [...match.offerings, ...match.fallbacks];
		return {
			kind: "resolved",
			provider: profile.provider,
			strategy: unique(strategy),
			match,
		};
	}
	return {
		kind: "unresolved",
		missing: lastMissing,
		remediation: lastRemediation,
	};
}

export function offering(
	id: TrafficRoutingOfferingId,
	options: {
		readonly stability?: TrafficRoutingOfferingStability;
		readonly fidelity?: TrafficRoutingOfferingFidelity;
		readonly features?: readonly string[];
	} = {},
): TrafficRoutingOffering {
	return deepFreeze({
		id,
		stability: options.stability ?? "stable",
		fidelity: options.fidelity ?? "real",
		features: deepFreeze([...(options.features ?? [])]),
	});
}

function unique(
	values: readonly TrafficRoutingOfferingId[],
): readonly TrafficRoutingOfferingId[] {
	return deepFreeze([...new Set(values)]);
}

function fail(path: string, expected: string, received: unknown): never {
	throw new TrafficRoutingParseError(path, expected, received);
}
