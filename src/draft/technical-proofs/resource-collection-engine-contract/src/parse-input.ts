import { CollectionEngineError } from "./errors.js";
import {
  DEFAULT_COMPONENT_HOST,
  type CollectionInput,
  type ComponentHost,
} from "./types.js";

export function parseCollectionInput(raw: unknown): CollectionInput {
  if (!raw || typeof raw !== "object") {
    throw new CollectionEngineError("input", "must be an object");
  }
  const input = raw as Record<string, unknown>;
  if (typeof input.define !== "function") {
    throw new CollectionEngineError("define", "must be a function");
  }

  let componentHost: ComponentHost = DEFAULT_COMPONENT_HOST;
  if (input.componentHost !== undefined) {
    if (!input.componentHost || typeof input.componentHost !== "object") {
      throw new CollectionEngineError("componentHost", "must be an object");
    }
    const host = input.componentHost as Record<string, unknown>;
    if (typeof host.kind !== "string" || host.kind.length === 0) {
      throw new CollectionEngineError("componentHost.kind", "required");
    }
    if (typeof host.version !== "string" || host.version.length === 0) {
      throw new CollectionEngineError("componentHost.version", "required");
    }
    componentHost = Object.freeze({
      kind: host.kind,
      version: host.version,
    });
  }

  return Object.freeze({
    bindleId: typeof input.bindleId === "string" ? input.bindleId : "bindle",
    fileName: typeof input.fileName === "string" ? input.fileName : "bindle.ts",
    sourceText: typeof input.sourceText === "string" ? input.sourceText : "",
    componentHost,
    define: input.define as CollectionInput["define"],
    coverageEvaluator:
      typeof input.coverageEvaluator === "function"
        ? (input.coverageEvaluator as CollectionInput["coverageEvaluator"])
        : undefined,
  });
}
