export type RawDriverName = "postgres" | "mongo" | "native";
export type ProjectionSinkSource = "projected" | "authoritative-external";

export interface ProjectionSinkDefinition<TDriver extends RawDriverName = RawDriverName> {
  name: string;
  driver: TDriver;
  rawAccess: boolean;
  source: ProjectionSinkSource;
  pooledMultiTenant?: boolean;
}

export interface RawDriverOptions {
  tenantScope?: string;
}

export interface RawDriverOperation {
  driver: RawDriverName;
  access: "read" | "write";
  tenantScope?: string;
  [key: string]: unknown;
}

export interface PostgresRawDriver {
  query(sql: string, params?: unknown[], options?: RawDriverOptions): RawDriverOperation;
  execute(sql: string, params?: unknown[], options?: RawDriverOptions): RawDriverOperation;
}

export interface MongoRawDriver {
  collection(name: string): {
    find(filter?: Record<string, unknown>, options?: RawDriverOptions): RawDriverOperation;
    updateOne(filter?: Record<string, unknown>, update?: Record<string, unknown>, options?: RawDriverOptions): RawDriverOperation;
  };
}

export interface NativeRawDriver {
  read(): RawDriverOperation;
}

export interface RawDriverMap {
  postgres: PostgresRawDriver;
  mongo: MongoRawDriver;
  native: NativeRawDriver;
}

export interface RawManifestEdge {
  code: "RAW_DRIVER_ESCAPE_HATCH";
  driver: RawDriverName;
  projection: string;
  readOnly: boolean;
  satisfiedBy: RawDriverName[];
}

export interface PlanWarning {
  code: "RAW_DRIVER_PORTABILITY_DEBT";
  driver: RawDriverName;
  projection: string;
  severity: "portability-debt";
}

export type IsolationWarning =
  | {
      code: "RAW_TENANT_SCOPE_UNPROVEN";
      projection: string;
      severity: "isolation-debt";
    }
  | {
      code: "RAW_TENANT_SCOPE_MISMATCH";
      expectedTenant: string;
      projection: string;
      severity: "isolation-debt";
      tenantScope: string;
    };

export interface RawResult {
  operation: RawDriverOperation;
  manifest: {
    rawEdges: RawManifestEdge[];
  };
  planWarnings: PlanWarning[];
  isolationWarnings: IsolationWarning[];
}

export interface RawView<TDriver extends RawDriverName> {
  raw(callback: (driver: RawDriverMap[TDriver]) => RawDriverOperation): RawResult;
}

export type CanDeployResult =
  | { ok: true; warnings: PlanWarning[] }
  | { ok: false; reason: string; warnings: PlanWarning[] };

const RAW_DRIVER_NAMES: Set<RawDriverName> = new Set(["postgres", "mongo", "native"]);
const SINK_SOURCES: Set<ProjectionSinkSource> = new Set(["projected", "authoritative-external"]);

export function defineProjectionSink<TDriver extends RawDriverName = RawDriverName>(
  input: ProjectionSinkDefinition<TDriver>,
): ProjectionSinkDefinition<TDriver> {
  if (!input || typeof input !== "object") {
    throw new TypeError("projection sink definition is required");
  }

  return Object.freeze({
    name: assertString(input.name, "sink.name"),
    driver: assertOneOf(input.driver, RAW_DRIVER_NAMES, "sink.driver") as TDriver,
    rawAccess: Boolean(input.rawAccess),
    source: assertOneOf(input.source, SINK_SOURCES, "sink.source"),
    pooledMultiTenant: Boolean(input.pooledMultiTenant),
  });
}

