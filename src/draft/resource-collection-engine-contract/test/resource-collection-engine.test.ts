import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CollectionEngineError,
  collectBindleResources,
} from "../src/resource-collection-engine.js";

const todosSource = `
  import { api, kv } from "@hobo/bindles";

  export default function define(includeCache = false) {
    const todos = kv("todos");
    todos.get("todo-1");
    todos.set("todo-1", { title: "ship" });

    const http = api("api", { bind: { todos } });
    http.route("GET", "/todos", () => todos.get("todo-1"));

    if (includeCache) {
      kv("cache");
    }
  }
`;

function defineTodos(collect) {
  const todos = collect.kv("todos");
  todos.get("todo-1");
  todos.set("todo-1", { title: "ship" });

  const api = collect.api("api", { bind: { todos } });
  api.route("GET", "/todos", () => todos.get("todo-1"));
}

function collectTodos(overrides = {}) {
  return collectBindleResources({
    bindleId: "todos",
    fileName: "todos.ts",
    sourceText: todosSource,
    define: defineTodos,
    ...overrides,
  });
}

describe("resource-collection engine contract", () => {
  it("collects an IfC Bindle into hobo.manifest/v1 resources, links, and inferred used verbs", () => {
    const result = collectTodos();

    assert.equal(result.manifest.schema, "hobo.manifest/v1");
    assert.deepEqual(result.manifest.componentHost, {
      kind: "wasmtime",
      version: "46.0.1",
    });
    assert.deepEqual(result.manifest.resources.todos, {
      type: "data.v1",
      port: "wasi:keyvalue",
      kind: "kv",
      allow: ["get", "set"],
      usage: {
        inferred: ["get", "set"],
        source: "run-to-collect",
      },
      collection: {
        stableId: "kv:todos",
      },
    });
    assert.deepEqual(result.manifest.resources.api, {
      type: "component.v1",
      kind: "api",
      runtime: "wasm",
      exports: ["wasi:http/incoming-handler"],
      links: [{ import: "wasi:keyvalue", to: "todos" }],
      routes: [{ method: "GET", path: "/todos" }],
      bindings: {
        todos: {
          port: "wasi:keyvalue",
          resource: "todos",
          clientType: "KvClient",
        },
      },
      collection: {
        stableId: "api:api",
      },
    });
    assert.deepEqual(result.coverage.observedResourceIds, ["todos", "api"]);
    assert.deepEqual(result.coverage.observedBindKeys, ["api->todos"]);
  });

  it("emits bindle.ResourcesCollected and bindle.ManifestProduced facts with the manifest payload", () => {
    const result = collectTodos();

    assert.deepEqual(
      result.events.map((event) => event.type),
      ["bindle.ResourcesCollected", "bindle.ManifestProduced"],
    );
    assert.deepEqual(result.events[0].data.resources, ["todos", "api"]);
    assert.deepEqual(result.events[0].data.binds, ["api->todos"]);
    assert.equal(result.events[1].data.manifestHash, result.manifestHash);
    assert.deepEqual(result.events[1].data.manifest, result.manifest);
  });

  it("content-addresses the manifest deterministically across equivalent collection runs", () => {
    const first = collectTodos();
    const second = collectTodos();

    assert.equal(first.manifestHash, second.manifestHash);
    assert.deepEqual(first.events, second.events);
  });

  it("marks statically declared but unobserved branch resources as coverage gaps", () => {
    const result = collectTodos();

    assert.equal(result.coverage.ok, false);
    assert.equal(result.coverage.status, "fail");
    assert.deepEqual(
      result.coverage.unobservedDeclarations.map((declaration) => declaration.resourceId),
      ["cache"],
    );
    assert.match(
      result.coverage.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
      /cache/,
    );
  });

  it("ignores collection-time network and clock side effects so manifest hashing stays stable", () => {
    function defineWithSideEffects(collect) {
      collect.effects.clock.now();
      collect.effects.network.fetch("https://example.invalid/metadata");
      const todos = collect.kv("todos");
      todos.get("todo-1");
      const api = collect.api("api", { bind: { todos } });
      api.route("GET", "/todos", () => todos.get("todo-1"));
    }

    const sourceText = `
      import { api, kv } from "@hobo/bindles";
      const todos = kv("todos");
      todos.get("todo-1");
      api("api", { bind: { todos } });
    `;
    const first = collectTodos({ define: defineWithSideEffects, sourceText });
    const second = collectTodos({ define: defineWithSideEffects, sourceText });

    assert.equal(first.manifestHash, second.manifestHash);
    assert.deepEqual(first.sideEffects, [
      {
        kind: "clock.now",
        disposition: "ignored",
      },
      {
        kind: "network.fetch",
        target: "https://example.invalid/metadata",
        disposition: "ignored",
      },
    ]);
  });

  it("fails duplicate resource declarations instead of silently merging them", () => {
    assert.throws(
      () =>
        collectBindleResources({
          bindleId: "dupe",
          define(collect) {
            collect.kv("todos");
            collect.kv("todos");
          },
        }),
      (error) => {
        assert.ok(error instanceof CollectionEngineError);
        assert.match(error.message, /resources\.todos: duplicate resource id/);
        return true;
      },
    );
  });
});
