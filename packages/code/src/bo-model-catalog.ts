/**
 * Models available to HoBo Bo (and Bo subagents).
 *
 * Each offer carries a Package-URL (`pkg:…`) so the same display name from
 * different providers/harnesses stays distinct (saved Codex model ≠ local ollama).
 *
 * Coding harness configure uses `harness-model-catalog` instead — never this list.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { loadHarnessSettings } from "./harness-settings.js";
import { DEFAULT_OLLAMA_HOST } from "./ollama-engine.js";

// public-contract: Bo model catalog offer schema id
export const BO_MODEL_CATALOG_SCHEMA = "hobo.code.bo-model-catalog/v1" as const;

export type BoModelSource =
	| "ollama"
	| "harness"
	| "env"
	| "byok"
	| "openai-compatible";

export interface BoModelOffer {
	readonly schema: typeof BO_MODEL_CATALOG_SCHEMA;
	/** Unique Package-URL identity. */
	readonly purl: string;
	/** Short label for the picker. */
	readonly label: string;
	/** Runtime / CLI model id stored in harness-settings.model. */
	readonly runtimeId: string;
	readonly source: BoModelSource;
	readonly harnessId?: string;
}

export interface ParsedModelPurl {
	readonly type: string;
	readonly name: string;
	readonly version?: string;
	readonly qualifiers: Readonly<Record<string, string>>;
}

function encodeQualifier(value: string): string {
	return encodeURIComponent(value);
}

