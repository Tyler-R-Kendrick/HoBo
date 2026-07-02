import { CATALOG } from "../../hobo-bindles-resource-catalog/src/catalog.js";
import { declareResource, recordBindEdge, resolveResourceHandle } from "./handles.js";
import type { CollectionContext, CollectionState, ResourceHandle } from "./types.js";

export function createCollectionContext(state: CollectionState): CollectionContext {
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
        fetch(target: string) {
          state.sideEffects.push({
            kind: "network.fetch",
            target: String(target),
            disposition: "ignored",
          });
          return { ok: false as const, ignored: true as const };
        },
      },
    },
    bind(from: ResourceHandle, to: ResourceHandle) {
      const owner = resolveResourceHandle(from, "bind.from");
      const target = resolveResourceHandle(to, "bind.to");
      recordBindEdge(state, owner, target);
    },
  } as CollectionContext;

  for (const entry of CATALOG) {
    collect[entry.factory] = (name: string, options = {}) =>
      declareResource(state, entry, name, options);
  }

  return Object.freeze(collect);
}
