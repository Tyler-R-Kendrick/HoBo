import {
  EnvelopeParseError,
  ManifestParseError,
  PortDescriptorParseError,
} from "./errors.js";

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function expectObject(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ErrorClass(field, "object", value);
  }
  return value as Record<string, unknown>;
}

export function assertNoExtra(
  value: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ErrorClass(field, `only keys ${allowed.join(", ")}`, key);
    }
  }
}

export function requiredArray(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ErrorClass(field, "non-empty array", value);
  }
  return value;
}

export function uniqueStringArray(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
  options: { minLength?: number } = {},
): string[] {
  const array =
    options.minLength !== undefined
      ? requiredArray(value, field, ErrorClass)
      : Array.isArray(value)
        ? value
        : [];
  const seen = new Set<string>();
  return array.map((entry, index) => {
    const normalized = nonEmptyString(entry, `${field}[${index}]`, ErrorClass);
    if (seen.has(normalized)) {
      throw new ErrorClass(field, "unique strings", normalized);
    }
    seen.add(normalized);
    return normalized;
  });
}

export function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ErrorClass(field, [...allowed].join(" | "), value);
  }
  return value as T;
}

export function nonEmptyString(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ErrorClass(field, "non-empty string", value);
  }
  return value;
}

export function nonNegativeInteger(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ErrorClass(field, "non-negative integer", value);
  }
  return value as number;
}

export function positiveInteger(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
  options: { max?: number } = {},
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ErrorClass(field, "positive integer", value);
  }
  if (options.max !== undefined && (value as number) > options.max) {
    throw new ErrorClass(field, `integer <= ${options.max}`, value);
  }
  return value as number;
}

export function isoTimestamp(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  const timestamp = nonEmptyString(value, field, ErrorClass);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ErrorClass(field, "ISO timestamp", value);
  }
  return timestamp;
}

export function httpsUrl(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  const url = nonEmptyString(value, field, ErrorClass);
  if (!/^https:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(url)) {
    throw new ErrorClass(field, "https URL", value);
  }
  return url;
}

export function sha256Ref(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  const ref = nonEmptyString(value, field, ErrorClass);
  if (!/^sha256:[a-f0-9]{64}$/.test(ref)) {
    throw new ErrorClass(field, "sha256:<64 hex chars>", value);
  }
  return ref;
}

export function currency(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  const code = nonEmptyString(value, field, ErrorClass);
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new ErrorClass(field, "ISO-4217 uppercase currency", value);
  }
  return code;
}

export function headerName(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): string {
  const header = nonEmptyString(value, field, ErrorClass);
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(header)) {
    throw new ErrorClass(field, "HTTP header name", value);
  }
  return header;
}

export function canonicalJsonObject(
  value: unknown,
  field: string,
  ErrorClass: typeof EnvelopeParseError | typeof ManifestParseError | typeof PortDescriptorParseError,
): Record<string, unknown> {
  const source = expectObject(value, field, ErrorClass);
  return cloneJson(source);
}
