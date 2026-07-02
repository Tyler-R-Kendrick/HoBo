import type { PactRequest, PactResponse } from "../../../src/index.js";
import type { ProviderStub } from "../../../src/verify.js";

export const skewedProviderStub: ProviderStub = {
  name: "CoreContractSurface",
  handle(request: PactRequest): PactResponse {
    const schemaVersion =
      typeof request.body === "object" &&
      request.body !== null &&
      !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>).schemaVersion
        : undefined;

    if (schemaVersion === "hobo.core/v0") {
      return {
        status: 400,
        body: {
          error: {
            code: "HOBO_CORE_UNSUPPORTED_SCHEMA",
            message: "unsupported schemaVersion",
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        schemaVersion: "hobo.core/v2",
        eventMappings: { cloudEventSpecversion: "1.0" },
        publicSurface: { ok: true },
        surfaceHash: "static-reference",
      },
    };
  },
};
