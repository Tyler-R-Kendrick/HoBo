import { describe, expect, it } from "vitest";

import { bindle } from "../src/bindle.js";
import { env } from "../src/env.js";

describe("bindle()", () => {
	it("builds a graph with at least two resources and one dependsOn edge", () => {
		const definition = bindle("shop", (b) => {
			const store = b.data();
			const orders = b.queue();
			const api = b.api().dependsOn(store, orders);
			return { store, orders, api };
		});

		expect(Object.isFrozen(definition)).toBe(true);
		expect(definition.name).toBe("shop");
		expect(Object.keys(definition.resources)).toEqual([
			"store",
			"orders",
			"api",
		]);
		expect(definition.resources.store).toEqual({
			kind: "data",
			name: "store",
			stableId: "data:store",
			declaredAllow: [],
			annotations: [],
			dependsOn: [],
		});
		expect(definition.edges).toEqual([
			{ from: "api", to: "store" },
			{ from: "api", to: "orders" },
		]);
		expect(JSON.parse(JSON.stringify(definition))).toEqual({
			name: "shop",
			resources: {
				store: {
					kind: "data",
					name: "store",
					stableId: "data:store",
					declaredAllow: [],
					annotations: [],
					dependsOn: [],
				},
				orders: {
					kind: "queue",
					name: "orders",
					stableId: "queue:orders",
					declaredAllow: [],
					annotations: [],
					dependsOn: [],
				},
				api: {
					kind: "api",
					name: "api",
					stableId: "api:api",
					declaredAllow: [],
					annotations: [],
					dependsOn: ["data", "queue"],
				},
			},
			edges: [
				{ from: "api", to: "store" },
				{ from: "api", to: "orders" },
			],
		});
	});

	it("records allow narrowing and opaque provider annotations", () => {
		const definition = bindle("annotated", (b) => ({
			todos: b.kv().allow("get", "set"),
			api: b
				.api()
				.with({ provider: "aws", option: "fargate", config: { cpu: 512 } }),
		}));

		expect(definition.resources.todos.declaredAllow).toEqual(["get", "set"]);
		expect(definition.resources.api.annotations).toEqual([
			{ provider: "aws", option: "fargate", config: { cpu: 512 } },
		]);
	});

	it("env() is injectable camp config attached with .with", () => {
		const campEnv = env({ GREETING_PREFIX: "howdy", APP_TITLE: "howdy" });
		const definition = bindle("hello", (b) => {
			const api = b.api().with(campEnv);
			const web = b.web().with(campEnv).dependsOn(api);
			return { api, web };
		});

		expect(campEnv).toEqual({
			provider: "hobo",
			option: "env",
			config: { GREETING_PREFIX: "howdy", APP_TITLE: "howdy" },
		});
		expect(definition.resources.api.annotations).toEqual([campEnv]);
		expect(definition.resources.web.annotations).toEqual([campEnv]);
	});

	it("external / container / wasmComponent declare deps with required runtimes", async () => {
		const { collectRequiredRuntimes } = await import("../src/dependencies.js");
		const definition = bindle("deps-demo", (b) => {
			const legacy = b.external({
				connectionString: "Host=legacy;Db=app",
			});
			const redis = b.container({
				image: "redis:7",
				endpoints: { http: { port: 6379 } },
			});
			const plugin = b.wasmComponent({
				source: "./deps/plugin.wasm",
			});
			const api = b.api().withReference(legacy, redis, plugin);
			return { legacy, redis, plugin, api };
		});

		expect(definition.resources.legacy?.kind).toBe("external");
		expect(definition.resources.redis?.kind).toBe("container");
		expect(definition.resources.plugin?.kind).toBe("wasm-component");
		expect(definition.edges).toEqual(
			expect.arrayContaining([
				{ from: "api", to: "legacy" },
				{ from: "api", to: "redis" },
				{ from: "api", to: "plugin" },
			]),
		);
		expect(collectRequiredRuntimes(definition)).toEqual(["oci", "wasm"]);
	});

	it("rejects empty resource names", () => {
		expect(() =>
			bindle("shop", (b) => ({
				"": b.kv(),
			})),
		).toThrow(/bindle resource names must be non-empty strings/);
	});
});

describe("declared components (Plan 2 Syntax 0)", () => {
	const METADATA_SYMBOL =
		(Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");
	const COMPONENT_METADATA = Symbol.for("hobo.component.metadata");

	function declaredComponentClass(): new () => object {
		let constructed = 0;
		class Storefront {
			readonly instance: number;
			constructor() {
				constructed += 1;
				this.instance = constructed;
			}
		}
		Object.defineProperty(Storefront, METADATA_SYMBOL, {
			value: {
				[COMPONENT_METADATA]: {
					intent: "Public storefront API.",
					name: "Storefront",
					operations: ["storefront.rankFeed"],
				},
			},
		});
		return Storefront;
	}

	it("b.api accepts a @component-decorated class as its binding", () => {
		const Storefront = declaredComponentClass();
		const definition = bindle("shop", (b) => ({
			api: b.api(Storefront),
		}));

		const entry = definition.entrypoint("api");
		expect(typeof entry).toBe("function");
		// The stored handler instantiates the component (DI registration).
		const instance = entry?.() as { instance: number };
		expect(instance.instance).toBe(1);
		// The manifest stays pure data — no component leakage.
		expect(Object.keys(definition.resources.api).includes("handler")).toBe(
			false,
		);
	});

	it("b.service and b.web accept bindings too; plain thunks still work", () => {
		const Storefront = declaredComponentClass();
		const thunk = () => "handler";
		const definition = bindle("shop", (b) => ({
			svc: b.service(Storefront),
			web: b.web(thunk),
		}));
		expect(typeof definition.entrypoint("svc")).toBe("function");
		expect(definition.entrypoint("web")?.()).toBe("handler");
	});

	it("undecorated classes pass through as plain handlers (no instantiation)", () => {
		class NotAComponent {}
		const definition = bindle("shop", (b) => ({
			api: b.api(NotAComponent as unknown as () => unknown),
		}));
		// Stored verbatim: calling it without `new` is the caller's concern.
		expect(definition.entrypoint("api")).toBe(NotAComponent);
	});
});
