/**
 * Read a project's Bindle declaration without executing it.
 * Used to fulfill local Station occupancy (Yard / Camp / resource board).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

export const BINDLE_RESOURCE_KINDS = [
	"api",
	"web",
	"kv",
	"bucket",
	"queue",
	"topic",
	"secret",
	"data",
	"schedule",
	"websocket",
	"job",
	"service",
	"flag",
	"auth",
	"crypto",
	"notify",
	"guardrail",
	"ui",
	"experiment",
	"rollout",
	"external",
	"container",
	"wasm-component",
] as const;

export type BindleResourceKind = (typeof BINDLE_RESOURCE_KINDS)[number];

interface BindleResourceEntry {
	kind?: string;
	name?: string;
	dependsOn?: unknown;
	declaredAllow?: unknown;
}

function bindleResourceEntry(entry: JsonValue): BindleResourceEntry {
	if (!entry || !isJsonObject(entry)) {
		return {};
	}
	// SAFETY: [object Object] guard proved entry is a bindle resource record.
	return entry as BindleResourceEntry;
}

export interface LocalBindleCapability {
	readonly kind: BindleResourceKind;
	readonly available: boolean;
}

type CatalogBindleKind = Exclude<BindleResourceKind, "experiment">;

/** Station-hosted kinds are available. Everything else is unavailable — no mocks. */
const LOCAL_CAPABILITY = {
	api: true,
	web: true,
	service: true,
	ui: true,
	websocket: true,
	kv: true,
	bucket: true,
	queue: true,
	topic: true,
	data: true,
	schedule: true,
	job: true,
	flag: true,
	auth: true,
	"wasm-component": true,
	secret: true,
	notify: false,
	crypto: true,
	guardrail: false,
	external: false,
	container: false,
	rollout: true,
};

/** Station-hosted engines — occupancy sidecars, not catalog rows. */
const STATION_HOSTED_KINDS = new Set<BindleResourceKind>(["experiment"]);

export function localBindleCapabilities(): readonly LocalBindleCapability[] {
	return BINDLE_RESOURCE_KINDS.filter(
		(kind): kind is CatalogBindleKind => !STATION_HOSTED_KINDS.has(kind),
	).map((kind) => ({
		kind,
		available: LOCAL_CAPABILITY[kind],
	}));
}

export interface InspectedBindleResource {
	readonly kind: BindleResourceKind;
	readonly name: string;
	readonly dependsOn: readonly string[];
	readonly allow: readonly string[];
}

export interface InspectedBindle {
	readonly name: string;
	readonly resources: readonly InspectedBindleResource[];
	readonly envKeys: readonly string[];
	readonly requirements: readonly string[];
}

const KIND_SET = new Set<string>(BINDLE_RESOURCE_KINDS);

