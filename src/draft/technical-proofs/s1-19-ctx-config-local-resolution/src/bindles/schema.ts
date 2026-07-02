import type { ConfigContract, ConfigEntry, ConfigValueType } from "./types.js";
import { CONFIG_SCHEMA_VERSION } from "./types.js";

const VALID_KEY = /^[A-Z][A-Z0-9_]*$/;

export type { ConfigContract, ConfigEntry } from "./types.js";
export { CONFIG_SCHEMA_VERSION } from "./types.js";

export function fromBinding(
  name: string,
  options: { required?: boolean; devOnly?: boolean } = {},
): ConfigEntry<"string"> {
  requireNonEmptyString(name, "binding name");
  return {
    kind: "from-binding",
    type: "string",
    required: options.required ?? true,
    sensitivity: "secretless",
    source: {
      kind: "binding",
      ref: name,
      devOnly: options.devOnly === true,
    },
  };
}

export function secretRef(
  ref: string,
  options: { required?: boolean; devOnly?: boolean } = {},
): ConfigEntry<"string"> {
  requireNonEmptyString(ref, "secret ref");
  return {
    kind: "secret-ref",
    type: "string",
    required: options.required ?? true,
    sensitivity: "secret",
    source: {
      kind: "secret-ref",
      ref,
      devOnly: options.devOnly === true,
    },
  };
}

export function env<const TValue extends string | number | boolean>(
  defaultValue: TValue,
  options: { required?: boolean; devOnly?: boolean; ref?: string } = {},
): ConfigEntry<
  TValue extends number ? "number" : TValue extends boolean ? "boolean" : "string"
> {
  return {
    kind: "env",
    type: primitiveTypeOf(defaultValue),
    required: options.required ?? false,
    sensitivity: "config",
    source: {
      kind: "camp-env",
      ref: options.ref,
      devOnly: options.devOnly === true,
    },
    defaultType: primitiveTypeOf(defaultValue),
  } as ConfigEntry<
    TValue extends number ? "number" : TValue extends boolean ? "boolean" : "string"
  >;
}

export function config<const TEntries extends Record<string, ConfigEntry>>(
  entries: TEntries,
): ConfigContract<TEntries> {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new TypeError("config() expects an object of config declarations");
  }

  const normalized = {} as Record<string, ConfigEntry>;
  for (const [key, entry] of Object.entries(entries)) {
    if (!VALID_KEY.test(key)) {
      throw new TypeError(`config key ${key} must be SCREAMING_SNAKE_CASE`);
    }
    normalized[key] = normalizeEntry(key, entry);
  }

  return {
    schema: CONFIG_SCHEMA_VERSION,
    entries: normalized as TEntries,
  };
}

function normalizeEntry(key: string, entry: ConfigEntry): ConfigEntry {
  if (!entry || typeof entry !== "object") {
    throw new TypeError(`config entry ${key} must be created by a config builder`);
  }
  if (!entry.source?.kind || (entry.kind !== "env" && !entry.source?.ref)) {
    throw new TypeError(`config entry ${key} is missing a source ref`);
  }
  return { ...entry, source: { ...entry.source, ref: entry.source.ref ?? key } };
}

function primitiveTypeOf(value: string | number | boolean): ConfigValueType {
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return type;
  throw new TypeError("env(default) supports string, number, or boolean defaults");
}

function requireNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}
