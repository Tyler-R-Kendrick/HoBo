export function createGraphqlFacadeRuntime({ materializations, events = [], now = () => Date.now() }) {
  if (!Array.isArray(materializations) || materializations.length === 0) {
    throw new TypeError("materializations must contain at least one entry");
  }

  const state = {
    events: events.map(clone),
    snapshots: new Map(),
    subscribers: new Set(),
    foldCounts: new Map(),
  };
  const queryFields = new Map();
  const subscriptionFields = new Map();

  for (const materialization of materializations) {
    validateMaterialization(materialization);
    queryFields.set(materialization.queryField, materialization);
    if (materialization.subscriptionField) {
      subscriptionFields.set(materialization.subscriptionField, materialization);
    }
    state.foldCounts.set(materialization.name, 0);
  }

  return {
    query({ document, context = {} }) {
      const operation = parseGraphqlOperation(document, "query");
      const materialization = requireField(queryFields, operation.fieldName, "query");
      const { snapshot, cacheHit, refreshedBecause } = readSnapshot({
        state,
        materialization,
        operation,
        context,
        now,
      });

      return {
        source: "materialization-snapshot",
        materialization: materialization.name,
        fieldName: operation.fieldName,
        seq: snapshot.seq,
        value: clone(snapshot.value),
        cacheHit,
        ...(refreshedBecause ? { refreshedBecause } : {}),
      };
    },

    subscribe({ document, context = {}, onPush }) {
      if (typeof onPush !== "function") {
        throw new TypeError("onPush callback is required");
      }

      const operation = parseGraphqlOperation(document, "subscription");
      const materialization = requireField(subscriptionFields, operation.fieldName, "subscription");
      requireResolvedTenant(context);
      requireFieldScopes(materialization, operation.fields, context);

      if (materialization.reactive !== true) {
        throw new Error(`${materialization.name} is non-reactive; GraphQL subscription rejected`);
      }

      const subscriber = { operation, materialization, context: normalizeContext(context), onPush };
      state.subscribers.add(subscriber);
      return () => state.subscribers.delete(subscriber);
    },

    appendEvent(event) {
      validateEvent(event);
      state.events.push(clone(event));

      for (const subscriber of state.subscribers) {
        if (!dependsOn(subscriber.materialization, event)) {
          continue;
        }
        if (event.tenant !== subscriber.context.tenant) {
          continue;
        }

        const snapshot = recomputeSnapshot({
          state,
          materialization: subscriber.materialization,
          operation: subscriber.operation,
          context: subscriber.context,
          createdAt: now(),
        });

        subscriber.onPush({
          source: "observable-materialization",
          materialization: subscriber.materialization.name,
          fieldName: subscriber.operation.fieldName,
          seq: snapshot.seq,
          value: clone(snapshot.value),
        });
      }
    },

    stats(materializationName) {
      if (!state.foldCounts.has(materializationName)) {
        throw new Error(`unknown materialization: ${materializationName}`);
      }
      return { folds: state.foldCounts.get(materializationName) };
    },
  };
}

function readSnapshot({ state, materialization, operation, context, now }) {
  requireResolvedTenant(context);
  requireFieldScopes(materialization, operation.fields, context);

  const normalizedContext = normalizeContext(context);
  const cacheKey = snapshotKey(materialization, operation, normalizedContext);
  const existing = state.snapshots.get(cacheKey);
  const currentTime = now();

  if (existing && !isStale(existing, materialization, currentTime)) {
    return { snapshot: existing, cacheHit: true };
  }

  const snapshot = recomputeSnapshot({
    state,
    materialization,
    operation,
    context: normalizedContext,
    createdAt: currentTime,
  });
  state.snapshots.set(cacheKey, snapshot);

  return {
    snapshot,
    cacheHit: false,
    refreshedBecause: existing ? "stale-snapshot" : undefined,
  };
}

