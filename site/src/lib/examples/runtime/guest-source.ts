import type {
	BrowserStationRequest,
	BrowserStationResponse,
} from "../../../_generated/browser_station_pb.js";
import type { ExampleRuntimeDescriptor } from "../catalog-contract.js";

export type BrowserRuntimeDescriptor = ExampleRuntimeDescriptor;
export type BrowserStationInvokeRequest = Pick<
	BrowserStationRequest,
	"exampleId" | "stationId" | "method" | "path" | "bodyJson"
>;
export type BrowserStationInvokeResponse = Pick<
	BrowserStationResponse,
	"status" | "bodyJson"
>;

export interface BrowserRuntimeExample {
	readonly id: string;
	readonly runtime: BrowserRuntimeDescriptor;
}

/**
 * Produce the JavaScript guest compiled by componentize-js. Runtime descriptors
 * are the executable example contract; the site UI does not reimplement them.
 */
export function buildBrowserStationGuestSource(
	examples: readonly BrowserRuntimeExample[],
): string {
	const descriptors = Object.fromEntries(
		examples.map(({ id, runtime }) => [id, runtime]),
	);
	return `
const descriptors = ${safeJson(descriptors)};
const states = Object.create(null);
let sequence = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateFor(exampleId, descriptor) {
  if (states[exampleId]) return states[exampleId];
  const state = Object.create(null);
  for (const [name, resource] of Object.entries(descriptor.resources)) {
    state[name] = clone(resource.initial);
  }
  states[exampleId] = state;
  return state;
}

function response(status, body) {
  return { status, bodyJson: JSON.stringify(body) };
}

export function invoke(request) {
  let body;
  try {
    body = JSON.parse(request.bodyJson);
  } catch {
    return response(400, { error: "invalid JSON body" });
  }
  const descriptor = descriptors[request.exampleId];
  if (!descriptor) return response(404, { error: "unknown example" });
  const route = descriptor.routes.find(
    (candidate) => candidate.method === request.method && candidate.path === request.path,
  );
  if (!route) return response(404, { error: "route not found" });
  const state = stateFor(request.exampleId, descriptor);
  const value = route.resource ? state[route.resource] : undefined;
  if (route.resource && value === undefined) {
    return response(500, { error: "declared resource not found" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  switch (route.action) {
    case "health":
      return response(200, { ok: true, station: request.stationId || null });
    case "read":
      return response(200, route.key ? { [route.key]: value[route.key] } : clone(value));
    case "list":
      return response(200, { items: clone(value) });
    case "increment": {
      const key = route.key || "count";
      const by = Number.isFinite(Number(body.by)) ? Number(body.by) : 1;
      value[key] = Number(value[key] || 0) + by;
      return response(200, { [key]: value[key] });
    }
    case "reset": {
      const key = route.key || "count";
      value[key] = 0;
      return response(200, { [key]: 0 });
    }
    case "create": {
      const item = { ...body, id: String(++sequence) };
      value.push(item);
      return response(201, clone(item));
    }
    case "delete": {
      const index = value.findIndex((candidate) => String(candidate.id) === String(body.id));
      if (index === -1) return response(404, { error: "item not found" });
      const [item] = value.splice(index, 1);
      return response(200, clone(item));
    }
    case "toggle": {
      const item = value.find((candidate) => String(candidate.id) === String(body.id));
      if (!item) return response(404, { error: "item not found" });
      item.completed = !item.completed;
      return response(200, clone(item));
    }
    case "enqueue": {
      const item = { id: String(++sequence), message: String(body.message || body.text || "") };
      value.push(item);
      return response(202, clone(item));
    }
    case "drain":
      return response(200, { item: value.shift() || null, remaining: value.length });
    default:
      return response(500, { error: "unsupported runtime action" });
  }
}
`.trimStart();
}

function safeJson(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
