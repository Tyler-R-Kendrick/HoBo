import type { CiProjectEnvironment } from "./project-config.js";
import {
	DEFAULT_CI_ENGINE_ID,
	isKnownCiEngineId,
	normalizeCiEngineSelection,
} from "./ci-engine-inventory.js";

export interface CiEngineRelayOverride {
	readonly relayOrigin?: string;
}

export function parseEnvironmentEngineList(
	raw: unknown,
): readonly string[] | undefined {
	if (raw === undefined) return undefined;
	if (Array.isArray(raw)) {
		const engines = raw.map(String);
		for (const engine of engines) {
			if (!isKnownCiEngineId(engine)) throw new Error("invalid engine list");
		}
		return Object.freeze([...engines]);
	}
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		const engines = Object.keys(raw as Record<string, unknown>);
		for (const engine of engines) {
			if (!isKnownCiEngineId(engine)) throw new Error("invalid engine list");
		}
		return Object.freeze([...engines]);
	}
	throw new Error("invalid engine list");
}

export function parseEnvironmentEngineRelays(
	raw: unknown,
): Readonly<Record<string, CiEngineRelayOverride>> | undefined {
	if (raw === undefined) return undefined;
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new Error("invalid engine relay overrides");
	const entries = Object.entries(raw as Record<string, unknown>);
	const result: Record<string, CiEngineRelayOverride> = {};
	for (const [engine, value] of entries) {
		if (!isKnownCiEngineId(engine)) throw new Error("invalid engine relay override");
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new Error("invalid engine relay override");
		const relayOrigin = (value as { relayOrigin?: unknown }).relayOrigin;
		if (
			relayOrigin !== undefined &&
			(typeof relayOrigin !== "string" || relayOrigin.length === 0)
		)
			throw new Error("invalid engine relay override");
		result[engine] = Object.freeze({
			...(relayOrigin !== undefined ? { relayOrigin: String(relayOrigin) } : {}),
		});
	}
	return Object.freeze(result);
}

export function resolveEnvironmentEngines(options: {
	readonly environment: Pick<
		CiProjectEnvironment,
		"engines" | "engineRelays"
	>;
	readonly inventory: readonly string[];
	readonly cliEngines?: readonly string[] | undefined;
}): readonly string[] {
	const selection: {
		inventory: readonly string[];
		configured?: readonly string[];
		cli?: readonly string[];
	} = { inventory: options.inventory };
	if (options.environment.engines) selection.configured = options.environment.engines;
	if (options.cliEngines && options.cliEngines.length > 0)
		selection.cli = options.cliEngines;
	return normalizeCiEngineSelection(selection);
}

export function resolveEngineRelayOrigin(
	environment: Pick<
		CiProjectEnvironment,
		"relayOrigin" | "engineRelays" | "allowInsecureLoopback"
	>,
	engineId: string,
): string {
	const override = environment.engineRelays?.[engineId]?.relayOrigin;
	return override ?? environment.relayOrigin;
}

export function collectAllowedRelayOrigins(
	environment: Pick<
		CiProjectEnvironment,
		"relayOrigin" | "engineRelays"
	>,
): readonly string[] {
	const origins = new Set<string>([environment.relayOrigin]);
	for (const override of Object.values(environment.engineRelays ?? {}))
		if (override.relayOrigin) origins.add(override.relayOrigin);
	return Object.freeze([...origins]);
}

export function defaultCiWebhookEngine(): string {
	return DEFAULT_CI_ENGINE_ID;
}
