import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAtomsRoot } from "@hobo/patterns";
import * as v from "valibot";
import {
	isJsonNumber,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ATOMS_ROOT = defaultAtomsRoot();
export const COMPOSITIONS_ROOT = join(
	PACKAGE_ROOT,
	"templates",
	"compositions",
);

export interface AtomParamProperty {
	readonly type: "string";
	readonly minLength?: number;
	readonly pattern?: string;
	readonly default?: string;
}

export interface AtomParamSchema {
	readonly required: readonly string[];
	readonly properties: Readonly<Record<string, AtomParamProperty>>;
}

export interface AtomFileSpec {
	readonly path: string;
	readonly from: string;
}

export interface AtomTemplate {
	readonly id: string;
	readonly tier: 0 | 1 | 2;
	readonly kind: string;
	readonly description: string;
	readonly tags: readonly string[];
	readonly queries: readonly string[];
	readonly requires: readonly string[];
	readonly provides: readonly string[];
	readonly params: AtomParamSchema;
	readonly files: readonly AtomFileSpec[];
	readonly dir: string;
}

export interface AtomComposition {
	readonly id: string;
	readonly description: string;
	readonly tags: readonly string[];
	readonly queries: readonly string[];
	readonly atoms: readonly string[];
}

export interface AtomParamIssue {
	readonly atomId: string;
	readonly path: string;
	readonly message: string;
}

export interface ParseAtomParamsResult {
	readonly ok: boolean;
	readonly params: Readonly<Record<string, string>>;
	readonly issues: readonly AtomParamIssue[];
	readonly code?: "ATOM_PARAMS_INVALID";
}

function asStringList<T>(value: T): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => isJsonString(item));
}

function parseParams(value: JsonValue | undefined): AtomParamSchema {
	if (value === null || !isJsonObject(value)) {
		return { required: [], properties: {} };
	}
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const record = value as {
		readonly required?: unknown;
		readonly properties?: unknown;
	};
	const properties: Record<string, AtomParamProperty> = {};
	if (record.properties && isJsonObject(record.properties)) {
		for (const [key, spec] of Object.entries(
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			record.properties as JsonObject,
		)) {
			if (!spec || !isJsonObject(spec)) continue;
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const item = spec as {
				type?: unknown;
				minLength?: unknown;
				pattern?: unknown;
				default?: unknown;
			};
			if (item.type !== "string") continue;
			properties[key] = {
				type: "string",
				...(isJsonNumber(item.minLength)
					? { minLength: item.minLength }
					: undefined),
				...(isJsonString(item.pattern) ? { pattern: item.pattern } : undefined),
				...(isJsonString(item.default) ? { default: item.default } : undefined),
			};
		}
	}
	return { required: asStringList(record.required), properties };
}

function parseFiles(value: JsonValue | undefined): AtomFileSpec[] {
	if (!Array.isArray(value)) return [];
	const files: AtomFileSpec[] = [];
	for (const item of value) {
		if (
			item &&
			isJsonObject(item) &&
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			Object.prototype.toString.call((item as { path?: unknown }).path) ===
				"[object String]" &&
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			Object.prototype.toString.call((item as { from?: unknown }).from) ===
				"[object String]"
		) {
			files.push({
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				path: (item as { path: string }).path,
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				from: (item as { from: string }).from,
			});
		}
	}
	return files;
}

function parseTier(value: JsonValue | undefined): 0 | 1 | 2 {
	if (value === 0 || value === 1 || value === 2) return value;
	return 1;
}

export function parseAtomTemplate(
	dir: string,
	raw: JsonValue | undefined,
): AtomTemplate | null {
	if (raw === null || !isJsonObject(raw)) return null;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const record = raw as JsonObject;
	if (!isJsonString(record.id) || record.id.length === 0) return null;
	if (!isJsonString(record.description)) return null;
	const files = parseFiles(record.files);
	if (files.length === 0) return null;
	return {
		id: record.id,
		tier: parseTier(record.tier),
		kind: isJsonString(record.kind) ? record.kind : "atom",
		description: record.description,
		tags: asStringList(record.tags),
		queries: asStringList(record.queries),
		requires: asStringList(record.requires),
		provides: asStringList(record.provides),
		params: parseParams(record.params),
		files,
		dir,
	};
}