function recomputeSnapshot({ state, materialization, operation, context, createdAt }) {
  state.foldCounts.set(materialization.name, state.foldCounts.get(materialization.name) + 1);

  const rows = materialization.fold(state.events.map(clone), context);
  if (!Array.isArray(rows)) {
    throw new TypeError(`${materialization.name} fold must return an array`);
  }

  assertTenantScoped(rows, context.tenant, materialization.name);

  return {
    createdAt,
    seq: maxSeq(state.events, context.tenant),
    value: rows.map((row) => projectFields(row, operation.fields)),
  };
}

function validateMaterialization(materialization) {
  requiredString(materialization?.name, "materialization.name");
  requiredString(materialization?.queryField, "materialization.queryField");
  if (materialization.subscriptionField !== undefined) {
    requiredString(materialization.subscriptionField, "materialization.subscriptionField");
  }
  if (typeof materialization.fold !== "function") {
    throw new TypeError(`${materialization.name} fold is required`);
  }
}

function validateEvent(event) {
  requiredString(event?.type, "event.type");
  requiredString(event?.tenant, "event.tenant");
  requiredString(event?.streamId, "event.streamId");
  if (!Number.isInteger(event.seq) || event.seq < 0) {
    throw new TypeError("event.seq must be a non-negative integer");
  }
}

function parseGraphqlOperation(document, expectedKind) {
  if (typeof document !== "string") {
    throw new TypeError("GraphQL document must be a string");
  }

  const compact = document.replace(/\s+/g, " ").trim();
  const match = /^(query|subscription)(?:\s+\w+)?\s*\{\s*([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*\{\s*([A-Za-z_][\w\s]*)\s*\}\s*\}$/.exec(
    compact,
  );

  if (!match) {
    throw new Error(`unsupported GraphQL document shape: ${document}`);
  }

  const [, kind, fieldName, selection] = match;
  if (kind !== expectedKind) {
    throw new Error(`expected GraphQL ${expectedKind}, got ${kind}`);
  }

  return {
    kind,
    fieldName,
    fields: selection.split(/\s+/).filter(Boolean),
  };
}

function requireField(map, fieldName, kind) {
  const materialization = map.get(fieldName);
  if (!materialization) {
    throw new Error(`unknown GraphQL ${kind} field: ${fieldName}`);
  }
  return materialization;
}

function requireResolvedTenant(context) {
  if (typeof context?.tenant !== "string" || context.tenant.length === 0) {
    throw new Error("resolved tenant is required for GraphQL materialization reads");
  }
}

function requireFieldScopes(materialization, fields, context) {
  const scopes = new Set(context.scopes ?? []);
  for (const field of fields) {
    const requiredScope = materialization.allow?.[field];
    if (requiredScope && !scopes.has(requiredScope)) {
      throw new Error(`missing scope ${requiredScope} for field ${field}`);
    }
  }
}

function assertTenantScoped(rows, tenant, materializationName) {
  for (const row of rows) {
    if (row?.tenant !== tenant) {
      throw new Error(`cross-tenant leak detected in ${materializationName}`);
    }
  }
}

function projectFields(row, fields) {
  const projected = {};
  for (const field of fields) {
    projected[field] = row[field];
  }
  return projected;
}

function normalizeContext(context) {
  return {
    ...context,
    scopes: [...(context.scopes ?? [])].sort(),
  };
}

function snapshotKey(materialization, operation, context) {
  return JSON.stringify({
    materialization: materialization.name,
    tenant: context.tenant,
    scopes: context.scopes,
    fields: operation.fields,
  });
}

function isStale(snapshot, materialization, currentTime) {
  const maxAgeMs = materialization.consistency?.maxAgeMs ?? 0;
  return currentTime - snapshot.createdAt > maxAgeMs;
}

function dependsOn(materialization, event) {
  return !Array.isArray(materialization.readSet) || materialization.readSet.includes(event.type);
}

function maxSeq(events, tenant) {
  return events
    .filter((event) => event.tenant === tenant)
    .reduce((highest, event) => Math.max(highest, event.seq), 0);
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} is required`);
  }
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}
