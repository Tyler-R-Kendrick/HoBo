export type ResourceKind = "api" | "cache" | "queue";
export type RelationshipVerb = "dependsOn";

export interface ResourceRelationship {
  readonly from: string;
  readonly to: string;
  readonly verb: RelationshipVerb;
}

export interface ResourceDescriptor {
  readonly generatedId: string;
  readonly kind: ResourceKind;
  readonly ownerBindleId: string;
  readonly workload: WorkloadDescriptor | null;
  readonly annotations: readonly unknown[];
}

export interface WorkloadDescriptor {
  readonly kind: "inert-workload-factory";
  readonly factory: () => unknown;
}

export interface BindleManifest<TAliases extends Record<string, ResourceHandle>> {
  readonly name: string;
  readonly aliases: TAliases;
  readonly resources: readonly ResourceDescriptor[];
  readonly relationships: readonly ResourceRelationship[];
}

export interface ResourceIdentityDiagnostic {
  readonly alias: string;
  readonly generatedId: string;
  readonly kind: ResourceKind;
  readonly ownerBindleId: string;
  readonly physicalNameSeed: string;
}

export interface ResourceHandle<TKind extends ResourceKind = ResourceKind> {
  readonly generatedId: string;
  readonly kind: TKind;
  dependsOn(...dependencies: readonly unknown[]): ResourceHandle<TKind>;
  with(...annotations: readonly unknown[]): ResourceHandle<TKind>;
}

export interface ClosureBuilder {
  api(workload: () => unknown): ResourceHandle<"api">;
  cache(): ResourceHandle<"cache">;
  queue<TMessage = unknown>(): ResourceHandle<"queue">;
}

export class ClosureBuilderResourceError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "ClosureBuilderResourceError";
    this.code = code;
    this.details = details;
  }
}

export function bindle<TAliases extends Record<string, ResourceHandle>>(
  name: string,
  builderFn: (builder: ClosureBuilder) => TAliases,
): BindleManifest<TAliases> {
  if (!name.trim()) {
    throw new ClosureBuilderResourceError("CLOSURE_BUILDER_BINDLE_NAME", "bindle name must be non-empty");
  }

  const context = new BuilderContext(name);
  const builder = context.builder();
  const aliases = builderFn(builder);

  return Object.freeze({
    name,
    aliases,
    resources: deepFreeze(context.resourceSnapshots()),
    relationships: deepFreeze([...context.relationships]),
  });
}

export function resourceIdentityDiagnostics(
  manifest: BindleManifest<Record<string, ResourceHandle>>,
): readonly ResourceIdentityDiagnostic[] {
  const resourcesById = new Map(manifest.resources.map((resource) => [resource.generatedId, resource]));
  return deepFreeze(
    Object.entries(manifest.aliases).map(([alias, handle]) => {
      const resource = resourcesById.get(handle.generatedId);
      if (!resource) {
        throw new ClosureBuilderResourceError(
          "CLOSURE_BUILDER_ALIAS_RESOURCE_MISSING",
          "identity diagnostics can only project aliases for collected resources",
          { alias, generatedId: handle.generatedId },
        );
      }
      return {
        alias,
        generatedId: resource.generatedId,
        kind: resource.kind,
        ownerBindleId: resource.ownerBindleId,
        physicalNameSeed: `${resource.ownerBindleId}:${resource.generatedId}`,
      };
    }),
  );
}

class BuilderContext {
  readonly relationships: ResourceRelationship[] = [];
  private readonly handles: ResourceHandleImpl[] = [];
  private readonly kindCounts = new Map<ResourceKind, number>();

  constructor(readonly ownerBindleId: string) {}

  builder(): ClosureBuilder {
    return {
      api: (workload: () => unknown, ...extra: readonly unknown[]) => {
        assertWorkloadFactory("api", workload, extra);
        return this.create("api", { kind: "inert-workload-factory", factory: workload });
      },
      cache: (...args: readonly unknown[]) => {
        assertNoFactoryArgs("cache", args);
        return this.create("cache", null);
      },
      queue: <TMessage = unknown>(...args: readonly unknown[]) => {
        assertNoFactoryArgs("queue", args);
        return this.create("queue", null);
      },
    };
  }

