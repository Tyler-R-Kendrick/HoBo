export const MANIFEST_SCHEMA = "hobo.manifest/v1";
export const CONTRACT_VERSION = "hobo.provider-options/v1";

export const aws = {
  rds(options) {
    return providerOption("aws", "rds", ["data"], options);
  },
  fargate(options) {
    return providerOption("aws", "fargate", ["component"], options);
  }
};

export const azure = {
  flexibleServer(options) {
    return providerOption("azure", "flexibleServer", ["data"], options);
  },
  containerApp(options) {
    return providerOption("azure", "containerApp", ["component"], options);
  }
};

export function database(name, options = {}) {
  const { engine = "generic", prefer, require } = options;
  return new ResourceHandle({
    id: name,
    kind: "data",
    type: "data.v1",
    port: "hobo:data",
    className: engine,
    requirement: toRequirement({ prefer, require })
  });
}

export function service(name, options = {}) {
  return new ResourceHandle({
    id: name,
    kind: "component",
    type: "component.v1",
    port: "hobo:component",
    className: options.workloadProfile ?? "wasm-component",
    requirement: toRequirement(options)
  });
}

export function createManifest(resources) {
  const entries = resources.map((resource) => [resource.id, resource.toManifestResource()]);
  return {
    schema: MANIFEST_SCHEMA,
    contract: CONTRACT_VERSION,
    resources: Object.fromEntries(entries)
  };
}

export function resolvedProviderOptions(resource, providerKey) {
  const annotations = resource?.annotations?.with ?? {};
  return Object.fromEntries(
    Object.entries(annotations).filter(([annotationKey]) => annotationKey.startsWith(`${providerKey}.`))
  );
}

export function projectAgnosticResource(resource) {
  const { annotations: _annotations, portability: _portability, ...agnostic } = resource;
  return sortKeys(agnostic);
}

class ResourceHandle {
  constructor({ id, kind, type, port, className, requirement }) {
    this.id = id;
    this.kind = kind;
    this.type = type;
    this.port = port;
    this.className = className;
    this.requirement = requirement;
    this.providerAnnotations = {};
    this.lockInMarkers = [];
  }

  with(...options) {
    for (const option of options) {
      this.addProviderOption(option);
    }
    return this;
  }

  addProviderOption(option) {
    if (!option || option.__kind !== "hobo.provider-option") {
      throw new TypeError("with(...) accepts provider option builders only");
    }
    if (!option.resourceKinds.includes(this.kind)) {
      throw new TypeError(`${option.annotationKey} cannot annotate ${this.kind} resources`);
    }

    const existing = this.providerAnnotations[option.annotationKey] ?? {};
    this.providerAnnotations[option.annotationKey] = sortKeys(
      mergeOptionValues(existing, option.value, option.annotationKey)
    );
    this.lockInMarkers = buildLockInMarkers(this.id, this.providerAnnotations);
  }

  toManifestResource() {
    const resource = {
      type: this.type,
      port: this.port,
      className: this.className
    };

    if (this.requirement) {
      resource.requirement = this.requirement;
    }

    if (Object.keys(this.providerAnnotations).length > 0) {
      resource.annotations = {
        with: sortKeys(this.providerAnnotations)
      };
      resource.portability = {
        lockInMarkers: this.lockInMarkers
      };
    }

    return resource;
  }
}

function providerOption(provider, optionName, resourceKinds, value) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${provider}.${optionName} options must be an object`);
  }

  return {
    __kind: "hobo.provider-option",
    provider,
    optionName,
    annotationKey: `${provider}.${optionName}`,
    resourceKinds,
    value: sortKeys(value)
  };
}

function toRequirement({ prefer, require }) {
  if (prefer && require) {
    throw new TypeError("prefer and require are mutually exclusive");
  }
  if (prefer) return { mode: "prefer", capability: prefer };
  if (require) return { mode: "require", capability: require };
  return undefined;
}

function mergeOptionValues(left, right, path) {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    if (Object.is(left, right)) return left;
    throw new TypeError(`conflicting provider option ${path}`);
  }

  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (Object.hasOwn(merged, key)) {
      merged[key] = mergeOptionValues(merged[key], value, `${path}.${key}`);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function buildLockInMarkers(resourceId, annotations) {
  return Object.keys(annotations)
    .sort()
    .map((annotationKey) => {
      const [provider] = annotationKey.split(".");
      return {
        source: ".with()",
        annotation: annotationKey,
        provider,
        path: `resources.${resourceId}.annotations.with.${annotationKey}`,
        reason: "provider-specific option is additive but non-portable"
      };
    });
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}
