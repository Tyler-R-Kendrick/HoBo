const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ASSET = /^[a-z0-9][a-z0-9._-]*$/u;

export interface BrowserRuntimeManifest {
	readonly schemaVersion: "hobo.browser-wit-runtime/v1";
	readonly entryModule: string;
	readonly componentDigest: `sha256:${string}`;
	readonly sourceDigest: `sha256:${string}`;
	readonly buildDigest: `sha256:${string}`;
	readonly witWorld: "hobo:try/browser-station@0.1.0";
	readonly toolchain: {
		readonly jco: string;
		readonly componentizeJs: string;
		readonly esbuild: string;
	};
	readonly assets: readonly string[];
	readonly assetDigests: Readonly<Record<string, `sha256:${string}`>>;
}

export function parseBrowserRuntimeManifest(
	value: unknown,
): BrowserRuntimeManifest {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("Browser WIT runtime manifest must be an object");
	}
	const input = value as Record<string, unknown>;
	if (input.schemaVersion !== "hobo.browser-wit-runtime/v1") {
		throw new TypeError("Browser WIT runtime schemaVersion is invalid");
	}
	if (
		input.witWorld !== "hobo:try/browser-station@0.1.0" ||
		typeof input.entryModule !== "string" ||
		!input.entryModule.endsWith(".js") ||
		!ASSET.test(input.entryModule) ||
		!isDigest(input.componentDigest) ||
		!isDigest(input.sourceDigest) ||
		!isDigest(input.buildDigest)
	) {
		throw new TypeError("Browser WIT runtime provenance is invalid");
	}
	if (
		!Array.isArray(input.assets) ||
		input.assets.length === 0 ||
		input.assets.some((asset) => typeof asset !== "string" || !ASSET.test(asset)) ||
		new Set(input.assets).size !== input.assets.length ||
		!input.assets.includes(input.entryModule) ||
		!input.assets.includes("station.component.wasm")
	) {
		throw new TypeError("Browser WIT runtime assets are invalid");
	}
	if (
		!input.assetDigests ||
		typeof input.assetDigests !== "object" ||
		Array.isArray(input.assetDigests)
	) {
		throw new TypeError("Browser WIT runtime assetDigests are invalid");
	}
	const assets = input.assets as string[];
	const assetDigests = input.assetDigests as Record<string, unknown>;
	if (
		Object.keys(assetDigests).sort().join("\0") !== assets.toSorted().join("\0") ||
		assets.some((asset) => !isDigest(assetDigests[asset])) ||
		assetDigests["station.component.wasm"] !== input.componentDigest
	) {
		throw new TypeError("Browser WIT runtime assetDigests are invalid");
	}
	if (
		!input.toolchain ||
		typeof input.toolchain !== "object" ||
		Array.isArray(input.toolchain)
	) {
		throw new TypeError("Browser WIT runtime toolchain is invalid");
	}
	const toolchain = input.toolchain as Record<string, unknown>;
	if (
		typeof toolchain.jco !== "string" ||
		typeof toolchain.componentizeJs !== "string" ||
		typeof toolchain.esbuild !== "string"
	) {
		throw new TypeError("Browser WIT runtime toolchain is invalid");
	}
	return input as unknown as BrowserRuntimeManifest;
}

function isDigest(value: unknown): value is `sha256:${string}` {
	return typeof value === "string" && DIGEST.test(value);
}
