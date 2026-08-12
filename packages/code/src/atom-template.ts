import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ATOMS_ROOT = join(PACKAGE_ROOT, "templates", "atoms");
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

function asStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function parseParams(value: unknown): AtomParamSchema {
	if (value === null || typeof value !== "object") {
		return { required: [], properties: {} };
	}
	const record = value as {
		readonly required?: unknown;
		readonly properties?: unknown;
	};
	const properties: Record<string, AtomParamProperty> = {};
	if (record.properties && typeof record.properties === "object") {
		for (const [key, spec] of Object.entries(
			record.properties as Record<string, unknown>,
		)) {
			if (!spec || typeof spec !== "object") continue;
			const item = spec as {
				type?: unknown;
				minLength?: unknown;
				pattern?: unknown;
				default?: unknown;
			};
			if (item.type !== "string") continue;
			properties[key] = {
				type: "string",
				...(typeof item.minLength === "number"
					? { minLength: item.minLength }
					: {}),
				...(typeof item.pattern === "string" ? { pattern: item.pattern } : {}),
				...(typeof item.default === "string" ? { default: item.default } : {}),
			};
		}
	}
	return { required: asStringList(record.required), properties };
}

function parseFiles(value: unknown): AtomFileSpec[] {
	if (!Array.isArray(value)) return [];
	const files: AtomFileSpec[] = [];
	for (const item of value) {
		if (
			item &&
			typeof item === "object" &&
			typeof (item as { path?: unknown }).path === "string" &&
			typeof (item as { from?: unknown }).from === "string"
		) {
			files.push({
				path: (item as { path: string }).path,
				from: (item as { from: string }).from,
			});
		}
	}
	return files;
}

function parseTier(value: unknown): 0 | 1 | 2 {
	if (value === 0 || value === 1 || value === 2) return value;
	return 1;
}

export function parseAtomTemplate(
	dir: string,
	raw: unknown,
): AtomTemplate | null {
	if (raw === null || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.id !== "string" || record.id.length === 0) return null;
	if (typeof record.description !== "string") return null;
	const files = parseFiles(record.files);
	if (files.length === 0) return null;
	return {
		id: record.id,
		tier: parseTier(record.tier),
		kind: typeof record.kind === "string" ? record.kind : "atom",
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

export function parseAtomComposition(raw: unknown): AtomComposition | null {
	if (raw === null || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.id !== "string" || record.id.length === 0) return null;
	const atoms = asStringList(record.atoms);
	if (atoms.length === 0) return null;
	return {
		id: record.id,
		description:
			typeof record.description === "string" ? record.description : record.id,
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

export function loadAtomCorpus(): {
	readonly atoms: readonly AtomTemplate[];
	readonly compositions: readonly AtomComposition[];
} {
	const atoms: AtomTemplate[] = [];
	if (existsSync(ATOMS_ROOT)) {
		for (const name of readdirSync(ATOMS_ROOT)) {
			const dir = join(ATOMS_ROOT, name);
			if (!statSync(dir).isDirectory()) continue;
			const manifest = manifestPath(dir);
			if (!manifest) continue;
			const parsed = parseAtomTemplate(
				dir,
				JSON.parse(readFileSync(manifest, "utf8")) as unknown,
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
				JSON.parse(
					readFileSync(join(COMPOSITIONS_ROOT, name), "utf8"),
				) as unknown,
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
): Record<string, string> {
	const filled: Record<string, string> = { ...params };
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
