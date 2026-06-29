const DEFAULT_SUBJECT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";

export function createCrossAppRuntime({
  ctx,
  manifest,
  observedOperations,
  targetCatalog,
  broker,
  requestIdFactory = (target) => `xaa-${target}`,
}) {
  assertObject(ctx, "ctx");
  assertObject(manifest, "manifest");
  assertObject(manifest.externalApps, "manifest.externalApps");
  assertObject(targetCatalog, "targetCatalog");
  if (!broker || typeof broker.exchangeToken !== "function") {
    throw new TypeError("broker.exchangeToken must be a function");
  }

  const observedByTarget = groupObservedScopes(observedOperations);

  return Object.freeze({
    crossApp(targetName) {
      const target = requireString(targetName, "targetName");
      const manifestEntry = manifest.externalApps[target];
      if (!manifestEntry) {
        throw new Error(`crossApp ${target} is not present in manifest.externalApps`);
      }
      const targetConfig = targetCatalog[target];
      if (!targetConfig) {
        throw new Error(`crossApp ${target} has no runtime target catalog entry`);
      }

      return Object.freeze({
        async token(explicitScopes) {
          const resolved = resolveRuntimeRequest({
            ctx,
            target,
            manifestEntry,
            targetConfig,
            observedScopes: observedByTarget.get(target) ?? [],
            explicitScopes,
            requestIdFactory,
          });
          const result = await broker.exchangeToken(resolved.exchangeRequest);
          return Object.freeze({
            ...result,
            target,
            subject: resolved.exchangeRequest.subject,
            requestedScopes: resolved.exchangeRequest.requestedScopes,
            manifestAllow: resolved.manifestAllow,
          });
        },
      });
    },
  });
}

function resolveRuntimeRequest({
  ctx,
  target,
  manifestEntry,
  targetConfig,
  observedScopes,
  explicitScopes,
  requestIdFactory,
}) {
  const user = normalizeCtxUser(ctx.user);
  const identity = normalizeIdentity(ctx.identity);
  const manifestAllow = normalizeScopes(manifestEntry.allow, "manifest.externalApps.allow");
  const observed = normalizeScopes(observedScopes, "observedOperations");
  if (!sameSet(manifestAllow, observed)) {
    throw new Error(
      `manifest allow must match observed crossApp scopes for ${target}; ` +
        `allow=[${manifestAllow.join(",")}] observed=[${observed.join(",")}]`,
    );
  }
  if (manifestEntry.onBehalfOf !== "user") {
    throw new Error(`crossApp ${target} manifest entry must broker on behalf of ctx.user`);
  }
  if (manifestEntry.via !== "xaa") {
    throw new Error(`crossApp ${target} must use XAA for runtime broker backing`);
  }

  const requestedScopes =
    explicitScopes === undefined
      ? manifestAllow
      : normalizeScopes(explicitScopes, "explicit token scopes");
  assertSubset(requestedScopes, manifestAllow, "cannot widen beyond inferred manifest allow");

  const allowedScopes = normalizeScopes(targetConfig.allowedScopes, "target.allowedScopes");
  assertSubset(requestedScopes, allowedScopes, "requested scope is not advertised by target");

  return Object.freeze({
    manifestAllow,
    exchangeRequest: Object.freeze({
      requestId: requireString(requestIdFactory(target), "requestId"),
      subject: Object.freeze({
        ...identity,
        delegatedBy: Object.freeze({ kind: "user", id: user.id }),
      }),
      subjectToken: Object.freeze({
        tokenRef: user.tokenRef,
        tokenType: user.tokenType,
      }),
      target: Object.freeze({
        id: requireString(targetConfig.id ?? target, "target.id"),
        audience: requireString(targetConfig.audience, "target.audience"),
        resource: requireString(targetConfig.resource, "target.resource"),
        allowedScopes,
        authFlow: Object.freeze({
          type: requireString(targetConfig.authFlow?.type, "target.authFlow.type"),
          targetAuthorizationServer: targetConfig.authFlow?.targetAuthorizationServer,
        }),
      }),
      requestedScopes,
    }),
  });
}

function groupObservedScopes(observedOperations) {
  if (!Array.isArray(observedOperations)) {
    throw new TypeError("observedOperations must be an array");
  }

  const byTarget = new Map();
  for (const operation of observedOperations) {
    assertObject(operation, "observedOperation");
    const target = requireString(operation.target, "observedOperation.target");
    const scope = requireString(operation.scope, "observedOperation.scope");
    const scopes = byTarget.get(target) ?? new Set();
    scopes.add(scope);
    byTarget.set(target, scopes);
  }

  return new Map([...byTarget].map(([target, scopes]) => [target, [...scopes].sort()]));
}

function normalizeCtxUser(value) {
  assertObject(value, "ctx.user is required");
  return Object.freeze({
    id: requireString(value.id, "ctx.user.id"),
    tokenRef: requireString(value.tokenRef, "ctx.user.tokenRef"),
    tokenType: requireString(value.tokenType ?? DEFAULT_SUBJECT_TOKEN_TYPE, "ctx.user.tokenType"),
  });
}

function normalizeIdentity(value) {
  assertObject(value, "ctx.identity");
  return Object.freeze({
    kind: requireString(value.kind, "ctx.identity.kind"),
    id: requireString(value.id, "ctx.identity.id"),
  });
}

function normalizeScopes(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
  return Object.freeze([...new Set(value.map((scope) => requireString(scope, field)))].sort());
}

function assertSubset(candidate, allowed, message) {
  const allowedSet = new Set(allowed);
  const extra = candidate.filter((scope) => !allowedSet.has(scope));
  if (extra.length > 0) {
    throw new Error(`${message}: ${extra.join(", ")}`);
  }
}

function sameSet(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}
