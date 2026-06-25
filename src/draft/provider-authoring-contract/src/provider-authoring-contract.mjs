export function createOptionBuilder(providerId, port, optionName) {
  return Object.assign(
    ({ negotiation = "prefer", ...options } = {}) => ({
      providerId,
      port,
      optionName,
      negotiation,
      options
    }),
    {
      providerId,
      port,
      optionName
    }
  );
}

export function defineProvider(spec) {
  const capabilities = [...spec.capabilities];
  const declaredPorts = new Set(capabilities.map((capability) => capability.port));
  for (const [name, builder] of Object.entries(spec.with)) {
    if (builder.providerId !== spec.id) {
      throw new Error(`option builder ${name} belongs to provider ${builder.providerId}, not ${spec.id}`);
    }
    if (!declaredPorts.has(builder.port)) {
      throw new Error(`option builder ${name} references undeclared port ${builder.port}`);
    }
  }

  const provider = {
    id: spec.id,
    capabilities,
    with: Object.freeze({ ...spec.with }),
    client(port, outputs) {
      if (!declaredPorts.has(port)) {
        throw new Error(`provider ${spec.id} does not declare port ${port}`);
      }
      return spec.client(port, outputs);
    },
    capabilityManifest() {
      return spec.capabilityManifest({
        id: spec.id,
        capabilities,
        optionBuilders: Object.keys(spec.with)
      });
    }
  };

  return Object.freeze(provider);
}

export function createFixtureAwsProvider() {
  return defineProvider({
    id: "aws",
    capabilities: [
      { port: "database", stability: "stable" },
      { port: "compute", stability: "stable" }
    ],
    with: {
      rds: createOptionBuilder("aws", "database", "rds"),
      fargate: createOptionBuilder("aws", "compute", "fargate")
    },
    client(port, outputs) {
      if (port === "database") {
        return {
          port,
          providerId: "aws",
          connectionString: outputs.endpoint
        };
      }
      return {
        port,
        providerId: "aws",
        endpoint: outputs.endpoint
      };
    },
    capabilityManifest({ id, capabilities, optionBuilders }) {
      return {
        providerId: id,
        capabilities,
        auth: { mode: "brokered" },
        optionBuilders
      };
    }
  });
}

export function createFixtureAzureProvider() {
  return defineProvider({
    id: "azure",
    capabilities: [
      { port: "database", stability: "stable" },
      { port: "compute", stability: "stable" }
    ],
    with: {
      postgres: createOptionBuilder("azure", "database", "postgres"),
      containerApp: createOptionBuilder("azure", "compute", "containerApp")
    },
    client(port, outputs) {
      return {
        port,
        providerId: "azure",
        endpoint: outputs.endpoint
      };
    },
    capabilityManifest({ id, capabilities, optionBuilders }) {
      return {
        providerId: id,
        capabilities,
        auth: { mode: "brokered" },
        optionBuilders
      };
    }
  });
}

export function resolveProviderOptions(provider, optionBlocks) {
  const merged = {};
  const dropped = [];
  const declaredPorts = new Set((provider.capabilities ?? []).map((capability) => capability.port));

  for (const block of optionBlocks) {
    if (block.providerId !== provider.id) {
      dropped.push({
        providerId: block.providerId,
        port: block.port,
        optionName: block.optionName,
        reason: `option block belongs to unresolved provider ${block.providerId}`
      });
      continue;
    }
    if (declaredPorts.size > 0 && !declaredPorts.has(block.port)) {
      throw new Error(`option block ${block.optionName} references undeclared port ${block.port}`);
    }

    merged[block.port] = {
      optionName: block.optionName,
      negotiation: block.negotiation,
      options: block.options
    };
  }

  return { merged, dropped };
}

export function mergeResolvedProviderOptions(provider, optionBlocks) {
  return resolveProviderOptions(provider, optionBlocks);
}

export function auditProviderCatalog(providers) {
  const providersByOption = new Map();

  for (const provider of providers) {
    for (const builder of Object.values(provider.with)) {
      const optionName = builder.optionName;
      if (!providersByOption.has(optionName)) {
        providersByOption.set(optionName, []);
      }
      providersByOption.get(optionName).push(provider.id);
    }
  }

  const conflicts = [...providersByOption.entries()]
    .filter(([, providerIds]) => providerIds.length > 1)
    .map(([optionName, providerIds]) => ({
      optionName,
      providers: providerIds.sort(),
      reason: "unqualified option builder name is ambiguous; use provider-scoped access"
    }));

  return {
    ok: conflicts.length === 0,
    conflicts
  };
}

export function validateProviderPackage(provider) {
  const errors = [];

  if (!provider?.id) {
    errors.push("provider id is required");
  }
  if (!Array.isArray(provider?.capabilities) || provider.capabilities.length === 0) {
    errors.push("provider must declare at least one capability");
  }
  if (!provider?.with || typeof provider.with !== "object") {
    errors.push("provider must export scoped .with option builders");
  }
  if (typeof provider?.client !== "function") {
    errors.push("provider must export a runtime client(port, outputs) function");
  }
  if (typeof provider?.capabilityManifest !== "function") {
    errors.push("provider must export capabilityManifest()");
  }

  if (typeof provider?.client === "function") {
    for (const capability of provider.capabilities ?? []) {
      const client = provider.client(capability.port, { endpoint: "fixture://endpoint" });
      if (!client || client.port !== capability.port || client.providerId !== provider.id) {
        errors.push(`client(${capability.port}) returned untyped surface`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
