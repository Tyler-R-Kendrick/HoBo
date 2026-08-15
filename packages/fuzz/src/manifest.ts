import {
	canonicalManifestHash,
	type ManifestV1,
	parseManifest,
} from "@hobo/bindles";

export function sampleManifestRecord(
	resourceOrder: readonly string[] = ["db", "api"],
): Record<string, unknown> {
	const resources: Record<string, unknown> = {};
	for (const id of resourceOrder) {
		if (id === "db") {
			resources.db = {
				type: "data.v1",
				port: "hobo:data",
				paradigm: "relational",
				allow: ["query"],
			};
		} else if (id === "site") {
			resources.site = {
				type: "website.v1",
				bind: ["api"],
			};
		} else {
			resources[id] = {
				type: "component.v1",
				image: "oci://registry.example.com/api@sha256:abc123",
				runtime: "wasm",
				exports: ["wasi:http/incoming-handler"],
				links: [{ import: "hobo:data", to: "db" }],
			};
		}
	}
	return {
		schema: "hobo.manifest/v1",
		componentHost: { kind: "wasmtime", version: "1.0.0" },
		resources,
	};
}

export function hashManifest(input: unknown): string {
	return canonicalManifestHash(parseManifest(input));
}

export function parseOrReject(input: unknown): ManifestV1 | "rejected" {
	try {
		return parseManifest(input);
	} catch {
		return "rejected";
	}
}

export function hasPrototypePollution(
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): boolean {
	if (!value || typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);
	if (
		Object.hasOwn(value, "__proto__") ||
		Object.hasOwn(value, "constructor")
	) {
		return true;
	}
	return Object.values(value as Record<string, unknown>).some((entry) =>
		hasPrototypePollution(entry, seen),
	);
}
