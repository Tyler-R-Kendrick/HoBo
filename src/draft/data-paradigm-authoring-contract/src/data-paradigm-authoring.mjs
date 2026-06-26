export const MANIFEST_SCHEMA = "hobo.manifest/v1";
export const PARADIGM_PACKAGE_KIND = "hobo.paradigm-package";

const RESOURCE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const DATA_ALLOW_VERBS = Object.freeze(["read", "write", "query", "admin"]);
const CANONICAL_PARADIGM_PACKAGES = Object.freeze({
  "@hobo/sql": Object.freeze({
    paradigm: "relational",
    equivalenceClass: "managed-postgres",
    port: "hobo:data",
  }),
  "@hobo/document": Object.freeze({
    paradigm: "document",
    equivalenceClass: "managed-document",
    port: "hobo:data",
  }),
  "@hobo/vector": Object.freeze({
    paradigm: "vector",
    equivalenceClass: "search-extension",
    port: "hobo:data",
    extensionPort: "hobo:search",
  }),
  "@hobo/graph": Object.freeze({
    paradigm: "graph",
    equivalenceClass: "search-extension",
    port: "hobo:data",
    extensionPort: "hobo:search",
  }),
});

export class AuthoringSurfaceError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "AuthoringSurfaceError";
    this.path = path;
  }
}

export function importParadigmPackage(input) {
  if (!isRecord(input)) {
    throw new AuthoringSurfaceError("package", "must be a package descriptor");
  }
  assertNonEmptyString(input.packageName, "package.packageName");
  assertNonEmptyString(input.paradigm, "package.paradigm");
  assertNonEmptyString(input.equivalenceClass, "package.equivalenceClass");

  const canonical = CANONICAL_PARADIGM_PACKAGES[input.packageName];
  if (!canonical) {
    throw new AuthoringSurfaceError("package.packageName", "unknown HoBo paradigm package");
  }

  for (const key of ["paradigm", "equivalenceClass", "port", "extensionPort"]) {
    if (input[key] !== canonical[key]) {
      throw new AuthoringSurfaceError(
        `package.${key}`,
        `${input.packageName} must declare ${key}=${canonical[key] ?? "undefined"}`,
      );
    }
  }

  const features = (input.features ?? []).map((feature, index) =>
    normalizeFeature(feature, `package.features[${index}]`),
  );

  return Object.freeze({
    kind: PARADIGM_PACKAGE_KIND,
    packageName: input.packageName,
    paradigm: input.paradigm,
    equivalenceClass: input.equivalenceClass,
    port: input.port,
    extensionPort: input.extensionPort,
    features: Object.freeze(features),
  });
}

export function data(name) {
  assertResourceName(name, "data.name");
  return new DataHandle(name);
}

export function createManifest(handles) {
  const resources = {};

  for (const handle of handles) {
    assertDataHandle(handle);
    if (Object.hasOwn(resources, handle.name)) {
      throw new AuthoringSurfaceError(`resources.${handle.name}`, "duplicate resource id");
    }
    resources[handle.name] = handle.toManifestResource();
  }

  return {
    schema: MANIFEST_SCHEMA,
    resources,
  };
}

class DataHandle {
  constructor(name) {
    this.kind = "data";
    this.name = name;
    this.port = "hobo:data";
    this.stableId = `data:${name}`;
    this.usedVerbs = new Set();
    this.paradigmPackage = null;
  }

  use(packageDescriptor) {
    assertParadigmPackage(packageDescriptor, `resources.${this.name}.paradigm`);
    if (
      this.paradigmPackage &&
      this.paradigmPackage.packageName !== packageDescriptor.packageName
    ) {
      throw new AuthoringSurfaceError(
        `resources.${this.name}.paradigm`,
        `already bound to ${this.paradigmPackage.packageName}`,
      );
    }

    this.paradigmPackage = packageDescriptor;
    return this;
  }

  allow(...verbs) {
    for (const verb of verbs) {
      this.recordVerb(verb, `resources.${this.name}.allow`);
    }
    return this;
  }

  read(...args) {
    return this.lower("read", args);
  }

  write(...args) {
    return this.lower("write", args);
  }

  query(...args) {
    return this.lower("query", args);
  }

  admin(...args) {
    return this.lower("admin", args);
  }

