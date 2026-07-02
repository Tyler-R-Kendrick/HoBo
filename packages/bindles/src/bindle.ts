import type {
	AllowVerbsFor,
	BindleBuilder,
	BindleDefinition,
	BindleEdge,
	BindleResource,
	BindleResourceRecord,
	ProviderAnnotation,
	ResourceKind,
} from "./types.js";

interface InternalBindleResource<K extends ResourceKind> {
	readonly kind: K;
	declaredAllow: string[];
	annotations: ProviderAnnotation[];
	dependencies: Set<InternalBindleResource<ResourceKind>>;
}

type TrackedBindleResource<K extends ResourceKind> = BindleResource<K> & {
	readonly __bindleInternal: InternalBindleResource<K>;
};

function createBindleResource<K extends ResourceKind>(
	kind: K,
): TrackedBindleResource<K> {
	const internal: InternalBindleResource<K> = {
		kind,
		declaredAllow: [],
		annotations: [],
		dependencies: new Set(),
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
		allow(...verbs: AllowVerbsFor<K>[]): BindleResource<K> {
			for (const verb of verbs) {
				if (!internal.declaredAllow.includes(verb as string)) {
					internal.declaredAllow.push(verb as string);
				}
			}
			return resource;
		},
		with(...annotations: ProviderAnnotation[]): BindleResource<K> {
			internal.annotations.push(...annotations);
			return resource;
		},
	};

	return Object.freeze(resource);
}

function createBuilder(): BindleBuilder {
	return Object.freeze({
		api: () => createBindleResource("api"),
		web: () => createBindleResource("web"),
		kv: () => createBindleResource("kv"),
		bucket: () => createBindleResource("bucket"),
		queue: () => createBindleResource("queue"),
		topic: () => createBindleResource("topic"),
		secret: () => createBindleResource("secret"),
		data: () => createBindleResource("data"),
		service: () => createBindleResource("service"),
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
): BindleDefinition {
	if (typeof name !== "string" || name.length === 0) {
		throw new TypeError("bindle name must be a non-empty string");
	}

	const builder = createBuilder();
	const built = build(builder);
	const resourceByName = new Map<
		InternalBindleResource<ResourceKind>,
		string
	>();
	const resources: Record<string, BindleResourceRecord> = {};
	const edges: BindleEdge[] = [];
	const stableIds = new Set<string>();

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

	return Object.freeze({
		name,
		resources: Object.freeze(resources),
		edges: Object.freeze(edges),
	});
}
