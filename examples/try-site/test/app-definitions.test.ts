import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { describe, expect, it } from "vitest";

import type { BindleDefinition } from "@hobo/bindles";
import opensaas from "../apps/opensaas/app.js";
import opensaasMeta from "../apps/opensaas/meta.json" with { type: "json" };
import swaghaus from "../apps/swaghaus/app.js";
import swaghausMeta from "../apps/swaghaus/meta.json" with { type: "json" };
import todosMeta from "../apps/todo-api/meta.json" with { type: "json" };
import helloMeta from "../apps/hello-world/meta.json" with { type: "json" };

describe("try-site app definitions", () => {
	it("binds hello-world as minimal b.web() with runtime + handlers", async () => {
		const root = fileURLToPath(new URL("../apps/hello-world", import.meta.url));
		const appSource = await readFile(path.join(root, "app.ts"), "utf8");
		const handlers = await readFile(path.join(root, "handlers.txt"), "utf8");
		// SAFETY: assertion to `(await tsImport( path.join(root, "app.ts"), import.meta.url, )) as { default: BindleDefinition; runtime: { routes: reado` is required at this boundary.
		const { default: hello, runtime } = (await tsImport(
			path.join(root, "app.ts"),
			import.meta.url,
		)) as {
			default: BindleDefinition;
			runtime: {
				routes: readonly { method: string; path: string; action: string }[];
			};
		};
		expect(appSource).toContain("b.web()");
		expect(appSource).not.toContain("@trainable");
		expect(appSource).toContain("export const runtime");
		expect(handlers).toContain("Hello World!");
		expect(helloMeta.entry).toBe("app.ts");
		expect(hello.resources.web?.kind).toBe("web");
		expect(hello.requirements.require).toEqual(["http"]);
		expect(hello.requirements.runtimes).toEqual(["wasm"]);
		expect(runtime.routes.map(({ action }) => action)).toEqual(["health", "greet"]);
	});

	it("binds todo-api trainable Todos to b.web with kv", async () => {
		const root = fileURLToPath(new URL("../apps/todo-api", import.meta.url));
		const appSource = await readFile(path.join(root, "app.ts"), "utf8");
		// SAFETY: assertion to `(await tsImport( path.join(root, "app.ts"), import.meta.url, )) as { default: BindleDefinition }` is required at this boundary.
		const { default: todos } = (await tsImport(
			path.join(root, "app.ts"),
			import.meta.url,
		)) as { default: BindleDefinition };
		expect(appSource).toContain("@trainable");
		expect(appSource).toContain("b.web(Todos)");
		expect(appSource).not.toContain("export const runtime");
		expect(todosMeta.entry).toBe("app.ts");
		expect(todos.resources.web?.kind).toBe("web");
		expect(todos.resources.todos?.kind).toBe("kv");
		expect(todos.requirements.require).toEqual(expect.arrayContaining(["http", "kv"]));
		expect(todos.requirements.runtimes).toContain("wasm");
		const makeWeb = todos.entrypoint("web");
		expect(Object.prototype.toString.call(makeWeb)).toBe("[object Function]");
		// SAFETY: assertion to `makeWeb?.() as { list(): { items: unknown[] }; create(text: string): { text: string }; toggle(id: string): { id: string ` is required at this boundary.
		const instance = makeWeb?.() as {
			list(): { items: unknown[] };
			create(text: string): { text: string };
			toggle(id: string): { id: string };
		};
		expect(instance.list()).toEqual({ items: [] });
		expect(instance.create("ship it").text).toBe("ship it");
		expect(instance.toggle("1").id).toBe("1");
	});

	it("packages OpenSaaS as waspApp(root) + Postgres OCI (not HoBo image tags)", async () => {
		const { bindleContainerImages } = await import(
			"../apps/opensaas/bindle-containers.js"
		);
		const {
			discoverWaspEnv,
			isWaspWebAppAnnotation,
			waspRootFromAnnotations,
		} = await import("@hobo/wasp");
		expect(opensaasMeta.deployKind).toBe("local-bridge");
		expect(opensaas.requirements.require).toEqual(["container", "http"]);
		expect(opensaas.requirements.runtimes).toEqual(["oci"]);
		expect(opensaas.resources.db?.kind).toBe("container");
		expect(opensaas.resources.web?.kind).toBe("web");
		expect(opensaas.resources.server).toBeUndefined();
		expect(opensaas.resources.client).toBeUndefined();
		expect(
			opensaas.resources.web?.annotations.some(isWaspWebAppAnnotation),
		).toBe(true);
		expect(waspRootFromAnnotations(opensaas.resources.web!.annotations)).toBe(
			"examples/wasp-opensaas/app",
		);
		const images = Object.fromEntries(
			bindleContainerImages(opensaas).map((entry) => [entry.name, entry.image]),
		);
		expect(images).toEqual({ db: "postgres:16-alpine" });
		expect(JSON.stringify(images)).not.toMatch(/hobo\/opensaas-/u);
		const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
		const discovered = await discoverWaspEnv(
			repoRoot,
			"examples/wasp-opensaas/app",
		);
		expect(discovered.generalEnv).toContain("DATABASE_URL");
		expect(discovered.serverExampleKeys.length).toBeGreaterThan(5);
	});

	it("packages Swaghaus as convexApp(root) + Convex OCI container + WorkOS (no HoBo image tags)", async () => {
		const {
			convexRootFromAnnotations,
			discoverConvexEnv,
			isConvexWebAppAnnotation,
		} = await import("@hobo/convex");
		expect(swaghausMeta.deployKind).toBe("local-bridge");
		expect(swaghausMeta.ui).toBe("saas");
		expect(swaghaus.resources.backend?.kind).toBe("container");
		expect(swaghaus.resources.auth?.kind).toBe("external");
		expect(swaghaus.resources.web?.kind).toBe("web");
		expect(
			swaghaus.resources.web?.annotations.some(isConvexWebAppAnnotation),
		).toBe(true);
		expect(convexRootFromAnnotations(swaghaus.resources.web!.annotations)).toBe(
			"examples/convex-swaghaus",
		);
		expect(JSON.stringify(swaghaus)).toContain(
			"ghcr.io/get-convex/convex-backend",
		);
		expect(JSON.stringify(swaghaus)).not.toMatch(/hobo\/convex-/u);
		const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
		const discovered = await discoverConvexEnv(
			repoRoot,
			"examples/convex-swaghaus",
		);
		expect(discovered.hasConvexDir).toBe(true);
		expect(discovered.generalEnv).toEqual(
			expect.arrayContaining([
				"VITE_CONVEX_URL",
				"VITE_WORKOS_CLIENT_ID",
				"CONVEX_DEPLOY_KEY",
			]),
		);
	});
});
