const MANIFEST_SCHEMA = "hobo.manifest/v1";
const DEFAULT_COMPONENT_HOST = Object.freeze({
  kind: "wasmtime",
  version: "46.0.1",
});
const RESOURCE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

const PORT_BY_KIND = Object.freeze({
  api: "wasi:http",
  bucket: "wasi:blobstore",
  kv: "wasi:keyvalue",
  queue: "hobo:queue",
  schedule: "hobo:scheduler",
  topic: "wasi:messaging",
});

const CLIENT_TYPE_BY_KIND = Object.freeze({
  bucket: "BucketClient",
  kv: "KvClient",
  queue: "QueueClient",
  schedule: "ScheduleClient",
  topic: "TopicClient",
});

export class TriggerContractError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "TriggerContractError";
    this.path = path;
  }
}

export function api(name, options = {}) {
  const handle = createHandle("api", name, options);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    handle[method.toLowerCase()] = (path, handler) =>
      registerHttpRoute(handle, method, path, handler);
  }
  return Object.freeze(handle);
}

export function kv(name) {
  return createHandle("kv", name);
}

export function queue(name) {
  return createHandle("queue", name);
}

export function topic(name, options = {}) {
  const handle = createHandle("topic", name, options);
  handle.subscribe = (eventType, handler) => {
    const normalized =
      typeof eventType === "function" || isWorkflowHandler(eventType)
        ? { eventType: "*", handler: eventType }
        : { eventType: assertString(eventType, `resources.${name}.triggers.subscribe.event`), handler };
    return registerHostTrigger(handle, {
      id: `${name}.subscribe.${normalized.eventType}`,
      kind: "topic.subscribe",
      event: normalized.eventType,
      exportInterface: "hobo:trigger/topic-subscriber",
      handler: normalized.handler,
      inferredPermissions: ["subscribe"],
    });
  };
  return Object.freeze(handle);
}

export function schedule(name, options = {}) {
  const handle = createHandle("schedule", name, options);
  handle.cron = (expression, handler) =>
    registerHostTrigger(handle, {
      id: `${name}.cron.${assertString(expression, `resources.${name}.triggers.cron.expression`)}`,
      kind: "schedule.cron",
      cron: expression,
      exportInterface: "hobo:trigger/scheduled-run",
      handler,
      inferredPermissions: [],
    });
  return Object.freeze(handle);
}

export function bucket(name, options = {}) {
  const handle = createHandle("bucket", name, options);
  handle.on = (event, handler) => {
    const eventName = assertString(event, `resources.${name}.triggers.event`);
    const inferredPermissions = eventName === "write" ? ["event:write", "read"] : [`event:${eventName}`];
    return registerHostTrigger(handle, {
      id: `${name}.${eventName}`,
      kind: "bucket.on",
      event: eventName,
      exportInterface: "hobo:trigger/blob-event",
      handler,
      inferredPermissions,
    });
  };
  return Object.freeze(handle);
}

export function workflow(name, handler) {
  const handlerName = assertString(name, "workflow.name");
  if (typeof handler !== "function") {
    throw new TriggerContractError("workflow.handler", "must be a function");
  }
  return Object.freeze({
    kind: "workflow",
    name: handlerName,
    handler,
  });
}

export function compileHandlerManifest(resources, options = {}) {
  if (!Array.isArray(resources)) {
    throw new TriggerContractError("resources", "must be an array");
  }

  const resourceMap = new Map();
  for (const resource of resources) {
    assertHandle(resource, "resources");
    if (resourceMap.has(resource.name)) {
      throw new TriggerContractError(`resources.${resource.name}`, "duplicate resource id");
    }
    resourceMap.set(resource.name, resource);
  }

  const triggerEdges = collectTriggerEdges(resources, options.triggers ?? [], resourceMap);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    componentHost: options.componentHost ?? DEFAULT_COMPONENT_HOST,
    resources: Object.fromEntries(
      resources.map((resource) => [resource.name, manifestResource(resource)]),
    ),
    triggerEdges,
  };

  if (triggerEdges.length === 0) {
    delete manifest.triggerEdges;
  }

  return manifest;
}

function createHandle(kind, name, options = {}) {
  assertResourceName(name, `${kind}.name`);
  const bind = normalizeBindMap(options.bind ?? {}, `${kind}.${name}.bind`);
  const handle = {
    __hoboTriggerContract: true,
    kind,
    name,
    stableId: `${kind}:${name}`,
    port: PORT_BY_KIND[kind],
    durableEvents: options.durableEvents ?? true,
    bindings: Object.fromEntries(
      Object.entries(bind).map(([alias, target]) => [
        alias,
        {
          port: target.port,
          resource: target.name,
          clientType: target.clientType,
        },
      ]),
    ),
    triggers: [],
    permissions: new Set(),
    routeKeys: new Set(),
    clientType: CLIENT_TYPE_BY_KIND[kind],
  };
  return handle;
}

