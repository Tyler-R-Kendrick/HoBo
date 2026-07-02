export type ResourceId = string & { readonly __brand: "ResourceId" };
export type DesiredRef = string & { readonly __brand: "DesiredRef" };
export type Environment = string & { readonly __brand: "Environment" };

export type DriftResource = {
  id: ResourceId;
  desiredRef: DesiredRef;
  environment: Environment;
};

export type GetDriftRequest = {
  resourceId: ResourceId | null;
  projection: unknown[];
};

export type HealDriftRequest = {
  resourceId: ResourceId;
  projection: unknown[];
};

export function parseResourceId(value: unknown): ResourceId {
  return requireNonEmptyString(value, "resourceId") as ResourceId;
}

export function parseDesiredRef(value: unknown, fallbackId: ResourceId): DesiredRef {
  if (value == null) {
    return `set:desired@${fallbackId}` as DesiredRef;
  }
  return requireNonEmptyString(value, "desiredRef") as DesiredRef;
}

export function parseEnvironment(value: unknown): Environment {
  if (value == null) {
    return "staging" as Environment;
  }
  return requireNonEmptyString(value, "environment") as Environment;
}

export function parseDriftResource(value: unknown): DriftResource {
  if (value == null || typeof value !== "object") {
    throw new TypeError("drift resource must be an object");
  }
  const resource = value as Record<string, unknown>;
  const id = parseResourceId(resource.id);
  return {
    id,
    desiredRef: parseDesiredRef(resource.desiredRef, id),
    environment: parseEnvironment(resource.environment),
  };
}

export function parseDriftResources(value: unknown): DriftResource[] {
  if (!Array.isArray(value)) {
    throw new TypeError("resources must be an array");
  }
  return value.map(parseDriftResource);
}

export function parseGetDriftRequest(value: unknown): GetDriftRequest {
  if (value == null || typeof value !== "object") {
    throw new TypeError("get drift request must be an object");
  }
  const request = value as Record<string, unknown>;
  const resourceId =
    request.resourceId == null ? null : parseResourceId(request.resourceId);
  if (!Array.isArray(request.projection)) {
    throw new TypeError("projection must be an array");
  }
  return {
    resourceId,
    projection: request.projection,
  };
}

export function parseHealDriftRequest(value: unknown): HealDriftRequest {
  if (value == null || typeof value !== "object") {
    throw new TypeError("heal drift request must be an object");
  }
  const request = value as Record<string, unknown>;
  if (!Array.isArray(request.projection)) {
    throw new TypeError("projection must be an array");
  }
  return {
    resourceId: parseResourceId(request.resourceId),
    projection: request.projection,
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}
