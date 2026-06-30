import assert from "node:assert/strict";
import test from "node:test";

import { bindle, ClosureBuilderResourceError } from "../src/closure-builder-resource-handles.ts";

test("closure-builder authoring creates anonymous handles and dependsOn relationships without starting workloads", () => {
  let started = false;
  const myApi = {
    run() {
      started = true;
      return "server";
    },
  };

  const shop = bindle("shop", (b) => {
    const cache = b.cache();
    const api = b.api(() => myApi.run()).dependsOn(cache);

    return { cache, api };
  });

  assert.equal(started, false);
  assert.equal(shop.name, "shop");
  assert.deepEqual(shop.resources.map((resource) => resource.kind), ["cache", "api"]);
  assert.deepEqual(shop.relationships, [
    {
      from: "res_0002",
      to: "res_0001",
      verb: "dependsOn",
    },
  ]);
});

test("invalid dependencies fail clearly", () => {
  const catalog = bindle("catalog", (b) => ({ queue: b.queue() }));

  assert.throws(
    () =>
      bindle("shop", (b) => {
        const api = b.api(() => undefined);
        api.dependsOn(catalog.resources[0]);
        return { api };
      }),
    (error) =>
      error instanceof ClosureBuilderResourceError &&
      error.code === "CLOSURE_BUILDER_CROSS_BINDLE_DEPENDENCY",
  );

  assert.throws(
    () =>
      bindle("shop", (b) => {
        const api = b.api(() => undefined);
        api.dependsOn({ kind: "cache" });
        return { api };
      }),
    (error) =>
      error instanceof ClosureBuilderResourceError &&
      error.code === "CLOSURE_BUILDER_INVALID_DEPENDENCY",
  );
});

test("builder resource factories reject explicit names at runtime", () => {
  assert.throws(
    () =>
      bindle("shop", (b) => {
        const cache = (b.cache as (...args: unknown[]) => unknown)("cache");
        return { cache: cache as never };
      }),
    (error) =>
      error instanceof ClosureBuilderResourceError &&
      error.code === "CLOSURE_BUILDER_NAMED_RESOURCE_ARG",
  );
});

test("provider with annotations stay inert resource annotations, not relationship verbs", () => {
  const providerAnnotation = { provider: "aws", resource: "fargate" };

  const shop = bindle("shop", (b) => {
    const cache = b.cache();
    const api = b.api(() => undefined).with(providerAnnotation).dependsOn(cache);
    return { cache, api };
  });

  assert.deepEqual(shop.resources[1].annotations, [providerAnnotation]);
  assert.deepEqual(shop.relationships.map((relationship) => relationship.verb), ["dependsOn"]);
});
