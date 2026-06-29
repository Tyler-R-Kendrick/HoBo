const RAW_DRIVER_NAMES = new Set(["postgres", "mongo", "native"]);
const SINK_SOURCES = new Set(["projected", "authoritative-external"]);

export function defineProjectionSink(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("projection sink definition is required");
  }

  return Object.freeze({
    name: assertString(input.name, "sink.name"),
    driver: assertOneOf(input.driver, RAW_DRIVER_NAMES, "sink.driver"),
    rawAccess: Boolean(input.rawAccess),
    source: assertOneOf(input.source, SINK_SOURCES, "sink.source"),
    pooledMultiTenant: Boolean(input.pooledMultiTenant),
  });
}

export function createRawView(sink, context = {}) {
  const normalizedSink = defineProjectionSink(sink);
  const normalizedContext = normalizeContext(context);

  return Object.freeze({
    raw(callback) {
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

export function canDeployWithRawEdges(rawEdges, targetDrivers) {
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

function createDriver(driver) {
  if (driver === "postgres") {
    return Object.freeze({
      query(sql, params = [], options = {}) {
        return rawOperation({
          driver,
          access: classifySqlAccess(sql, "read"),
          statement: assertString(sql, "sql"),
          params,
          tenantScope: options.tenantScope,
        });
      },
      execute(sql, params = [], options = {}) {
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
      collection(name) {
        const collection = assertString(name, "collection");
        return Object.freeze({
          find(filter = {}, options = {}) {
            return rawOperation({
              driver,
              access: "read",
              collection,
              filter,
              tenantScope: options.tenantScope,
            });
          },
          updateOne(filter = {}, update = {}, options = {}) {
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
    read() {
      return rawOperation({
        driver,
        access: "read",
        reason: "native projections do not expose raw dialect access",
      });
    },
  });
}

function rawOperation(input) {
  return deepFreeze({
    ...clone(input),
    driver: assertOneOf(input.driver, RAW_DRIVER_NAMES, "operation.driver"),
    access: assertOneOf(input.access, new Set(["read", "write"]), "operation.access"),
    ...(input.tenantScope === undefined ? {} : { tenantScope: assertString(input.tenantScope, "tenantScope") }),
  });
}

function normalizeOperation(operation, expectedDriver) {
  if (!operation || typeof operation !== "object") {
    throw new TypeError("raw callback must return a raw driver operation");
  }
  if (operation.driver !== expectedDriver) {
    throw new TypeError(`raw operation driver ${operation.driver ?? "unknown"} does not match ${expectedDriver}`);
  }
  return rawOperation(operation);
}

function rawManifestEdge(sink, operation) {
  return Object.freeze({
    code: "RAW_DRIVER_ESCAPE_HATCH",
    driver: sink.driver,
    projection: sink.name,
    readOnly: operation.access === "read",
    satisfiedBy: Object.freeze([sink.driver]),
  });
}

function normalizeRawEdge(edge) {
  if (!edge || typeof edge !== "object") {
    throw new TypeError("raw edge must be an object");
  }

  return Object.freeze({
    code: "RAW_DRIVER_ESCAPE_HATCH",
    driver: assertOneOf(edge.driver, RAW_DRIVER_NAMES, "edge.driver"),
    projection: assertString(edge.projection, "edge.projection"),
    readOnly: Boolean(edge.readOnly),
    satisfiedBy: Object.freeze((edge.satisfiedBy ?? []).map((driver) => assertOneOf(driver, RAW_DRIVER_NAMES, "edge.satisfiedBy"))),
  });
}

function planWarningsForEdges(edges) {
  return Object.freeze(
    edges.map((edge) =>
      Object.freeze({
        code: "RAW_DRIVER_PORTABILITY_DEBT",
        driver: edge.driver,
        projection: edge.projection,
        severity: "portability-debt",
      }),
    ),
  );
}

function isolationWarningsFor(sink, context, operation) {
  if (!sink.pooledMultiTenant || operation.access !== "read") {
    return Object.freeze([]);
  }
  if (!operation.tenantScope) {
    return Object.freeze([
      Object.freeze({
        code: "RAW_TENANT_SCOPE_UNPROVEN",
        projection: sink.name,
        severity: "isolation-debt",
      }),
    ]);
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
    ]);
  }

  return Object.freeze([]);
}

function classifySqlAccess(sql, fallback) {
  const verb = assertString(sql, "sql").trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (["insert", "update", "delete", "merge", "create", "alter", "drop", "truncate"].includes(verb)) {
    return "write";
  }
  if (verb === "select" || verb === "with") {
    return "read";
  }
  return fallback;
}

function normalizeContext(context) {
  if (!context || typeof context !== "object") {
    return Object.freeze({});
  }
  return Object.freeze({
    ...(context.tenantId === undefined ? {} : { tenantId: assertString(context.tenantId, "context.tenantId") }),
  });
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertOneOf(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new TypeError(`${label} must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }
  return value;
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
