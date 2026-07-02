import { REDACTED } from "../core/secret-value.js";

const secretRegistry = new Set<string>();

export function registerSecretForRedaction(value: string): void {
  if (typeof value === "string" && value.length > 0) {
    secretRegistry.add(value);
  }
}

export function clearSecretRegistry(): void {
  secretRegistry.clear();
}

export function scrubAtCapture<T>(payload: T): T {
  if (secretRegistry.size === 0) {
    return payload;
  }

  if (typeof payload === "string") {
    return scrubString(payload) as T;
  }

  if (payload === null || payload === undefined || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => scrubAtCapture(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === "value" && typeof value === "string" && secretRegistry.has(value)) {
      continue;
    }
    result[key] = scrubAtCapture(value);
  }
  return result as T;
}

export type ConformanceSurfaces = {
  readonly bindle?: unknown;
  readonly camp?: unknown;
  readonly events?: unknown;
  readonly logs?: unknown;
  readonly spans?: unknown;
  readonly streams?: unknown;
};

export function assertNoPlaintextConformance(
  surfaces: ConformanceSurfaces,
  secretValues: readonly string[],
): { readonly ok: true } {
  const secrets = [...new Set(secretValues.filter((value) => value.length > 0))];
  const leaks: string[] = [];

  for (const [name, surface] of Object.entries(surfaces)) {
    if (surface === undefined || surface === null) continue;
    const serialized = serializeSurface(surface);
    for (const secret of secrets) {
      if (serialized.includes(secret)) {
        leaks.push(`${name} contains plaintext secret`);
      }
    }
  }

  if (leaks.length > 0) {
    throw new Error(`no-plaintext conformance failed: ${[...new Set(leaks)].join("; ")}`);
  }

  return { ok: true };
}

function scrubString(input: string): string {
  let output = input;
  for (const secret of secretRegistry) {
    if (output.includes(secret)) {
      output = output.split(secret).join(REDACTED);
    }
  }
  return output;
}

function serializeSurface(surface: unknown): string {
  if (typeof surface === "string") {
    return surface;
  }
  return JSON.stringify(surface);
}
