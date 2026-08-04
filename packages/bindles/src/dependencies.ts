import type {
	BindleDefinition,
	ContainerDependencyOptions,
	ExternalDependencyOptions,
	ProviderAnnotation,
	WasmComponentDependencyOptions,
} from "./types.js";

/** Required Camp component-host runtimes implied by bindle dependencies. */
export type RequiredRuntimeKind = "wasm" | "oci";

export const DEPENDENCY_OPTION = "dependency" as const;

/**
 * Build the dependency annotation stored on external/container/wasm-component
 * resources (and readable by broker + Camp hosts).
 */
export function dependencyAnnotation(config: {
	readonly runtime: "wasm" | "oci" | "none";
	readonly kind: "external" | "container" | "wasm-component";
	readonly image?: string;
	readonly source?: string;
	readonly witWorld?: string;
	readonly endpoints?: Readonly<Record<string, unknown>>;
	readonly connectionString?: string;
	readonly env?: Readonly<Record<string, string>>;
}): ProviderAnnotation {
	const frozen: Record<string, unknown> = {
		runtime: config.runtime,
		kind: config.kind,
	};
	if (config.image !== undefined) frozen.image = config.image;
	if (config.source !== undefined) frozen.source = config.source;
	if (config.witWorld !== undefined) frozen.witWorld = config.witWorld;
	if (config.endpoints !== undefined)
		frozen.endpoints = { ...config.endpoints };
	if (config.connectionString !== undefined) {
		frozen.connectionString = config.connectionString;
	}
	if (config.env !== undefined) frozen.env = { ...config.env };
	return Object.freeze({
		provider: "hobo",
		option: DEPENDENCY_OPTION,
		config: Object.freeze(frozen),
	});
}

export function externalDependencyAnnotation(
	options: ExternalDependencyOptions = {},
): ProviderAnnotation {
	return dependencyAnnotation({
		runtime: "none",
		kind: "external",
		...(options.connectionString !== undefined
			? { connectionString: options.connectionString }
			: {}),
		...(options.endpoints !== undefined
			? { endpoints: options.endpoints }
			: {}),
	});
}

export function containerDependencyAnnotation(
	options: ContainerDependencyOptions,
): ProviderAnnotation {
	if (typeof options.image !== "string" || options.image.length === 0) {
		throw new TypeError("container() requires a non-empty image ref");
	}
	return dependencyAnnotation({
		runtime: "oci",
		kind: "container",
		image: options.image,
		...(options.endpoints !== undefined
			? { endpoints: options.endpoints }
			: {}),
		...(options.env !== undefined ? { env: options.env } : {}),
	});
}

export function wasmComponentDependencyAnnotation(
	options: WasmComponentDependencyOptions,
): ProviderAnnotation {
	if (typeof options.source !== "string" || options.source.length === 0) {
		throw new TypeError("wasmComponent() requires a non-empty source");
	}
	return dependencyAnnotation({
		runtime: "wasm",
		kind: "wasm-component",
		source: options.source,
		...(options.witWorld !== undefined ? { witWorld: options.witWorld } : {}),
		...(options.endpoints !== undefined
			? { endpoints: options.endpoints }
			: {}),
	});
}

export function isDependencyAnnotation(
	annotation: ProviderAnnotation,
): boolean {
	return annotation.option === DEPENDENCY_OPTION;
}

export function dependencyRuntimeOf(
	annotation: ProviderAnnotation,
): "wasm" | "oci" | "none" | undefined {
	if (!isDependencyAnnotation(annotation)) return undefined;
	const runtime = annotation.config.runtime;
	if (runtime === "wasm" || runtime === "oci" || runtime === "none") {
		return runtime;
	}
	return undefined;
}

/**
 * Runtimes the broker must have installed for this bindle to place.
 * - container deps → oci
 * - wasm-component deps → wasm
 * External BYO (runtime: none) does not require a special host runtime.
 */
export function collectRequiredRuntimes(
	definition: BindleDefinition,
): readonly RequiredRuntimeKind[] {
	const required = new Set<RequiredRuntimeKind>();
	for (const record of Object.values(definition.resources)) {
		if (record.kind === "container") required.add("oci");
		if (record.kind === "wasm-component") required.add("wasm");
		for (const annotation of record.annotations) {
			const runtime = dependencyRuntimeOf(annotation);
			if (runtime === "wasm" || runtime === "oci") required.add(runtime);
		}
	}
	return Object.freeze([...required].sort());
}

/**
 * Parse dependency config from a resource's annotations (first match).
 */
export function readDependencyConfig(
	annotations: readonly ProviderAnnotation[],
): Readonly<Record<string, unknown>> | null {
	for (const annotation of annotations) {
		if (isDependencyAnnotation(annotation)) {
			return annotation.config;
		}
	}
	return null;
}

/**
 * Public endpoint discovery only (ADR-0141).
 * Never emits ConnectionStrings__* or credential-bearing values.
 * Resource access is via WIT links / ctx.bindings — not process env secrets.
 */
export function discoveryEnvForDependency(
	resourceName: string,
	config: Readonly<Record<string, unknown>> | null,
	resolved: {
		readonly httpUrl?: string;
		/** Ignored — connection strings must not enter process env (ADR-0141). */
		readonly connectionString?: string;
	},
): Record<string, string> {
	return discoveryEndpointsForDependency(resourceName, config, resolved);
}

/** Alias: public HTTP/named endpoints only. */
export function discoveryEndpointsForDependency(
	resourceName: string,
	config: Readonly<Record<string, unknown>> | null,
	resolved: {
		readonly httpUrl?: string;
		readonly connectionString?: string;
	},
): Record<string, string> {
	const env: Record<string, string> = {};
	// Intentionally ignore connectionString — dual-path credential env is banned.
	void resolved.connectionString;
	void config?.connectionString;
	if (resolved.httpUrl !== undefined) {
		env[`services__${resourceName}__http__0`] = resolved.httpUrl;
	} else if (
		config?.endpoints &&
		typeof config.endpoints === "object" &&
		config.endpoints !== null
	) {
		const endpoints = config.endpoints as Record<string, unknown>;
		const http = endpoints.http;
		if (typeof http === "string" && http.length > 0) {
			env[`services__${resourceName}__http__0`] = http;
		}
	}
	return env;
}