const BINDLE_NAME = /bindle\s*\(\s*["']([^"']+)["']/u;
const FACTORY_CALL = /\.(\w+)\s*\(/gu;
const ENV_OBJECT = /env\s*\(\s*\{([^}]*)\}/u;
export function inspectBindleSource(
	source: string,
	fallbackName = "app",
): InspectedBindle {
	const name = BINDLE_NAME.exec(source)?.[1]?.trim() || fallbackName;
	const named = resourcesFromReturnedBindle(source);
	const resources: InspectedBindleResource[] =
		named.length > 0 ? named : resourcesFromFactoryCalls(source);

	const envBody = ENV_OBJECT.exec(source)?.[1] ?? "";
	const envKeys = [...envBody.matchAll(/([A-Z][A-Z0-9_]*)\s*:/gu)].map(
		(match) => match[1] ?? "",
	);

	const requirements = inferRequirements(resources);
	return {
		name,
		resources: dedupeResources(resources),
		envKeys: envKeys.filter((key) => key.length > 0),
		requirements,
	};
}

export function inspectBindleProject(
	projectDir: string,
	fallbackName?: string,
): InspectedBindle | undefined {
	const jsonPath = join(projectDir, "hobo.bindle.json");
	if (existsSync(jsonPath)) {
		try {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const parsed = parseJsonValue(readFileSync(jsonPath, "utf8"));
			const fromJson = inspectBindleJson(parsed, fallbackName);
			if (fromJson) return fromJson;
		} catch {
			// fall through to source
		}
	}
	for (const rel of ["src/bindle.ts", "src/bindle.js", "dist/bindle.js"]) {
		const path = join(projectDir, rel);
		if (!existsSync(path)) continue;
		try {
			return inspectBindleSource(
				readFileSync(path, "utf8"),
				fallbackName ?? projectDir.split(/[/\\]/u).at(-1) ?? "app",
			);
		} catch {
			// try next
		}
	}
	return undefined;
}

function inspectBindleJson(
	raw: JsonValue | undefined,
	fallbackName?: string,
): InspectedBindle | undefined {
	if (!raw || !isJsonObject(raw)) return undefined;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const value = raw as {
		name?: unknown;
		resources?: unknown;
		services?: unknown;
	};
	const name =
		isJsonString(value.name) && value.name.length > 0
			? value.name
			: (fallbackName ?? "app");
	const resources: InspectedBindleResource[] = [];
	if (value.resources && isJsonObject(value.resources)) {
		for (const [key, entry] of Object.entries(
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			value.resources as JsonObject,
		)) {
			const rec = bindleResourceEntry(entry);
			const kind = isJsonString(rec.kind) ? rec.kind : key;
			if (!KIND_SET.has(kind)) continue;
			resources.push({
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				kind: kind as BindleResourceKind,
				name: isJsonString(rec.name) ? rec.name : key,
				dependsOn: Array.isArray(rec.dependsOn)
					? rec.dependsOn.filter((item): item is string => isJsonString(item))
					: [],
				allow: Array.isArray(rec.declaredAllow)
					? rec.declaredAllow.filter((item): item is string =>
							isJsonString(item),
						)
					: [],
			});
		}
	}
	if (Array.isArray(value.services)) {
		for (const service of value.services) {
			if (!service || !isJsonObject(service)) continue;
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const rec = service as { name?: string; kind?: string };
			const kind = rec.kind === "web" ? "web" : "api";
			const serviceName = isJsonString(rec.name) ? rec.name : kind;
			if (!resources.some((row) => row.name === serviceName)) {
				resources.push({
					kind,
					name: serviceName,
					dependsOn: [],
					allow: [],
				});
			}
		}
	}
	if (resources.length === 0 && name === (fallbackName ?? "app")) {
		return undefined;
	}
	return {
		name,
		resources,
		envKeys: [],
		requirements: inferRequirements(resources),
	};
}

function resourcesFromFactoryCalls(source: string): InspectedBindleResource[] {
	const counts = new Map<string, number>();
	const resources: InspectedBindleResource[] = [];
	for (const match of source.matchAll(FACTORY_CALL)) {
		const kind = match[1];
		if (!kind || !KIND_SET.has(kind)) continue;
		const used = (counts.get(kind) ?? 0) + 1;
		counts.set(kind, used);
		resources.push({
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			kind: kind as BindleResourceKind,
			name: used === 1 ? kind : `${kind}-${used}`,
			dependsOn: [],
			allow: [],
		});
	}
	return resources;
}

function resourcesFromReturnedBindle(
	source: string,
): InspectedBindleResource[] {
	const assigned = new Map<string, BindleResourceKind>();
	const assign =
		/(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*\.([A-Za-z_]\w*)\s*\(/gu;
	for (const match of source.matchAll(assign)) {
		const ident = match[1];
		const kind = match[2];
		if (!ident || !kind || !KIND_SET.has(kind)) continue;
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		assigned.set(ident, kind as BindleResourceKind);
	}
	const block = returnedObjectBody(source);
	if (block === undefined) return [];
	const resources: InspectedBindleResource[] = [];
	for (const part of splitObjectEntries(block)) {
		const inline =
			/^([A-Za-z_]\w*)\s*:\s*[A-Za-z_]\w*\.([A-Za-z_]\w*)\s*\(/u.exec(part);
		const aliased = /^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)\s*$/u.exec(part);
		const short = /^([A-Za-z_]\w*)\s*$/u.exec(part);
		let name: string | undefined;
		let kind: BindleResourceKind | undefined;
		if (inline?.[1] && inline[2] && KIND_SET.has(inline[2])) {
			name = inline[1];
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			kind = inline[2] as BindleResourceKind;
		} else if (aliased?.[1] && aliased[2]) {
			name = aliased[1];
			kind = assigned.get(aliased[2]);
		} else if (short?.[1]) {
			name = short[1];
			kind = assigned.get(short[1]);
		}
		if (!name || !kind) continue;
		resources.push({
			kind,
			name,
			dependsOn: [],
			allow: [],
		});
	}
	return resources;
}

/**
 * Extract the body of the returned resource object, matching braces rather than
 * stopping at the first `}`.
 *
 * This used to be `/return\s*\{([\s\S]*?)\}/`, which is non-greedy and therefore
 * ends at the first closing brace it meets. A resource declared with inline
 * options — `{ cart: b.kv({ ttl: 60 }), orders: b.data() }` — closes a brace
 * partway through the first entry, so the captured body was
 * `" cart: b.kv({ ttl: 60 "` and *every resource declared after it silently
 * vanished*. The Station would then never provision `orders`, and the app would
 * fail at runtime against a dependency it had correctly declared.
 *
 * Scanning for the matching brace is what `splitObjectEntries` below already
 * does for the same reason.
 */
function returnedObjectBody(source: string): string | undefined {
	const opener =
		/return\s*\{/u.exec(source) ?? /=>\s*\(\s*\{/u.exec(source) ?? undefined;
	if (!opener) return undefined;
	const start = opener.index + opener[0].length;
	let depth = 1;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(start, index);
		}
	}
	// Unbalanced source (truncated file, or a `{` inside a string we do not
	// parse). Fall back to the rest of the file rather than dropping everything:
	// a partial read is better than reporting no resources at all.
	return source.slice(start);
}

function splitObjectEntries(body: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (char === "(" || char === "{" || char === "[") depth += 1;
		else if (char === ")" || char === "}" || char === "]") depth -= 1;
		else if (char === "," && depth === 0) {
			parts.push(body.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(body.slice(start));
	return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function inferRequirements(
	resources: readonly InspectedBindleResource[],
): readonly string[] {
	const require = new Set<string>();
	if (
		resources.some(
			(row) =>
				row.kind === "api" || row.kind === "web" || row.kind === "service",
		)
	) {
		require.add("managed-http-runtime");
	}
	if (resources.some((row) => row.kind === "kv")) require.add("key-value");
	if (resources.some((row) => row.kind === "bucket"))
		require.add("object-store");
	if (resources.some((row) => row.kind === "data")) require.add("data");
	if (resources.some((row) => row.kind === "queue")) require.add("queue");
	if (resources.some((row) => row.kind === "topic")) require.add("topic");
	if (resources.some((row) => row.kind === "secret")) require.add("secrets");
	return [...require];
}

function dedupeResources(
	resources: readonly InspectedBindleResource[],
): InspectedBindleResource[] {
	const seen = new Set<string>();
	const out: InspectedBindleResource[] = [];
	for (const row of resources) {
		const key = `${row.kind}:${row.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(row);
	}
	return out;
}