export function createRawView<TDriver extends RawDriverName>(
  sink: ProjectionSinkDefinition<TDriver>,
  context: { tenantId?: string } = {},
): RawView<TDriver> {
  const normalizedSink = defineProjectionSink(sink);
  const normalizedContext = normalizeContext(context);

  return Object.freeze({
    raw(callback: (driver: RawDriverMap[TDriver]) => RawDriverOperation): RawResult {
      if (!normalizedSink.rawAccess) {
        throw new Error(`raw access not advertised by ${normalizedSink.name}`);
      }
      if (typeof callback !== "function") {
        throw new TypeError("raw callback must be a function");
      }

      const operation = normalizeOperation(callback(createDriver(normalizedSink.driver)), normalizedSink.driver);
      if (operation.access === "write" && normalizedSink.source !== "authoritative-external") {
        throw new Error("raw writes require an authoritative-external store");
      }

      const rawEdge = rawManifestEdge(normalizedSink, operation);
      const planWarnings = planWarningsForEdges([rawEdge]);

      return deepFreeze({
        operation,
        manifest: {
          rawEdges: [rawEdge],
        },
        planWarnings,
        isolationWarnings: isolationWarningsFor(normalizedSink, normalizedContext, operation),
      });
    },
  });
}

export function canDeployWithRawEdges(rawEdges: RawManifestEdge[], targetDrivers: RawDriverName[]): CanDeployResult {
  if (!Array.isArray(rawEdges)) {
    throw new TypeError("rawEdges must be an array");
  }
  if (!Array.isArray(targetDrivers) || targetDrivers.length === 0) {
    throw new TypeError("targetDrivers must be a non-empty array");
  }

  const normalizedEdges = rawEdges.map(normalizeRawEdge);
  const warnings = planWarningsForEdges(normalizedEdges);

  for (const edge of normalizedEdges) {
    const unsupportedTarget = targetDrivers.find((target) => !edge.satisfiedBy.includes(target));
    if (unsupportedTarget) {
      return Object.freeze({
        ok: false,
        reason: `raw edge ${edge.projection} requires ${edge.driver}; unsatisfied by ${unsupportedTarget}`,
        warnings,
      });
    }
  }

  return Object.freeze({ ok: true, warnings });
}

function createDriver<TDriver extends RawDriverName>(driver: TDriver): RawDriverMap[TDriver];
function createDriver(driver: RawDriverName): RawDriverMap[RawDriverName] {
  if (driver === "postgres") {
    return Object.freeze({
      query(sql: string, params: unknown[] = [], options: RawDriverOptions = {}): RawDriverOperation {
        return rawOperation({
          driver,
          access: classifySqlAccess(sql, "read"),
          statement: assertString(sql, "sql"),
          params,
          tenantScope: options.tenantScope,
        });
      },
      execute(sql: string, params: unknown[] = [], options: RawDriverOptions = {}): RawDriverOperation {
        return rawOperation({
          driver,
          access: classifySqlAccess(sql, "write"),
          statement: assertString(sql, "sql"),
          params,
          tenantScope: options.tenantScope,
        });
      },
    });
  }

  if (driver === "mongo") {
    return Object.freeze({
      collection(name: string) {
        const collection = assertString(name, "collection");
        return Object.freeze({
          find(filter: Record<string, unknown> = {}, options: RawDriverOptions = {}): RawDriverOperation {
            return rawOperation({
              driver,
              access: "read",
              collection,
              filter,
              tenantScope: options.tenantScope,
            });
          },
          updateOne(
            filter: Record<string, unknown> = {},
            update: Record<string, unknown> = {},
            options: RawDriverOptions = {},
          ): RawDriverOperation {
            return rawOperation({
              driver,
              access: "write",
              collection,
              filter,
              update,
              tenantScope: options.tenantScope,
            });
          },
        });
      },
    });
  }

  return Object.freeze({
    read(): RawDriverOperation {
      return rawOperation({
        driver,
        access: "read",
        reason: "native projections do not expose raw dialect access",
      });
    },
  });
}

function rawOperation(input: Record<string, unknown>): RawDriverOperation {
  return deepFreeze({
    ...(clone(input) as Record<string, unknown>),
    driver: assertOneOf(input.driver, RAW_DRIVER_NAMES, "operation.driver"),
    access: assertOneOf(input.access, new Set<"read" | "write">(["read", "write"]), "operation.access"),
    ...(input.tenantScope === undefined ? {} : { tenantScope: assertString(input.tenantScope, "tenantScope") }),
  }) as RawDriverOperation;
}