  lower(verb, args) {
    this.recordVerb(verb, `resources.${this.name}.${verb}`);
    return Object.freeze({
      lowersTo: "hobo:sdk",
      kind: "data",
      name: this.name,
      handleStableId: this.stableId,
      portRef: Object.freeze(["hobo:data"]),
      extensionPortRef: extensionPortRefFor(this.paradigmPackage),
      verb,
      args: Object.freeze([...args]),
    });
  }

  recordVerb(verb, path) {
    if (!DATA_ALLOW_VERBS.includes(verb)) {
      throw new AuthoringSurfaceError(path, `data does not allow verb ${verb}`);
    }
    this.usedVerbs.add(verb);
  }

  toManifestResource() {
    const resource = {
      type: "data.v1",
      port: "hobo:data",
      kind: "data",
      allow: [...this.usedVerbs].sort(),
      usage: {
        inferred: [...this.usedVerbs].sort(),
        source: "run-to-collect",
      },
      collection: {
        stableId: this.stableId,
      },
    };

    if (!this.paradigmPackage) {
      return resource;
    }

    const specializationMarker = {
      source: "paradigm-package",
      package: this.paradigmPackage.packageName,
      marker: "surfaced-specialization",
      equivalenceClass: this.paradigmPackage.equivalenceClass,
      path: `resources.${this.name}.paradigm`,
      reason: `developer opted into ${this.paradigmPackage.packageName} over portable data() default`,
    };
    const lockInMarkers = buildParadigmLockInMarkers(this.name, this.paradigmPackage);

    resource.paradigm = this.paradigmPackage.paradigm;
    resource.specialization = {
      marker: "surfaced-specialization",
      package: this.paradigmPackage.packageName,
      equivalenceClass: this.paradigmPackage.equivalenceClass,
      path: `resources.${this.name}.paradigm`,
    };
    if (this.paradigmPackage.extensionPort) {
      resource.extensions = [
        {
          source: "paradigm-package",
          package: this.paradigmPackage.packageName,
          port: this.paradigmPackage.extensionPort,
          features: this.paradigmPackage.features.map((feature) => feature.name).sort(),
        },
      ];
    }
    resource.portability = {
      specializationMarkers: [specializationMarker],
    };

    if (lockInMarkers.length > 0) {
      resource.portability.lockInMarkers = lockInMarkers;
    }

    return sortKeys(resource);
  }
}

function extensionPortRefFor(packageDescriptor) {
  return Object.freeze(packageDescriptor?.extensionPort ? [packageDescriptor.extensionPort] : []);
}

function buildParadigmLockInMarkers(resourceName, packageDescriptor) {
  return packageDescriptor.features
    .filter((feature) => feature.crossParadigmEquivalent === false)
    .map((feature) => ({
      category: "paradigm-mismatch",
      source: "paradigm-package-feature",
      package: packageDescriptor.packageName,
      feature: feature.name,
      path: `resources.${resourceName}.features.${feature.name}`,
      reason: "feature has no cross-paradigm equivalent",
      severity: "blocking",
    }));
}

function normalizeFeature(feature, path) {
  if (!isRecord(feature)) {
    throw new AuthoringSurfaceError(path, "feature must be a descriptor");
  }
  assertNonEmptyString(feature.name, `${path}.name`);
  return Object.freeze({
    name: feature.name,
    crossParadigmEquivalent: feature.crossParadigmEquivalent !== false,
  });
}

function assertParadigmPackage(packageDescriptor, path) {
  if (!packageDescriptor || packageDescriptor.kind !== PARADIGM_PACKAGE_KIND) {
    throw new AuthoringSurfaceError(path, "use(...) accepts imported Data Plane package descriptors");
  }
  if (packageDescriptor.port !== "hobo:data") {
    throw new AuthoringSurfaceError(path, "paradigm package must bind to hobo:data");
  }
}

function assertDataHandle(handle) {
  if (!handle || handle.kind !== "data" || typeof handle.toManifestResource !== "function") {
    throw new AuthoringSurfaceError("handles", "must contain data() handles");
  }
}

function assertResourceName(name, path) {
  if (typeof name !== "string" || !RESOURCE_ID.test(name)) {
    throw new AuthoringSurfaceError(path, "invalid resource id");
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthoringSurfaceError(path, "must be a non-empty string");
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}
