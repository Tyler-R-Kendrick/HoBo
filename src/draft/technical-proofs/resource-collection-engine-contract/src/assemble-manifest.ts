import {
  COMPONENT_FACTORIES,
  DEFAULT_EXPORTS_BY_FACTORY,
  clientTypeFor,
} from "./handles.js";
import type { ComponentHost, ResourceRecord } from "./types.js";

function omitEmpty<T extends Record<string, unknown>>(value: T): T {
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
  ) as T;
}

function manifestResource(record: ResourceRecord): Record<string, unknown> {
  if (COMPONENT_FACTORIES.has(record.kind)) {
    const links = [...record.bindAliases.values()].map((target) => ({
      import: target.port,
      to: target.name,
    }));
    return omitEmpty({
      type: "component.v1",
      kind: record.kind,
      runtime: "wasm",
      exports: DEFAULT_EXPORTS_BY_FACTORY[
        record.kind as keyof typeof DEFAULT_EXPORTS_BY_FACTORY
      ] ?? [],
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

export function assembleManifest({
  componentHost,
  resources,
}: {
  componentHost: ComponentHost;
  resources: Map<string, ResourceRecord>;
}): Record<string, unknown> {
  return {
    schema: "hobo.manifest/v1",
    componentHost,
    resources: Object.fromEntries(
      [...resources.values()].map((record) => [record.name, manifestResource(record)]),
    ),
  };
}