function registerHttpRoute(handle, method, path, handler) {
  const routePath = assertString(path, `resources.${handle.name}.routes.path`);
  assertHandler(handler, `resources.${handle.name}.routes.${method} ${routePath}`);
  const key = `${method} ${routePath}`;
  if (handle.routeKeys.has(key)) {
    throw new TriggerContractError(`resources.${handle.name}.routes[${key}]`, "duplicate route");
  }

  handle.routeKeys.add(key);
  const trigger = omitUndefined({
    id: `${handle.name}.${method}.${routePath}`,
    kind: "http.route",
    resource: handle.name,
    method,
    path: routePath,
    exportInterface: "wasi:http/incoming-handler",
    handler: handlerName(handler),
  });
  handle.triggers.push(trigger);
  return trigger;
}

function registerHostTrigger(handle, trigger) {
  assertHandler(trigger.handler, `resources.${handle.name}.triggers.${trigger.event ?? trigger.kind}`);
  if (isWorkflowHandler(trigger.handler) && handle.durableEvents !== true) {
    throw new TriggerContractError(
      `resources.${handle.name}.triggers.${trigger.event ?? trigger.kind}`,
      "workflow subscriber requires a durable event path",
    );
  }

  for (const permission of trigger.inferredPermissions) {
    handle.permissions.add(permission);
  }

  const edge = omitUndefined({
    id: trigger.id,
    kind: trigger.kind,
    resource: handle.name,
    event: trigger.event,
    cron: trigger.cron,
    exportInterface: trigger.exportInterface,
    handler: handlerName(trigger.handler),
    inferredPermissions: trigger.inferredPermissions.length > 0 ? trigger.inferredPermissions : undefined,
    durableRuntime: durableRuntimeFor(trigger.handler),
  });
  handle.triggers.push(edge);
  return edge;
}

function collectTriggerEdges(resources, extraTriggers, resourceMap) {
  const triggerEdges = [];
  for (const resource of resources) {
    triggerEdges.push(...resource.triggers);
  }
  triggerEdges.push(...extraTriggers);

  return triggerEdges.map((trigger, index) => {
    if (!resourceMap.has(trigger.resource)) {
      throw new TriggerContractError(
        `triggers[${index}].resource`,
        `${trigger.resource} is not declared in this Bindle`,
      );
    }
    return trigger;
  });
}

function manifestResource(handle) {
  if (handle.kind === "api") {
    return omitEmpty({
      type: "component.v1",
      kind: handle.kind,
      runtime: "wasm",
      exports: handle.triggers.some((trigger) => trigger.kind === "http.route")
        ? ["wasi:http/incoming-handler"]
        : [],
      bindings: handle.bindings,
      links: Object.values(handle.bindings).map((binding) => ({
        import: binding.port,
        to: binding.resource,
      })),
      collection: {
        stableId: handle.stableId,
      },
    });
  }

  return {
    type: "data.v1",
    kind: handle.kind,
    port: handle.port,
    allow: [...handle.permissions].sort(),
    usage: {
      inferred: [...handle.permissions].sort(),
      source: "handler-trigger-contract",
    },
    collection: {
      stableId: handle.stableId,
    },
  };
}

function normalizeBindMap(bind, path) {
  if (!bind || typeof bind !== "object" || Array.isArray(bind)) {
    throw new TriggerContractError(path, "must be a resource map");
  }

  for (const [alias, target] of Object.entries(bind)) {
    assertResourceName(alias, `${path}.${alias}`);
    assertHandle(target, `${path}.${alias}`);
  }
  return bind;
}

function assertHandle(handle, path) {
  if (!handle?.__hoboTriggerContract || typeof handle.name !== "string") {
    throw new TriggerContractError(path, "must contain HoBo handler-trigger resource handles");
  }
}

function assertResourceName(name, path) {
  if (typeof name !== "string" || !RESOURCE_ID.test(name)) {
    throw new TriggerContractError(path, "invalid resource id");
  }
}

function assertString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TriggerContractError(path, "must be a non-empty string");
  }
  return value;
}

function assertHandler(handler, path) {
  if (typeof handler !== "function" && !isWorkflowHandler(handler)) {
    throw new TriggerContractError(path, "handler must be a function or workflow handler");
  }
}

function isWorkflowHandler(handler) {
  return handler?.kind === "workflow";
}

function handlerName(handler) {
  if (isWorkflowHandler(handler)) {
    return handler.name;
  }
  return handler.name || "anonymous";
}

function durableRuntimeFor(handler) {
  if (!isWorkflowHandler(handler)) {
    return undefined;
  }
  return {
    primitive: "workflow",
    interface: "hobo:runtime/workflow@0.1.0",
    handler: handler.name,
  };
}

function omitEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) {
        return entry.length > 0;
      }
      if (entry && typeof entry === "object") {
        return Object.keys(entry).length > 0;
      }
      return entry !== undefined;
    }),
  );
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
