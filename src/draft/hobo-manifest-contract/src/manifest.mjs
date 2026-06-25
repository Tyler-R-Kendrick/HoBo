import { createHash } from "node:crypto";

export const MANIFEST_SCHEMA = "hobo.manifest/v1";

const RESOURCE_TYPES = new Set(["data.v1", "component.v1", "website.v1"]);
const RESOURCE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MANIFEST_REFERENCE = /^\{([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_.-]*)\}$/;
const RESOURCE_PLACEHOLDER =
  /^\$\{resources\.([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_-]*)#([A-Za-z][A-Za-z0-9_-]*)\.outputs\.([A-Za-z][A-Za-z0-9_.-]*)\}$/;
const CONTEXT_PLACEHOLDER = /^\$\{context\.([A-Za-z][A-Za-z0-9_.-]*)\}$/;

export class ManifestValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ManifestValidationError";
    this.path = path;
  }
}

export function validateManifest(input) {
  assertRecord(input, "manifest");

  if (input.schema !== MANIFEST_SCHEMA) {
    throw new ManifestValidationError(
      "schema",
      `expected ${MANIFEST_SCHEMA}`,
    );
  }

  assertRecord(input.componentHost, "componentHost");
  assertRequiredString(input.componentHost.kind, "componentHost.kind");
  assertRequiredString(input.componentHost.version, "componentHost.version");

  assertRecord(input.resources, "resources");

  const resourceEntries = Object.entries(input.resources);
  if (resourceEntries.length === 0) {
    throw new ManifestValidationError("resources", "must declare at least one resource");
  }

  for (const [id, resource] of resourceEntries) {
    validateResource(id, resource);
  }

  const aspireEnv = {};
  for (const [id, resource] of resourceEntries) {
    validateResourceReferences(id, resource, input.resources, aspireEnv);
  }

  return {
    valid: true,
    schema: MANIFEST_SCHEMA,
    aspireEnv,
    hash: canonicalManifestHash(input),
  };
}

export function parseManifestReference(value) {
  const match = MANIFEST_REFERENCE.exec(value);
  if (!match) {
    throw new ManifestValidationError("reference", `invalid manifest token ${value}`);
  }

  return {
    resourceId: match[1],
    output: match[2],
  };
}

export function parseOutputPlaceholder(value) {
  const resourceMatch = RESOURCE_PLACEHOLDER.exec(value);
  if (resourceMatch) {
    return {
      type: resourceMatch[1],
      className: resourceMatch[2],
      resourceId: resourceMatch[3],
      output: resourceMatch[4],
    };
  }

  const contextMatch = CONTEXT_PLACEHOLDER.exec(value);
  if (contextMatch) {
    return {
      contextPath: contextMatch[1],
    };
  }

  throw new ManifestValidationError("placeholder", `invalid placeholder ${value}`);
}

export function canonicalManifestHash(manifest) {
  const canonical = JSON.stringify(sortKeys(manifest));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function validateResource(id, resource) {
  if (!RESOURCE_ID.test(id)) {
    throw new ManifestValidationError(`resources.${id}`, "invalid resource id");
  }
  assertRecord(resource, `resources.${id}`);

  assertRequiredString(resource.type, `resources.${id}.type`);
  if (!RESOURCE_TYPES.has(resource.type)) {
    throw new ManifestValidationError(
      `resources.${id}.type`,
      `unknown resource type ${resource.type}`,
    );
  }

  if (resource.type === "data.v1") {
    assertRequiredString(resource.port, `resources.${id}.port`);
  }

  if (resource.allow !== undefined && !isStringArray(resource.allow)) {
    throw new ManifestValidationError(
      `resources.${id}.allow`,
      "must be an array of strings",
    );
  }

  if (resource.links !== undefined && !Array.isArray(resource.links)) {
    throw new ManifestValidationError(`resources.${id}.links`, "must be an array");
  }
}

function validateResourceReferences(id, resource, resources, aspireEnv) {
  if (resource.links) {
    resource.links.forEach((link, index) => {
      assertRecord(link, `resources.${id}.links[${index}]`);
      assertRequiredString(link.import, `resources.${id}.links[${index}].import`);
      assertRequiredString(link.to, `resources.${id}.links[${index}].to`);

      const target = resources[link.to];
      if (!target) {
        throw new ManifestValidationError(
          `resources.${id}.links[${index}].to`,
          `unknown resource ${link.to}`,
        );
      }

      if (target.port !== link.import) {
        throw new ManifestValidationError(
          `resources.${id}.links[${index}].import`,
          `no matching declared resource for ${link.import}`,
        );
      }
    });
  }

  if (resource.bind) {
    if (!isStringArray(resource.bind)) {
      throw new ManifestValidationError(`resources.${id}.bind`, "must be an array of resource ids");
    }

    for (const targetId of resource.bind) {
      if (!resources[targetId]) {
        throw new ManifestValidationError(
          `resources.${id}.bind`,
          `unknown resource ${targetId}`,
        );
      }
    }
  }

  visitStrings(resource, `resources.${id}`, (value, path) => {
    if (MANIFEST_REFERENCE.test(value)) {
      const reference = parseManifestReference(value);
      if (!resources[reference.resourceId]) {
        throw new ManifestValidationError(
          path,
          `unknown resource ${reference.resourceId}`,
        );
      }
    }

    if (value.startsWith("${")) {
      const placeholder = parseOutputPlaceholder(value);
      if (placeholder.resourceId && !resources[placeholder.resourceId]) {
        throw new ManifestValidationError(
          path,
          `unknown resource ${placeholder.resourceId}`,
        );
      }
    }
  });

  if (isRecord(resource.env)) {
    for (const key of Object.keys(resource.env)) {
      if (key.startsWith("ConnectionStrings__") || key.startsWith("services__")) {
        aspireEnv[id] ??= [];
        aspireEnv[id].push(key);
      }
    }
  }
}

function visitStrings(value, path, visitor) {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, `${path}[${index}]`, visitor));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      visitStrings(child, `${path}.${key}`, visitor);
    }
  }
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

function assertRecord(value, path) {
  if (!isRecord(value)) {
    throw new ManifestValidationError(path, "must be an object");
  }
}

function assertRequiredString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManifestValidationError(path, "required");
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
