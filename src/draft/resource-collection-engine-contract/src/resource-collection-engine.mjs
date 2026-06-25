import { createHash } from "node:crypto";

import { CATALOG } from "../../hobo-bindles-resource-catalog/src/catalog.mjs";
import { evaluateCollectionCoverage } from "../../collection-coverage-gate-contract/src/collection-coverage-gate.mjs";
import {
  canonicalManifestHash,
  validateManifest,
} from "../../hobo-manifest-contract/src/manifest.mjs";

const DEFAULT_COMPONENT_HOST = Object.freeze({
  kind: "wasmtime",
  version: "46.0.1",
});

const COMPONENT_FACTORIES = new Set(["api", "web", "service", "job"]);
const DEFAULT_EXPORTS_BY_FACTORY = Object.freeze({
  api: ["wasi:http/incoming-handler"],
  web: ["wasi:http/incoming-handler"],
  service: ["wasi:http/incoming-handler"],
  job: ["hobo:job/handler"],
});
const RESOURCE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

export class CollectionEngineError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "CollectionEngineError";
    this.path = path;
  }
}

export function collectBindleResources(input) {
  const source = assertInput(input);
  const state = {
    resources: new Map(),
    bindEdges: [],
    sideEffects: [],
  };
  const collect = createCollectionContext(state);

  source.define(collect);

  const manifest = assembleManifest({
    componentHost: source.componentHost,
    resources: state.resources,
  });
  validateManifest(manifest);

  const observedResourceIds = [...state.resources.keys()];
  const observedBindKeys = state.bindEdges.map((edge) => edge.key);
  const coverage = source.sourceText
    ? evaluateCollectionCoverage({
        sourceText: source.sourceText,
        observedResourceIds,
        observedBindKeys,
        fileName: source.fileName,
      })
    : emptyCoverage({ observedResourceIds, observedBindKeys });
  const manifestHash = canonicalManifestHash(manifest);
  const events = createCollectionEvents({
    bindleId: source.bindleId,
    manifest,
    manifestHash,
    observedResourceIds,
    observedBindKeys,
    coverage,
  });

  return {
    bindleId: source.bindleId,
    manifest,
    manifestHash,
    coverage,
    events,
    sideEffects: state.sideEffects,
  };
}

function createCollectionContext(state) {
  const collect = {
    effects: {
      clock: {
        now() {
          state.sideEffects.push({
            kind: "clock.now",
            disposition: "ignored",
          });
          return new Date("1970-01-01T00:00:00.000Z");
        },
      },
      network: {
        fetch(target) {
          state.sideEffects.push({
            kind: "network.fetch",
            target: String(target),
            disposition: "ignored",
          });
          return { ok: false, ignored: true };
        },
      },
    },
    bind(from, to) {
      const owner = resolveResourceHandle(from, "bind.from");
      const target = resolveResourceHandle(to, "bind.to");
      recordBindEdge(state, owner, target);
    },
  };

  for (const entry of CATALOG) {
    collect[entry.factory] = (name, options = {}) =>
      declareResource(state, entry, name, options);
  }

  return Object.freeze(collect);
}

function declareResource(state, entry, name, options) {
  assertResourceName(name, `${entry.factory}.name`);
  if (state.resources.has(name)) {
    throw new CollectionEngineError(`resources.${name}`, "duplicate resource id");
  }

  const record = {
    kind: entry.factory,
    name,
    stableId: `${entry.factory}:${name}`,
    port: entry.portRef[0],
    portRef: [...entry.portRef],
    usedVerbs: new Set(),
    routes: [],
    bindAliases: new Map(),
  };
  state.resources.set(name, record);

  for (const [alias, target] of Object.entries(options.bind ?? {})) {
    const targetRecord = resolveResourceHandle(target, `${entry.factory}.${name}.bind.${alias}`);
    record.bindAliases.set(alias, targetRecord);
    recordBindEdge(state, record, targetRecord);
  }

  return createHandle(record, entry);
}

function createHandle(record, entry) {
  const handle = {
    kind: record.kind,
    name: record.name,
    stableId: record.stableId,
    port: record.port,
    route(method, path) {
      if (!COMPONENT_FACTORIES.has(record.kind)) {
        throw new CollectionEngineError(
          `resources.${record.name}.route`,
          "routes are only valid on component resources",
        );
      }
      record.routes.push({
        method: String(method).toUpperCase(),
        path: String(path),
      });
      return handle;
    },
    allow(...verbs) {
      for (const verb of verbs) {
        if (!entry.allowVerbs.includes(verb)) {
          throw new CollectionEngineError(
            `resources.${record.name}.allow`,
            `${record.kind} does not allow verb ${verb}`,
          );
        }
      }
      for (const verb of verbs) {
        record.usedVerbs.add(verb);
      }
      return handle;
    },
  };

  for (const verb of entry.allowVerbs) {
    handle[verb] = (...args) => {
      record.usedVerbs.add(verb);
      return Object.freeze({
        lowersTo: "hobo:sdk",
        kind: record.kind,
        name: record.name,
        handleStableId: record.stableId,
        portRef: Object.freeze([...record.portRef]),
        verb,
        args: Object.freeze([...args]),
      });
    };
  }

  return Object.freeze(handle);
}

