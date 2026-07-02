export type ResourceKind = "api" | "cache";

export interface ResourceRelationship {
	readonly from: string;
	readonly to: string;
	readonly verb: "dependsOn";
}

export interface ResourceDescriptor {
	readonly generatedId: string;
	readonly kind: ResourceKind;
	readonly ownerBindleId: string;
	readonly workload: { kind: "inert-workload-factory"; factory: () => unknown } | null;
}

export interface BindleManifest<TAliases extends Record<string, ResourceHandle>> {
	readonly name: string;
	readonly aliases: TAliases;
	readonly resources: readonly ResourceDescriptor[];
	readonly relationships: readonly ResourceRelationship[];
}

export interface ResourceHandle<TKind extends ResourceKind = ResourceKind> {
	readonly generatedId: string;
	readonly kind: TKind;
	dependsOn(...dependencies: readonly ResourceHandle[]): ResourceHandle<TKind>;
}

export interface ClosureBuilder {
	api(workload: () => unknown): ResourceHandle<"api">;
	cache(): ResourceHandle<"cache">;
}

class ResourceHandleImpl<TKind extends ResourceKind = ResourceKind> implements ResourceHandle<TKind> {
	constructor(
		private readonly context: BuilderContext,
		readonly generatedId: string,
		readonly kind: TKind,
		private readonly workload: (() => unknown) | null,
	) {}

	dependsOn(...dependencies: readonly ResourceHandle[]): ResourceHandle<TKind> {
		for (const dependency of dependencies) {
			if (!(dependency instanceof ResourceHandleImpl)) {
				throw new Error("bindles.invalid_dependency");
			}
			if (dependency.context !== this.context) {
				throw new Error("bindles.cross_bindle_dependency");
			}
			this.context.relationships.push({
				from: this.generatedId,
				to: dependency.generatedId,
				verb: "dependsOn",
			});
		}
		return this;
	}

	snapshot(): ResourceDescriptor {
		return {
			generatedId: this.generatedId,
			kind: this.kind,
			ownerBindleId: this.context.ownerBindleId,
			workload: this.workload
				? { kind: "inert-workload-factory", factory: this.workload }
				: null,
		};
	}
}

class BuilderContext {
	readonly relationships: ResourceRelationship[] = [];
	private readonly handles: ResourceHandleImpl[] = [];
	private readonly kindCounts = new Map<ResourceKind, number>();

	constructor(readonly ownerBindleId: string) {}

	builder(): ClosureBuilder {
		return {
			api: (workload: () => unknown) => {
				if (typeof workload !== "function") {
					throw new Error("bindles.workload_factory_required");
				}
				return this.create("api", workload);
			},
			cache: () => this.create("cache", null),
		};
	}

	resourceSnapshots(): ResourceDescriptor[] {
		return this.handles.map((handle) => handle.snapshot());
	}

	private create<TKind extends ResourceKind>(
		kind: TKind,
		workload: (() => unknown) | null,
	): ResourceHandle<TKind> {
		const ordinal = (this.kindCounts.get(kind) ?? 0) + 1;
		this.kindCounts.set(kind, ordinal);
		const handle = new ResourceHandleImpl(
			this,
			`res_${kind}_${String(ordinal).padStart(4, "0")}`,
			kind,
			workload,
		);
		this.handles.push(handle);
		return handle;
	}
}

export function bindle<TAliases extends Record<string, ResourceHandle>>(
	name: string,
	builderFn: (builder: ClosureBuilder) => TAliases,
): BindleManifest<TAliases> {
	if (!name.trim()) {
		throw new Error("bindles.bindle_name_required");
	}

	const context = new BuilderContext(name);
	const aliases = builderFn(context.builder());

	return Object.freeze({
		name,
		aliases,
		resources: Object.freeze(context.resourceSnapshots()),
		relationships: Object.freeze([...context.relationships]),
	});
}
