import type { PactRequest, PactResponse, ProviderStub } from "../../src/index.js";

export interface CoreContractSurface {
  readonly schemaVersion: "hobo.core/v1";
  readonly eventMappings: { readonly cloudEventSpecversion: "1.0" };
  readonly publicSurface: { readonly ok: true };
}

export class CoreContractSurfaceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreContractSurfaceParseError";
  }
}

export function parseCoreContractSurface(body: unknown): CoreContractSurface {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CoreContractSurfaceParseError("response body must be an object");
  }

  const record = body as Record<string, unknown>;
  if (record.schemaVersion !== "hobo.core/v1") {
    throw new CoreContractSurfaceParseError(`unsupported schemaVersion: ${String(record.schemaVersion)}`);
  }

  const eventMappings = record.eventMappings;
  if (
    typeof eventMappings !== "object" ||
    eventMappings === null ||
    Array.isArray(eventMappings) ||
    (eventMappings as Record<string, unknown>).cloudEventSpecversion !== "1.0"
  ) {
    throw new CoreContractSurfaceParseError("invalid eventMappings.cloudEventSpecversion");
  }

  const publicSurface = record.publicSurface;
  if (
    typeof publicSurface !== "object" ||
    publicSurface === null ||
    Array.isArray(publicSurface) ||
    (publicSurface as Record<string, unknown>).ok !== true
  ) {
    throw new CoreContractSurfaceParseError("invalid publicSurface.ok");
  }

  return {
    schemaVersion: "hobo.core/v1",
    eventMappings: { cloudEventSpecversion: "1.0" },
    publicSurface: { ok: true },
  };
}

export async function fetchCoreContractSurface(
  provider: ProviderStub,
  body?: unknown,
): Promise<CoreContractSurface> {
  const request: PactRequest = {
    method: "POST",
    path: "/core/contract-surface",
    ...(body === undefined ? {} : { body }),
  };

  const response: PactResponse = await provider.handle(request);
  if (response.status !== 200) {
    throw new CoreContractSurfaceParseError(`unexpected status ${response.status}`);
  }

  return parseCoreContractSurface(response.body);
}

export async function fetchUnsupportedSchemaError(
  provider: ProviderStub,
  schemaVersion: string,
): Promise<{ code: string; message: string }> {
  const response = await provider.handle({
    method: "POST",
    path: "/core/contract-surface",
    body: { schemaVersion },
  });

  if (response.status !== 400) {
    throw new Error(`expected status 400, got ${response.status}`);
  }

  const body = response.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("error response body must be an object");
  }

  const error = (body as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    throw new Error("error envelope missing");
  }

  const record = error as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") {
    throw new Error("error envelope must include code and message");
  }

  return { code: record.code, message: record.message };
}
