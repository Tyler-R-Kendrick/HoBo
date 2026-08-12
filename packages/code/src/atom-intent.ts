import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const INTENTS_ROOT = join(PACKAGE_ROOT, "templates", "intents");

export interface ClosedIntent {
	readonly id: string;
	readonly description: string;
	readonly phrases: readonly string[];
	readonly atoms: readonly string[];
	readonly params: Readonly<Record<string, string>>;
}

function asStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function asStringMap(value: unknown): Record<string, string> {
	if (value === null || typeof value !== "object") return {};
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (typeof item === "string") out[key] = item;
	}
	return out;
}

export function parseClosedIntent(raw: unknown): ClosedIntent | null {
	if (raw === null || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.id !== "string" || record.id.length === 0) return null;
	const atoms = asStringList(record.atoms);
	const phrases = asStringList(record.phrases);
	if (atoms.length === 0 || phrases.length === 0) return null;
	return {
		id: record.id,
		description:
			typeof record.description === "string" ? record.description : record.id,
		phrases,
		atoms,
		params: asStringMap(record.params),
	};
}

export function loadClosedIntents(): readonly ClosedIntent[] {
	if (!existsSync(INTENTS_ROOT)) return [];
	const intents: ClosedIntent[] = [];
	for (const name of readdirSync(INTENTS_ROOT)) {
		if (!name.endsWith(".json")) continue;
		const parsed = parseClosedIntent(
			JSON.parse(readFileSync(join(INTENTS_ROOT, name), "utf8")) as unknown,
		);
		if (parsed) intents.push(parsed);
	}
	return intents.sort((left, right) => left.id.localeCompare(right.id));
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, " ")
		.trim();
}

/**
 * Closed-world phrase match. Longest phrase wins. No embedding, no LLM.
 */
export function matchClosedIntent(
	intent: string,
	catalog: readonly ClosedIntent[] = loadClosedIntents(),
): ClosedIntent | undefined {
	const normalized = normalize(intent);
	if (normalized.length === 0) return undefined;
	let best: { intent: ClosedIntent; length: number } | undefined;
	for (const item of catalog) {
		for (const phrase of item.phrases) {
			const needle = normalize(phrase);
			if (needle.length === 0) continue;
			const hit =
				normalized === needle ||
				normalized.startsWith(`${needle} `) ||
				normalized.endsWith(` ${needle}`) ||
				normalized.includes(` ${needle} `);
			if (!hit) continue;
			if (!best || needle.length > best.length) {
				best = { intent: item, length: needle.length };
			}
		}
	}
	return best?.intent;
}
