import {
	containerDependencyAnnotation,
	externalDependencyAnnotation,
	wasmComponentDependencyAnnotation,
} from "./dependencies.js";
import {
	assertNoBindleProviderSelection,
	parseBindleRequirements,
} from "./requirements.js";
import type {
	AllowVerbsFor,
	BindleBuilder,
	BindleDefinition,
	BindleEdge,
	BindleResource,
	BindleResourceRecord,
	BindleRequirements,
	ComponentBinding,
	ContainerDependencyOptions,
	ExternalDependencyOptions,
	ProviderAnnotation,
	ResourceKind,
	WasmComponentDependencyOptions,
} from "./types.js";

// Structural detection of a @component-decorated class (Plan 2 Syntax 0)
// via the shared symbol registry — the manifest layer never imports the
// runtime's training machinery.
const METADATA_SYMBOL =
	(Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");
const COMPONENT_METADATA = Symbol.for("hobo.component.metadata");

function isDeclaredComponent(binding: ComponentBinding): boolean {
	if (typeof binding !== "function") return false;
	const metadata = (
		binding as unknown as Record<symbol, Record<symbol, unknown> | undefined>
	)[METADATA_SYMBOL];
	return metadata?.[COMPONENT_METADATA] !== undefined;
}

/**
 * Normalize a binding to the stored handler thunk. A declared component
 * becomes `() => new Component()` — instantiation registers each
 * `@operation` trainable (DI semantics), so collecting or serving the
 * bindle surfaces the component's declared operations with no extra step.
 */
function toHandler(
	binding: ComponentBinding | undefined,
): (() => unknown) | undefined {
	if (binding === undefined) return undefined;
	if (isDeclaredComponent(binding)) {
		const Component = binding as new () => object;
		return () => new Component();
	}
	return binding as () => unknown;
}

interface InternalBindleResource<K extends ResourceKind> {
	readonly kind: K;
	declaredAllow: string[];
	annotations: ProviderAnnotation[];
	dependencies: Set<InternalBindleResource<ResourceKind>>;
	handler: (() => unknown) | undefined;
}

type TrackedBindleResource<K extends ResourceKind> = BindleResource<K> & {
	readonly __bindleInternal: InternalBindleResource<K>;
};

/**
 * Default Session Replay annotation for every Bindle `web` resource (ADR-0137).
 * Hosts (`hobo dev` / local Yard) wrap web entrypoints so HTML pages are
 * recorded without per-app wiring. Opt out with:
 *   `.with({ provider: "hobo", option: "session-replay", config: { enabled: false } })`
 */
const DEFAULT_WEB_SESSION_REPLAY_ANNOTATION: ProviderAnnotation = Object.freeze({
	provider: "hobo",
	option: "session-replay",
	config: Object.freeze({ enabled: true, defaultSupply: "local-on" }),
});

function createBindleResource<K extends ResourceKind>(
	kind: K,
	handler?: () => unknown,
): TrackedBindleResource<K> {
	const internal: InternalBindleResource<K> = {
		kind,
		declaredAllow: [],
		// Web surfaces are Session-Replay capable by default — zero Bindle config.
		annotations:
			kind === "web" ? [DEFAULT_WEB_SESSION_REPLAY_ANNOTATION] : [],
		dependencies: new Set(),
		handler,
	};

	const resource: TrackedBindleResource<K> = {
		kind,
		__bindleInternal: internal,
		dependsOn(...deps: BindleResource[]): BindleResource<K> {
			for (const dep of deps) {
				const tracked = dep as TrackedBindleResource<ResourceKind>;
				if (tracked.__bindleInternal) {
					internal.dependencies.add(tracked.__bindleInternal);
				}
			}
			return resource;
		},
		withReference(...deps: BindleResource[]): BindleResource<K> {
			return resource.dependsOn(...deps);
		},
		allow(...verbs: AllowVerbsFor<K>[]): BindleResource<K> {
			for (const verb of verbs) {
				if (!internal.declaredAllow.includes(verb as string)) {
					internal.declaredAllow.push(verb as string);
				}
			}
			return resource;
		},
		with(...annotations: ProviderAnnotation[]): BindleResource<K> {
			for (const annotation of annotations) {
				// Later session-replay annotations replace the default web one.
				if (annotation.option === "session-replay") {
					internal.annotations = internal.annotations.filter(
						(a) => a.option !== "session-replay",
					);
				}
				internal.annotations.push(annotation);
			}
			return resource;
		},
	};

	return Object.freeze(resource);
}

function createBuilder(): BindleBuilder {
	return Object.freeze({
		api: (binding?: ComponentBinding) =>
			createBindleResource("api", toHandler(binding)),
		web: (binding?: ComponentBinding) =>
			createBindleResource("web", toHandler(binding)),
		kv: () => createBindleResource("kv"),
		bucket: () => createBindleResource("bucket"),
		queue: () => createBindleResource("queue"),
		topic: () => createBindleResource("topic"),
		secret: () => createBindleResource("secret"),
		data: () => createBindleResource("data"),
		service: (binding?: ComponentBinding) =>
			createBindleResource("service", toHandler(binding)),
		external: (options: ExternalDependencyOptions = {}) =>
			createBindleResource("external").with(
				externalDependencyAnnotation(options),
			) as BindleResource<"external">,
		container: (options: ContainerDependencyOptions) =>
			createBindleResource("container").with(
				containerDependencyAnnotation(options),
			) as BindleResource<"container">,
		wasmComponent: (options: WasmComponentDependencyOptions) =>
			createBindleResource("wasm-component").with(
				wasmComponentDependencyAnnotation(options),
			) as BindleResource<"wasm-component">,
	});
}

function toResourceRecord<K extends ResourceKind>(
	name: string,
	internal: InternalBindleResource<K>,
): BindleResourceRecord<K> {
	const stableId = `${internal.kind}:${name}` as `${K}:${string}`;
	return Object.freeze({
		kind: internal.kind,
		name,
		stableId,
		declaredAllow: Object.freeze([...internal.declaredAllow]),
		annotations: Object.freeze(
			internal.annotations.map((entry) => Object.freeze({ ...entry })),
		),
		dependsOn: Object.freeze(
			[...internal.dependencies].map((dep) => dep.kind as string),
		),
	});
}

export function bindle(
	name: string,
	build: (builder: BindleBuilder) => Record<string, BindleResource>,
): BindleDefinition;
export function bindle(
	name: string,
	requirements: Partial<BindleRequirements> | Record<string, unknown>,
	build: (builder: BindleBuilder) => Record<string, BindleResource>,
): BindleDefinition;
export function bindle(
	name: string,
	buildOrRequirements:
		| ((builder: BindleBuilder) => Record<string, BindleResource>)
		| Partial<BindleRequirements>
		| Record<string, unknown>,
	maybeBuild?: (builder: BindleBuilder) => Record<string, BindleResource>,
): BindleDefinition {
	if (typeof name !== "string" || name.length === 0) {
		throw new TypeError("bindle name must be a non-empty string");
	}

	const build =
		typeof buildOrRequirements === "function"
			? buildOrRequirements
			: maybeBuild;
	if (typeof build !== "function") {
		throw new TypeError("bindle requires a builder function");
	}
	const requirements = parseBindleRequirements(
		typeof buildOrRequirements === "function" ? {} : buildOrRequirements,
	);

	const builder = createBuilder();
	const built = build(builder);
	const resourceByName = new Map<
		InternalBindleResource<ResourceKind>,
		string
	>();
	const resources: Record<string, BindleResourceRecord> = {};
	const edges: BindleEdge[] = [];
	const stableIds = new Set<string>();
	const handlers = new Map<string, () => unknown>();

	for (const [resourceName, resource] of Object.entries(built)) {
		if (typeof resourceName !== "string" || resourceName.length === 0) {
			throw new TypeError("bindle resource names must be non-empty strings");
		}

		const tracked = resource as TrackedBindleResource<ResourceKind>;
		const internal = tracked.__bindleInternal;
		if (!internal) {
			throw new TypeError(
				"bindle build must return resources from the BindleBuilder",
			);
		}

		const stableId = `${internal.kind}:${resourceName}`;
		if (stableIds.has(stableId)) {
			throw new TypeError(`duplicate bindle resource stableId "${stableId}"`);
		}
		stableIds.add(stableId);

		resourceByName.set(internal, resourceName);
		resources[resourceName] = toResourceRecord(resourceName, internal);
		if (internal.handler) {
			handlers.set(resourceName, internal.handler);
		}
	}

	for (const [resourceName, resource] of Object.entries(built)) {
		const tracked = resource as TrackedBindleResource<ResourceKind>;
		for (const dep of tracked.__bindleInternal.dependencies) {
			const depName = resourceByName.get(dep);
			if (depName) {
				edges.push(Object.freeze({ from: resourceName, to: depName }));
			}
		}
	}

	const definition: BindleDefinition = {
		name,
		resources: Object.freeze(resources),
		edges: Object.freeze(edges),
		requirements,
		entrypoint: (resourceName: string): (() => unknown) | undefined =>
			handlers.get(resourceName),
	};
	// Keep the app-host entrypoints reachable for tooling/tests but out of the
	// provider-agnostic manifest graph: non-enumerable so JSON.stringify and
	// Object.keys still yield exactly { name, resources, edges, requirements }.
	Object.defineProperty(definition, "entrypoint", { enumerable: false });
	const frozen = Object.freeze(definition);
	// Reject cloud provider selection annotations at collection boundary.
	assertNoBindleProviderSelection(frozen);
	return frozen;
}