  resourceSnapshots(): ResourceDescriptor[] {
    return this.handles.map((handle) => handle.snapshot());
  }

  private create<TKind extends ResourceKind>(
    kind: TKind,
    workload: WorkloadDescriptor | null,
  ): ResourceHandle<TKind> {
    const kindOrdinal = (this.kindCounts.get(kind) ?? 0) + 1;
    this.kindCounts.set(kind, kindOrdinal);
    const handle = new ResourceHandleImpl<TKind>(
      this,
      generatedResourceId(kind, kindOrdinal),
      kind,
      workload,
    );
    this.handles.push(handle);
    return handle;
  }
}

function generatedResourceId(kind: ResourceKind, ordinal: number): string {
  return `res_${kind}_${String(ordinal).padStart(4, "0")}`;
}

class ResourceHandleImpl<TKind extends ResourceKind = ResourceKind> implements ResourceHandle<TKind> {
  private readonly annotations: unknown[] = [];

  constructor(
    private readonly context: BuilderContext,
    readonly generatedId: string,
    readonly kind: TKind,
    private readonly workload: WorkloadDescriptor | null,
  ) {}

  dependsOn(...dependencies: readonly unknown[]): ResourceHandle<TKind> {
    for (const dependency of dependencies) {
      const target = parseDependency(this.context, dependency);
      this.context.relationships.push({
        from: this.generatedId,
        to: target.generatedId,
        verb: "dependsOn",
      });
    }
    return this;
  }

  with(...annotations: readonly unknown[]): ResourceHandle<TKind> {
    this.annotations.push(...annotations);
    return this;
  }

  snapshot(): ResourceDescriptor {
    return {
      generatedId: this.generatedId,
      kind: this.kind,
      ownerBindleId: this.context.ownerBindleId,
      workload: this.workload,
      annotations: [...this.annotations],
    };
  }

  ownerBindleId(): string {
    return this.context.ownerBindleId;
  }
}

function parseDependency(context: BuilderContext, value: unknown): ResourceHandleImpl {
  if (value instanceof ResourceHandleImpl) {
    if (value.ownerBindleId() !== context.ownerBindleId) {
      throw new ClosureBuilderResourceError(
        "CLOSURE_BUILDER_CROSS_BINDLE_DEPENDENCY",
        "dependsOn() can only reference handles created inside the same bindle builder closure",
        { from: context.ownerBindleId, to: value.ownerBindleId() },
      );
    }
    return value;
  }

  if (isResourceDescriptor(value) && value.ownerBindleId !== context.ownerBindleId) {
    throw new ClosureBuilderResourceError(
      "CLOSURE_BUILDER_CROSS_BINDLE_DEPENDENCY",
      "dependsOn() cannot reference resource snapshots from another bindle",
      { from: context.ownerBindleId, to: value.ownerBindleId },
    );
  }

  throw new ClosureBuilderResourceError(
    "CLOSURE_BUILDER_INVALID_DEPENDENCY",
    "dependsOn() expects a resource handle returned by the same closure builder",
    { dependency: value },
  );
}

function assertNoFactoryArgs(kind: ResourceKind, args: readonly unknown[]): void {
  if (args.length === 0) return;
  throw new ClosureBuilderResourceError(
    "CLOSURE_BUILDER_NAMED_RESOURCE_ARG",
    `b.${kind}() does not accept resource name arguments in the v1 closure builder`,
    { kind, args },
  );
}

function assertWorkloadFactory(
  kind: ResourceKind,
  workload: unknown,
  extra: readonly unknown[],
): asserts workload is () => unknown {
  if (typeof workload !== "function") {
    throw new ClosureBuilderResourceError(
      "CLOSURE_BUILDER_WORKLOAD_FACTORY",
      `b.${kind}(...) expects an inert workload factory function`,
      { kind },
    );
  }
  assertNoFactoryArgs(kind, extra);
}

function isResourceDescriptor(value: unknown): value is ResourceDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    "generatedId" in value &&
    "ownerBindleId" in value &&
    "kind" in value
  );
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}