function normalizeOperation(operation: unknown, expectedDriver: RawDriverName): RawDriverOperation {
  if (!operation || typeof operation !== "object") {
    throw new TypeError("raw callback must return a raw driver operation");
  }
  const candidate = operation as Record<string, unknown>;
  if (candidate.driver !== expectedDriver) {
    throw new TypeError(`raw operation driver ${candidate.driver ?? "unknown"} does not match ${expectedDriver}`);
  }
  return rawOperation(candidate);
}

function rawManifestEdge(sink: ProjectionSinkDefinition, operation: RawDriverOperation): RawManifestEdge {
  return Object.freeze({
    code: "RAW_DRIVER_ESCAPE_HATCH",
    driver: sink.driver,
    projection: sink.name,
    readOnly: operation.access === "read",
    satisfiedBy: Object.freeze([sink.driver]),
  }) as RawManifestEdge;
}

function normalizeRawEdge(edge: unknown): RawManifestEdge {
  if (!edge || typeof edge !== "object") {
    throw new TypeError("raw edge must be an object");
  }

  const candidate = edge as Record<string, unknown>;
  return Object.freeze({
    code: "RAW_DRIVER_ESCAPE_HATCH",
    driver: assertOneOf(candidate.driver, RAW_DRIVER_NAMES, "edge.driver"),
    projection: assertString(candidate.projection, "edge.projection"),
    readOnly: Boolean(candidate.readOnly),
    satisfiedBy: Object.freeze(
      ((candidate.satisfiedBy as unknown[] | undefined) ?? []).map((driver) => assertOneOf(driver, RAW_DRIVER_NAMES, "edge.satisfiedBy")),
    ),
  }) as RawManifestEdge;
}

function planWarningsForEdges(edges: RawManifestEdge[]): PlanWarning[] {
  return Object.freeze(
    edges.map(
      (edge) =>
        Object.freeze({
          code: "RAW_DRIVER_PORTABILITY_DEBT",
          driver: edge.driver,
          projection: edge.projection,
          severity: "portability-debt",
        }) as PlanWarning,
    ),
  ) as PlanWarning[];
}

function isolationWarningsFor(
  sink: ProjectionSinkDefinition,
  context: { tenantId?: string },
  operation: RawDriverOperation,
): IsolationWarning[] {
  if (!sink.pooledMultiTenant || operation.access !== "read") {
    return Object.freeze([]) as unknown as IsolationWarning[];
  }
  if (!operation.tenantScope) {
    return Object.freeze([
      Object.freeze({
        code: "RAW_TENANT_SCOPE_UNPROVEN",
        projection: sink.name,
        severity: "isolation-debt",
      }),
    ]) as IsolationWarning[];
  }
  if (context.tenantId && operation.tenantScope !== context.tenantId) {
    return Object.freeze([
      Object.freeze({
        code: "RAW_TENANT_SCOPE_MISMATCH",
        expectedTenant: context.tenantId,
        projection: sink.name,
        severity: "isolation-debt",
        tenantScope: operation.tenantScope,
      }),
    ]) as IsolationWarning[];
  }

  return Object.freeze([]) as unknown as IsolationWarning[];
}

function classifySqlAccess(sql: string, fallback: "read" | "write"): "read" | "write" {
  const verb = assertString(sql, "sql").trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (["insert", "update", "delete", "merge", "create", "alter", "drop", "truncate"].includes(verb)) {
    return "write";
  }
  if (verb === "select" || verb === "with") {
    return "read";
  }
  return fallback;
}

function normalizeContext(context: unknown): { tenantId?: string } {
  if (!context || typeof context !== "object") {
    return Object.freeze({});
  }
  const candidate = context as Record<string, unknown>;
  return Object.freeze({
    ...(candidate.tenantId === undefined ? {} : { tenantId: assertString(candidate.tenantId, "context.tenantId") }),
  });
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertOneOf<T>(value: unknown, allowed: Set<T>, label: string): T {
  if (!allowed.has(value as T)) {
    throw new TypeError(`${label} must be one of: ${[...allowed].join(", ")}`);
  }
  return value as T;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return Object.freeze(value) as T;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
    return Object.freeze(value) as T;
  }
  return value;
}

function clone(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
