/**
 * Platform composition ports for dogfooding stations, OpenFeature/Harness,
 * trails, and SWE provider multiplexing without inventing parallel control planes.
 */
import {
	createStationClient,
	initStation,
	listStationIds,
	type StationClient,
} from "@hobo/stations";

import { codeImprovementTrails, cqReflectHook } from "./dogfood.js";

/** OpenFeature-shaped flag evaluation port (ADR-0044 / ADR-0083). */
export interface CodeFeaturePort {
	readonly evaluateBoolean: (
		key: string,
		context: { targetingKey: string; attributes?: Readonly<Record<string, string>> },
	) => { value: boolean; reason: string; variant: string };
	readonly listKeys: () => readonly string[];
}

/** Progressive harness flags for hobo-code (evaluated via OpenFeature only). */
export const CODE_FEATURE_FLAGS = {
	harnessEnabled: "code.harness.enabled",
	visualEvidence: "code.evidence.visual",
	monetizationSurface: "code.monetization.surface",
	riftPreferred: "code.isolation.rift",
	/** Multi-node compute dispatch (capacity + isolation classes; not a chat hive). */
	distributed: "code.distributed",
} as const;

/**
 * Product defaults: every code.* progressive flag is ON by default.
 * Disable via OpenFeature / `hobo feature set <key> --percent 0` when needed.
 */
export const CODE_FEATURE_DEFAULTS: Readonly<
	Record<(typeof CODE_FEATURE_FLAGS)[keyof typeof CODE_FEATURE_FLAGS], true>
> = {
	[CODE_FEATURE_FLAGS.harnessEnabled]: true,
	[CODE_FEATURE_FLAGS.visualEvidence]: true,
	[CODE_FEATURE_FLAGS.monetizationSurface]: true,
	[CODE_FEATURE_FLAGS.riftPreferred]: true,
	[CODE_FEATURE_FLAGS.distributed]: true,
} as const;

export type SweProviderId =
	| "codex"
	| "claude"
	| "cursor"
	| "grok"
	| "gemini"
	| "copilot"
	| "flue"
	| "local";

export interface SweProviderDescriptor {
	readonly id: SweProviderId;
	readonly packageHint: string;
	readonly capable: boolean;
	readonly costUsdPerMTok: number;
}

/**
 * Multiplexer catalog over existing SWE connectors / harness bases.
 * Does not spawn agents itself — routes policy to package IDs already in monorepo.
 */
export const SWE_PROVIDER_CATALOG: readonly SweProviderDescriptor[] = [
	{
		id: "codex",
		packageHint: "@hobo/swe-codex",
		capable: true,
		costUsdPerMTok: 0.015,
	},
	{
		id: "claude",
		packageHint: "@hobo/swe-claude",
		capable: true,
		costUsdPerMTok: 0.018,
	},
	{
		id: "cursor",
		packageHint: "@hobo/swe-cursor",
		capable: true,
		costUsdPerMTok: 0.02,
	},
	{
		id: "grok",
		packageHint: "@hobo/swe-grok",
		capable: true,
		costUsdPerMTok: 0.012,
	},
	{
		id: "gemini",
		packageHint: "@hobo/swe-gemini",
		capable: true,
		costUsdPerMTok: 0.01,
	},
	{
		id: "copilot",
		packageHint: "@hobo/swe-copilot",
		capable: true,
		costUsdPerMTok: 0.014,
	},
	{
		id: "flue",
		packageHint: "withastro/flue (composition)",
		capable: true,
		costUsdPerMTok: 0,
	},
	{
		id: "local",
		packageHint: "@hobo/code local-world",
		capable: true,
		costUsdPerMTok: 0,
	},
] as const;

export function selectSweProvider(
	policy: "cheapest-capable" | "pinned" | "fallback-chain",
	pinned?: SweProviderId,
): SweProviderDescriptor {
	const capable = SWE_PROVIDER_CATALOG.filter((p) => p.capable);
	if (policy === "pinned" && pinned) {
		const hit = capable.find((p) => p.id === pinned);
		if (hit) return hit;
	}
	if (policy === "fallback-chain") {
		return capable[0] ?? SWE_PROVIDER_CATALOG[SWE_PROVIDER_CATALOG.length - 1]!;
	}
	return [...capable].sort((a, b) => a.costUsdPerMTok - b.costUsdPerMTok)[0]!;
}

export interface CodeStationBinding {
	readonly stationId: string;
	readonly railHash?: string;
	readonly bootstrapActive: boolean;
	readonly present: boolean;
	readonly remediation?: string;
}

/**
 * Resolve or bootstrap Station occupancy for a long-running code session.
 * Fails closed to remediation when Station missing and autoInit is false.
 */