function recordBindEdge(state, from, to) {
  const key = `${from.name}->${to.name}`;
  if (state.bindEdges.some((edge) => edge.key === key)) {
    return;
  }
  state.bindEdges.push({
    from: from.name,
    to: to.name,
    key,
    import: to.port,
  });
}

function assembleManifest({ componentHost, resources }) {
  return {
    schema: "hobo.manifest/v1",
    componentHost,
    resources: Object.fromEntries(
      [...resources.values()].map((record) => [record.name, manifestResource(record)]),
    ),
  };
}

function manifestResource(record) {
  if (COMPONENT_FACTORIES.has(record.kind)) {
    const links = [...record.bindAliases.values()].map((target) => ({
      import: target.port,
      to: target.name,
    }));
    return omitEmpty({
      type: "component.v1",
      kind: record.kind,
      runtime: "wasm",
      exports: DEFAULT_EXPORTS_BY_FACTORY[record.kind] ?? [],
      links,
      routes: record.routes,
      bindings: Object.fromEntries(
        [...record.bindAliases.entries()].map(([alias, target]) => [
          alias,
          {
            port: target.port,
            resource: target.name,
            clientType: clientTypeFor(target.kind),
          },
        ]),
      ),
      collection: {
        stableId: record.stableId,
      },
    });
  }

  const inferred = [...record.usedVerbs].sort();
  return {
    type: "data.v1",
    port: record.port,
    kind: record.kind,
    allow: inferred,
    usage: {
      inferred,
      source: "run-to-collect",
    },
    collection: {
      stableId: record.stableId,
    },
  };
}

function createCollectionEvents({
  bindleId,
  manifest,
  manifestHash,
  observedResourceIds,
  observedBindKeys,
  coverage,
}) {
  const collectedData = {
    bindleId,
    resources: observedResourceIds,
    binds: observedBindKeys,
    coverage: {
      status: coverage.status,
      diagnostics: coverage.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        resourceId: diagnostic.resourceId,
        bindKey: diagnostic.bindKey,
      })),
    },
  };
  const producedData = {
    bindleId,
    manifestHash,
    manifest,
  };

  return [
    createFact("bindle.ResourcesCollected", collectedData, 1),
    createFact("bindle.ManifestProduced", producedData, 2),
  ];
}

function createFact(type, data, seq) {
  return {
    id: `evt-${stableDigest({ type, data }).slice(0, 12)}`,
    type,
    seq,
    source: "resource-collection-engine",
    data,
  };
}

function emptyCoverage({ observedResourceIds, observedBindKeys }) {
  return {
    ok: true,
    canDeployDimension: "collectionCoverage",
    status: "pass",
    observedResourceIds,
    observedBindKeys,
    declaredResources: [],
    declaredBinds: [],
    unobservedDeclarations: [],
    unobservedBinds: [],
    unreachableDeclarations: [],
    unreachableBinds: [],
    unresolvedDeclarations: [],
    unresolvedBinds: [],
    diagnostics: [],
  };
}

function assertInput(input) {
  if (!input || typeof input !== "object") {
    throw new CollectionEngineError("input", "must be an object");
  }
  if (typeof input.define !== "function") {
    throw new CollectionEngineError("define", "must be a function");
  }

  return {
    bindleId: input.bindleId ?? "bindle",
    fileName: input.fileName ?? "bindle.ts",
    sourceText: input.sourceText ?? "",
    componentHost: input.componentHost ?? DEFAULT_COMPONENT_HOST,
    define: input.define,
  };
}

function resolveResourceHandle(handle, path) {
  if (!handle || typeof handle !== "object" || typeof handle.name !== "string") {
    throw new CollectionEngineError(path, "must reference a collected resource handle");
  }
  return handle;
}

function assertResourceName(name, path) {
  if (typeof name !== "string" || !RESOURCE_ID.test(name)) {
    throw new CollectionEngineError(path, "invalid resource id");
  }
}

function clientTypeFor(kind) {
  return `${kind[0].toUpperCase()}${kind.slice(1)}Client`;
}

function omitEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) {
        return entry.length > 0;
      }
      if (entry && typeof entry === "object") {
        return Object.keys(entry).length > 0;
      }
      return entry !== undefined;
    }),
  );
}

function stableDigest(value) {
  return createHash("sha256").update(JSON.stringify(sortKeys(value))).digest("hex");
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}
