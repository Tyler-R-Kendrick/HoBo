import type { ConfigContract, ConfigAccessors, ConfigValue } from "../bindles/types.js";
import type { ConfigResolver } from "./resolver.js";
import { SecretValue } from "../core/secret-value.js";

export function createConfigContext<const TContract extends ConfigContract>(
  contract: TContract,
  resolver: ConfigResolver,
): { readonly config: ConfigAccessors<TContract> } {
  const accessors: Record<string, () => Promise<unknown>> = {};

  for (const key of Object.keys(contract.entries) as Array<keyof TContract["entries"] & string>) {
    const entry = contract.entries[key];
    if (!entry) {
      throw new Error(`config entry ${key} is not declared`);
    }
    accessors[key] = async () => {
      const resolved = await resolver.resolve(key, entry);
      return normalizeAccessorValue(resolved) as ConfigValue<TContract["entries"][typeof key]>;
    };
  }

  return { config: accessors as ConfigAccessors<TContract> };
}

function normalizeAccessorValue(resolved: unknown): string | number | boolean | SecretValue {
  if (resolved instanceof SecretValue) {
    return resolved;
  }
  if (
    typeof resolved === "string" ||
    typeof resolved === "number" ||
    typeof resolved === "boolean"
  ) {
    return resolved;
  }
  if (resolved && typeof resolved === "object" && "kind" in resolved) {
    const kind = (resolved as { kind: string }).kind;
    if (kind === "binding-handle") {
      return `[binding:${(resolved as unknown as { ref: string }).ref}]`;
    }
    if (kind === "static-secret-hatch-required") {
      throw new Error(`static secret hatch required for ${(resolved as unknown as { ref: string }).ref}`);
    }
  }
  throw new Error("unsupported resolved config value");
}
