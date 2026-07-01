import type { AdapterRegistry, ConformanceAdapter } from "./types.ts";

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, ConformanceAdapter>();

  return {
    register(adapter: ConformanceAdapter): void {
      if (adapters.has(adapter.id)) {
        throw new TypeError(`adapter id already registered: ${adapter.id}`);
      }
      adapters.set(adapter.id, adapter);
    },
    get(id: string): ConformanceAdapter | undefined {
      return adapters.get(id);
    },
    list(): ConformanceAdapter[] {
      return [...adapters.values()];
    },
  };
}