function hostQualifier(host: string): string {
	return host
		.replace(/^https?:\/\//u, "")
		.replace(/\/$/u, "");
}

function splitOllamaTag(tag: string): { name: string; version?: string } {
	const trimmed = tag.trim();
	const colon = trimmed.lastIndexOf(":");
	if (colon <= 0) return { name: trimmed };
	return {
		name: trimmed.slice(0, colon),
		version: trimmed.slice(colon + 1),
	};
}

export function buildOllamaModelPurl(input: {
	readonly tag: string;
	readonly host?: string;
	readonly via?: string;
}): string {
	const { name, version } = splitOllamaTag(input.tag);
	const host = hostQualifier(input.host ?? DEFAULT_OLLAMA_HOST);
	const q: string[] = [];
	if (input.via) q.push(`via=${encodeQualifier(input.via)}`);
	q.push(`host=${encodeQualifier(host)}`);
	const namePath = version ? `${name}@${version}` : name;
	return `pkg:ollama/${namePath}?${q.join("&")}`;
}

export function buildProviderModelPurl(input: {
	readonly type: string;
	readonly name: string;
	readonly version?: string;
	readonly via: string;
	readonly extra?: Readonly<Record<string, string>>;
}): string {
	const namePath = input.version
		? `${input.name}@${input.version}`
		: input.name;
	const q = [`via=${encodeQualifier(input.via)}`];
	if (input.extra) {
		for (const [key, value] of Object.entries(input.extra)) {
			q.push(`${key}=${encodeQualifier(value)}`);
		}
	}
	return `pkg:${input.type}/${namePath}?${q.join("&")}`;
}

export function parseModelPurl(purl: string): ParsedModelPurl | null {
	const m = /^pkg:([a-z0-9][a-z0-9.-]*)\/([^?@]+)(?:@([^?]+))?(?:\?(.*))?$/iu.exec(
		purl.trim(),
	);
	if (!m) return null;
	const qualifiers: Record<string, string> = {};
	if (m[4]) {
		for (const part of m[4].split("&")) {
			const eq = part.indexOf("=");
			if (eq <= 0) continue;
			qualifiers[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(
				part.slice(eq + 1),
			);
		}
	}
	return {
		type: m[1]!.toLowerCase(),
		name: decodeURIComponent(m[2]!),
		...(m[3] ? { version: decodeURIComponent(m[3]) } : {}),
		qualifiers,
	};
}

/** Map a stored PURL back to the runtime model id used by engines / seat CLIs. */
export function runtimeModelFromPurl(purl: string): string {
	const parsed = parseModelPurl(purl);
	if (!parsed) return purl;
	const tag =
		parsed.version !== undefined
			? `${parsed.name}:${parsed.version}`
			: parsed.name;
	if (parsed.type === "ollama") return `ollama/${tag}`;
	return tag;
}

function guessPurlType(runtimeId: string): string {
	const lower = runtimeId.toLowerCase();
	if (lower.startsWith("ollama/")) return "ollama";
	if (lower.startsWith("anthropic/") || lower.startsWith("claude")) {
		return "anthropic";
	}
	if (lower.startsWith("google/") || lower.startsWith("gemini")) return "google";
	if (lower.startsWith("xai/") || lower.startsWith("grok")) return "xai";
	if (lower.startsWith("openrouter/")) return "openrouter";
	if (lower.startsWith("azure/")) return "openai";
	if (lower.startsWith("openai/")) return "openai";
	return "openai";
}

function stripProviderPrefix(runtimeId: string): string {
	const i = runtimeId.indexOf("/");
	if (i <= 0) return runtimeId;
	const prefix = runtimeId.slice(0, i).toLowerCase();
	if (
		[
			"ollama",
			"openai",
			"anthropic",
			"google",
			"gemini",
			"xai",
			"openrouter",
			"azure",
			"local",
		].includes(prefix)
	) {
		return runtimeId.slice(i + 1);
	}
	return runtimeId;
}

function offerFromHarness(
	harnessId: string,
	runtimeId: string,
): BoModelOffer | null {
	const trimmed = runtimeId.trim();
	if (!trimmed) return null;
	if (trimmed.toLowerCase().startsWith("ollama/")) {
		const tag = trimmed.slice("ollama/".length);
		const purl = buildOllamaModelPurl({ tag, via: harnessId });
		return {
			schema: BO_MODEL_CATALOG_SCHEMA,
			purl,
			label: `${tag} · ${harnessId}`,
			runtimeId: trimmed,
			source: "harness",
			harnessId,
		};
	}
	const name = stripProviderPrefix(trimmed);
	const type = guessPurlType(trimmed);
	const purl = buildProviderModelPurl({ type, name, via: harnessId });
	return {
		schema: BO_MODEL_CATALOG_SCHEMA,
		purl,
		label: `${name} · ${harnessId}`,
		runtimeId: trimmed,
		source: "harness",
		harnessId,
	};
}

function listSavedHarnessIds(hoboHome: string): string[] {
	const dir = join(hoboHome, "durable", "code", "harness-settings");
	try {
		return readdirSync(dir)
			.filter((name) => name.endsWith(".json"))
			.map((name) => name.replace(/\.json$/u, ""));
	} catch {
		return [];
	}
}

export interface ListBoModelOffersInput {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly ollama?: {
		readonly host: string;
		readonly models: readonly string[];
	};
	/** Extra harness ids to load even if no settings file yet. */
	readonly harnessIds?: readonly string[];
}

/**
 * Aggregate models Bo can reach: live ollama tags, saved harness settings
 * (provenance for Bo routing), HOBO_CODE_MODEL, and openai-compatible locals.
 * Does **not** invent BYOK seed models — harness pickers use harness-model-catalog.
 */
export function listBoModelOffers(
	input: ListBoModelOffersInput,
): readonly BoModelOffer[] {
	const env = input.env ?? process.env;
	const byPurl = new Map<string, BoModelOffer>();
	const add = (offer: BoModelOffer | null | undefined) => {
		if (!offer) return;
		if (!byPurl.has(offer.purl)) byPurl.set(offer.purl, offer);
	};

	const ollamaHost = input.ollama?.host ?? env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
	for (const tag of input.ollama?.models ?? []) {
		const purl = buildOllamaModelPurl({ tag, host: ollamaHost });
		add({
			schema: BO_MODEL_CATALOG_SCHEMA,
			purl,
			label: `${tag} · ollama`,
			runtimeId: `ollama/${tag}`,
			source: "ollama",
		});
	}

	const harnessIds = new Set([
		...listSavedHarnessIds(input.hoboHome),
		...(input.harnessIds ?? []),
	]);
	for (const id of harnessIds) {
		if (id === "hobo-code") continue;
		const settings = loadHarnessSettings(input.hoboHome, id, "harness");
		add(offerFromHarness(id, settings.model));
	}

	const active =
		typeof env.HOBO_CODE_MODEL === "string" ? env.HOBO_CODE_MODEL.trim() : "";
	if (active) {
		if (active.toLowerCase().startsWith("ollama/")) {
			const tag = active.slice("ollama/".length);
			add({
				schema: BO_MODEL_CATALOG_SCHEMA,
				purl: buildOllamaModelPurl({
					tag,
					host: "active",
					via: "env",
				}),
				label: `${tag} · HOBO_CODE_MODEL`,
				runtimeId: active,
				source: "env",
			});
		} else {
			const name = stripProviderPrefix(active);
			const type = guessPurlType(active);
			add({
				schema: BO_MODEL_CATALOG_SCHEMA,
				purl: buildProviderModelPurl({ type, name, via: "env" }),
				label: `${name} · HOBO_CODE_MODEL`,
				runtimeId: active,
				source: "env",
			});
		}
	}

	const baseUrl =
		(typeof env.OPENAI_BASE_URL === "string" && env.OPENAI_BASE_URL.trim()) ||
		(typeof env.HOBO_CODE_LOCAL_BASE_URL === "string" &&
			env.HOBO_CODE_LOCAL_BASE_URL.trim()) ||
		"";
	if (baseUrl) {
		const runtimeId =
			active && !active.toLowerCase().startsWith("ollama/")
				? active
				: "local-coder";
		const name = stripProviderPrefix(runtimeId);
		add({
			schema: BO_MODEL_CATALOG_SCHEMA,
			purl: buildProviderModelPurl({
				type: "openai",
				name,
				via: "openai-compatible",
				extra: { base_url: baseUrl },
			}),
			label: `${name} · ${hostQualifier(baseUrl)}`,
			runtimeId,
			source: "openai-compatible",
		});
	}

	return [...byPurl.values()].sort((a, b) => a.purl.localeCompare(b.purl));
}

export function findOfferIndex(
	offers: readonly BoModelOffer[],
	model: string,
	modelPurl?: string,
): number {
	if (modelPurl) {
		const byPurl = offers.findIndex((row) => row.purl === modelPurl);
		if (byPurl >= 0) return byPurl;
	}
	const trimmed = model.trim();
	if (!trimmed) return 0;
	const byRuntime = offers.findIndex((row) => row.runtimeId === trimmed);
	if (byRuntime >= 0) return byRuntime;
	return 0;
}

export function cycleBoModelOffer(
	offers: readonly BoModelOffer[],
	index: number,
	delta: 1 | -1,
): { readonly index: number; readonly offer: BoModelOffer | null } {
	if (offers.length === 0) return { index: 0, offer: null };
	const next = (index + delta + offers.length) % offers.length;
	return { index: next, offer: offers[next]! };
}