export function parseAtomComposition(
	raw: JsonValue | undefined,
): AtomComposition | null {
	if (raw === null || !isJsonObject(raw)) return null;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const record = raw as JsonObject;
	if (!isJsonString(record.id) || record.id.length === 0) return null;
	const atoms = asStringList(record.atoms);
	if (atoms.length === 0) return null;
	return {
		id: record.id,
		description: isJsonString(record.description)
			? record.description
			: record.id,
		tags: asStringList(record.tags),
		queries: asStringList(record.queries),
		atoms,
	};
}

function manifestPath(dir: string): string | null {
	const meta = join(dir, "meta.json");
	if (existsSync(meta)) return meta;
	const legacy = join(dir, "atom.json");
	if (existsSync(legacy)) return legacy;
	return null;
}

export function loadAtomCorpus() {
	const atoms: AtomTemplate[] = [];
	if (existsSync(ATOMS_ROOT)) {
		for (const name of readdirSync(ATOMS_ROOT)) {
			const dir = join(ATOMS_ROOT, name);
			if (!statSync(dir).isDirectory()) continue;
			const manifest = manifestPath(dir);
			if (!manifest) continue;
			const parsed = parseAtomTemplate(
				dir,
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				parseJsonValue(readFileSync(manifest, "utf8")),
			);
			if (parsed) atoms.push(parsed);
		}
	}
	atoms.sort((left, right) => left.id.localeCompare(right.id));
	const compositions: AtomComposition[] = [];
	if (existsSync(COMPOSITIONS_ROOT)) {
		for (const name of readdirSync(COMPOSITIONS_ROOT)) {
			if (!name.endsWith(".json")) continue;
			const parsed = parseAtomComposition(
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				parseJsonValue(readFileSync(join(COMPOSITIONS_ROOT, name), "utf8")),
			);
			if (parsed) compositions.push(parsed);
		}
	}
	compositions.sort((left, right) => left.id.localeCompare(right.id));
	return { atoms, compositions };
}

export function fillAtomBody(
	body: string,
	params: Readonly<Record<string, string>>,
): string {
	return body.replace(
		/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu,
		(_all, key: string) => {
			const value = params[key];
			if (value === undefined) {
				throw new Error(`atom param ${key} is missing`);
			}
			return value;
		},
	);
}

export function requiredParams(atom: AtomTemplate): readonly string[] {
	return atom.params.required;
}

export function applyAtomParamDefaults(
	atoms: readonly AtomTemplate[],
	params: Readonly<Record<string, string>>,
) {
	const filled = { ...params };
	for (const atom of atoms) {
		for (const [key, spec] of Object.entries(atom.params.properties)) {
			if (
				(filled[key] === undefined || filled[key] === "") &&
				spec.default !== undefined
			) {
				filled[key] = spec.default;
			}
		}
	}
	return filled;
}

function propertySchema(
	spec: AtomParamProperty,
	required: boolean,
): v.GenericSchema {
	const pattern =
		spec.pattern !== undefined ? new RegExp(spec.pattern, "u") : undefined;
	const base =
		spec.minLength !== undefined && pattern !== undefined
			? v.pipe(v.string(), v.minLength(spec.minLength), v.regex(pattern))
			: spec.minLength !== undefined
				? v.pipe(v.string(), v.minLength(spec.minLength))
				: pattern !== undefined
					? v.pipe(v.string(), v.regex(pattern))
					: v.string();
	return required ? base : v.optional(base);
}

export function parseAtomParams(
	atoms: readonly AtomTemplate[],
	params: Readonly<Record<string, string>>,
): ParseAtomParamsResult {
	const withDefaults = applyAtomParamDefaults(atoms, params);
	const issues: AtomParamIssue[] = [];
	for (const atom of atoms) {
		const entries: Record<string, v.GenericSchema> = {};
		for (const [key, spec] of Object.entries(atom.params.properties)) {
			entries[key] = propertySchema(spec, atom.params.required.includes(key));
		}
		const schema = v.object(entries);
		const result = v.safeParse(schema, withDefaults);
		if (!result.success) {
			for (const issue of result.issues) {
				issues.push({
					atomId: atom.id,
					path: issue.path?.map((item) => String(item.key)).join(".") || ".",
					message: issue.message,
				});
			}
		}
	}
	if (issues.length > 0) {
		return {
			ok: false,
			params: withDefaults,
			issues,
			code: "ATOM_PARAMS_INVALID",
		};
	}
	return { ok: true, params: withDefaults, issues: [] };
}
