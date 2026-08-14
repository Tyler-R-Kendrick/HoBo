/**
 * Read a project's Bindle declaration without executing it.
 * Used to fulfill local Station occupancy (Yard / Camp / resource board).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export type LocalCapabilityFidelity = "real" | "mocked" | "camp-only";

export interface LocalBindleCapability {
	readonly kind: BindleResourceKind;
	readonly available: boolean;
	readonly fidelity: LocalCapabilityFidelity;
	readonly note: string;
}

type CatalogBindleKind = Exclude<BindleResourceKind, "experiment">;

/** ADR-0042 local fidelity. Station-hosted kinds are real, not simulated. */
const LOCAL_CAPABILITY: Record<
	CatalogBindleKind,
	{ readonly fidelity: LocalCapabilityFidelity; readonly note: string }
> = {
	api: {
		fidelity: "real",
		note: "Station-local HTTP via runtime-local / hobo dev",
	},
	web: {
		fidelity: "real",
		note: "Station-local HTTP via runtime-local / hobo dev",
	},
	service: {
		fidelity: "real",
		note: "Station-local HTTP via runtime-local / hobo dev",
	},
	ui: { fidelity: "real", note: "served on the Station-local HTTP listener" },
	websocket: {
		fidelity: "real",
		note: "Station-local upgrade on the HTTP listener",
	},
	kv: { fidelity: "real", note: "Station-local key-value (runtime-local)" },
	bucket: { fidelity: "real", note: "Station-local object store directory" },
	queue: { fidelity: "real", note: "Station-local queue (runtime-local)" },
	topic: { fidelity: "real", note: "Station-local pub/sub (runtime-local)" },
	data: { fidelity: "real", note: "Station-local SQLite EventStore" },
	schedule: { fidelity: "real", note: "Station-local timers (runtime-local)" },
	job: { fidelity: "real", note: "Station-local workers (runtime-local)" },
	flag: {
		fidelity: "real",
		note: "Station-local FeatureFlagStore (hobo:feature-flag)",
	},
	auth: { fidelity: "real", note: "Station-local policy/auth engine" },
	"wasm-component": {
		fidelity: "real",
		note: "Station-local component host (runtime-local)",
	},
	secret: { fidelity: "mocked", note: "local stub / .env — not a real KMS" },
	notify: { fidelity: "mocked", note: "logged locally; no provider delivery" },
	crypto: { fidelity: "mocked", note: "local stub — not a brokered KMS" },
	guardrail: {
		fidelity: "mocked",
		note: "local policy seam; Camp for live packs",
	},
	external: {
		fidelity: "mocked",
		note: "contract stub unless hobo dev --connect",
	},
	container: {
		fidelity: "camp-only",
		note: "needs a local container engine; not assumed",
	},
	rollout: {
		fidelity: "real",
		note: "Station-local OpenDelivery (hobo:delivery) sidecar",
	},
};

/** Station-hosted engines — occupancy sidecars, not catalog rows. */
const STATION_HOSTED_KINDS = new Set<BindleResourceKind>(["experiment"]);

export function localBindleCapabilities(): readonly LocalBindleCapability[] {
	return BINDLE_RESOURCE_KINDS.filter(
		(kind): kind is CatalogBindleKind => !STATION_HOSTED_KINDS.has(kind),
	).map((kind) => {
		const row = LOCAL_CAPABILITY[kind];
		return {
			kind,
			available: row.fidelity !== "camp-only",
			fidelity: row.fidelity,
			note: row.note,
		};
	});
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
	const counts = new Map<string, number>();
	const resources: InspectedBindleResource[] = [];
	for (const match of source.matchAll(FACTORY_CALL)) {
		const kind = match[1];
		if (!kind || !KIND_SET.has(kind)) continue;
		const used = (counts.get(kind) ?? 0) + 1;
		counts.set(kind, used);
		resources.push({
			kind: kind as BindleResourceKind,
			name: used === 1 ? kind : `${kind}-${used}`,
			dependsOn: [],
			allow: [],
		});
	}

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
			const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as unknown;
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
	raw: unknown,
	fallbackName?: string,
): InspectedBindle | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const value = raw as {
		name?: unknown;
		resources?: unknown;
		services?: unknown;
	};
	const name =
		typeof value.name === "string" && value.name.length > 0
			? value.name
			: (fallbackName ?? "app");
	const resources: InspectedBindleResource[] = [];
	if (value.resources && typeof value.resources === "object") {
		for (const [key, entry] of Object.entries(
			value.resources as Record<string, unknown>,
		)) {
			const rec =
				entry && typeof entry === "object"
					? (entry as {
							kind?: string;
							name?: string;
							dependsOn?: unknown;
							declaredAllow?: unknown;
						})
					: {};
			const kind = typeof rec.kind === "string" ? rec.kind : key;
			if (!KIND_SET.has(kind)) continue;
			resources.push({
				kind: kind as BindleResourceKind,
				name: typeof rec.name === "string" ? rec.name : key,
				dependsOn: Array.isArray(rec.dependsOn)
					? rec.dependsOn.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
				allow: Array.isArray(rec.declaredAllow)
					? rec.declaredAllow.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
			});
		}
	}
	if (Array.isArray(value.services)) {
		for (const service of value.services) {
			if (!service || typeof service !== "object") continue;
			const rec = service as { name?: string; kind?: string };
			const kind = rec.kind === "web" ? "web" : "api";
			const serviceName = typeof rec.name === "string" ? rec.name : kind;
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