export function bindCodeStation(options: {
	readonly hoboHome: string;
	readonly stationId?: string;
	readonly autoInit?: boolean;
	readonly tenant?: string;
}): CodeStationBinding {
	const requested = options.stationId;
	const ids = listStationIds(options.hoboHome);
	let stationId = requested;
	if (!stationId) {
		stationId = ids[0] ?? "station:local";
	}

	const tryOccupancy = (
		id: string,
	): { stationId: string; railHash?: string; bootstrapActive: boolean } | null => {
		try {
			const client: StationClient = createStationClient({
				hoboHome: options.hoboHome,
				stationId: id,
			});
			const occ = client.occupancy();
			if (!occ) return null;
			const pins = client.pins();
			return {
				stationId: pins.stationId,
				railHash: pins.railHash,
				bootstrapActive: pins.bootstrapActive,
			};
		} catch {
			return null;
		}
	};

	let bound = tryOccupancy(stationId);
	if (!bound && options.autoInit !== false) {
		const name = stationId.replace(/^station:/, "") || "local";
		const id = stationId.startsWith("station:") ? stationId : `station:${name}`;
		initStation({
			hoboHome: options.hoboHome,
			name,
			tenant: options.tenant ?? "local",
			id,
		});
		bound = tryOccupancy(id);
		if (bound) stationId = bound.stationId;
	}

	if (!bound) {
		return {
			stationId,
			present: false,
			bootstrapActive: false,
			remediation: "hobo station init",
		};
	}

	return {
		stationId: bound.stationId,
		...(bound.railHash !== undefined ? { railHash: bound.railHash } : {}),
		bootstrapActive: bound.bootstrapActive,
		present: true,
	};
}

export interface CodePlatformSnapshot {
	readonly station: CodeStationBinding;
	readonly features: {
		readonly harnessEnabled: boolean;
		readonly visualEvidence: boolean;
		readonly monetizationSurface: boolean;
		readonly riftPreferred: boolean;
		readonly distributed: boolean;
		readonly evaluatedKeys: readonly string[];
		/** All product defaults are ON. */
		readonly defaultsOn: true;
	};
	readonly provider: SweProviderDescriptor;
	readonly trails: ReturnType<typeof codeImprovementTrails>;
	readonly cq: ReturnType<typeof cqReflectHook>;
}

/**
 * Compose platform snapshot for status / doctor / session start.
 */
export function composeCodePlatform(options: {
	readonly hoboHome: string;
	readonly stationId?: string;
	readonly autoInitStation?: boolean;
	readonly tenant?: string;
	readonly features?: CodeFeaturePort;
	readonly targetingKey?: string;
	readonly routingPolicy?: "cheapest-capable" | "pinned" | "fallback-chain";
	readonly pinnedProvider?: SweProviderId;
}): CodePlatformSnapshot {
	const station = bindCodeStation({
		hoboHome: options.hoboHome,
		...(options.stationId !== undefined ? { stationId: options.stationId } : {}),
		autoInit: options.autoInitStation !== false,
		...(options.tenant !== undefined ? { tenant: options.tenant } : {}),
	});

	const targetingKey = options.targetingKey ?? "code-harness";
	const evalFlag = (key: string, fallback: boolean): boolean => {
		if (!options.features) return fallback;
		try {
			return options.features.evaluateBoolean(key, {
				targetingKey,
				attributes: {
					surface: "hobo-code",
					stationId: station.stationId,
				},
			}).value;
		} catch {
			return fallback;
		}
	};

	const harnessEnabled = evalFlag(
		CODE_FEATURE_FLAGS.harnessEnabled,
		CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.harnessEnabled],
	);
	const visualEvidence = evalFlag(
		CODE_FEATURE_FLAGS.visualEvidence,
		CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.visualEvidence],
	);
	const monetizationSurface = evalFlag(
		CODE_FEATURE_FLAGS.monetizationSurface,
		CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.monetizationSurface],
	);
	const riftPreferred = evalFlag(
		CODE_FEATURE_FLAGS.riftPreferred,
		CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.riftPreferred],
	);
	const distributed = evalFlag(
		CODE_FEATURE_FLAGS.distributed,
		CODE_FEATURE_DEFAULTS[CODE_FEATURE_FLAGS.distributed],
	);

	return {
		station,
		features: {
			harnessEnabled,
			visualEvidence,
			monetizationSurface,
			riftPreferred,
			distributed,
			evaluatedKeys: Object.values(CODE_FEATURE_FLAGS),
			defaultsOn: true,
		},
		provider: selectSweProvider(
			options.routingPolicy ?? "cheapest-capable",
			options.pinnedProvider,
		),
		trails: codeImprovementTrails(),
		cq: cqReflectHook(),
	};
}

/** In-memory CodeFeaturePort for offline tests — product defaults are ALL ON. */
export function createMemoryFeaturePort(
	flags: Readonly<Record<string, boolean>> = { ...CODE_FEATURE_DEFAULTS },
): CodeFeaturePort {
	return {
		evaluateBoolean(key) {
			const value =
				flags[key] ??
				CODE_FEATURE_DEFAULTS[
					key as keyof typeof CODE_FEATURE_DEFAULTS
				] ??
				true;
			return {
				value,
				reason: key in flags ? "static" : "default",
				variant: value ? "on" : "off",
			};
		},
		listKeys() {
			return Object.keys(flags);
		},
	};
}
