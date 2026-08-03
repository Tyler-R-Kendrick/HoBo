import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { readFile } from "node:fs/promises";

import {
	BrowserStationRequestSchema,
	BrowserStationResponseSchema,
} from "../../../_generated/browser_station_pb.js";

import {
	buildBrowserWitStationHtml,
	parseBrowserRuntimeManifest,
} from "./browser-station.js";
import {
	buildBrowserStationGuestSource,
	type BrowserStationInvokeRequest,
	type BrowserStationInvokeResponse,
} from "./guest-source.js";

const counterRuntime = {
	schemaVersion: "hobo.try-runtime/v1" as const,
	resources: {
		counter: { kind: "kv" as const, initial: { count: 0 } },
	},
	routes: [
		{
			method: "GET" as const,
			path: "/api/count",
			action: "read" as const,
			resource: "counter",
			key: "count",
		},
		{
			method: "POST" as const,
			path: "/api/count",
			action: "increment" as const,
			resource: "counter",
			key: "count",
		},
	],
};

function manifest(overrides: Record<string, unknown> = {}) {
	return parseBrowserRuntimeManifest({
		schemaVersion: "hobo.browser-wit-runtime/v1",
		entryModule: "station.js",
		componentDigest: `sha256:${"a".repeat(64)}`,
		sourceDigest: `sha256:${"d".repeat(64)}`,
		buildDigest: `sha256:${"e".repeat(64)}`,
		witWorld: "hobo:try/browser-station@0.1.0",
		toolchain: { jco: "1.24.3", componentizeJs: "0.21.0", esbuild: "0.25.0" },
		assets: ["station.js", "station.component.wasm"],
		assetDigests: {
			"station.js": `sha256:${"b".repeat(64)}`,
			"station.component.wasm": `sha256:${"a".repeat(64)}`,
		},
		...overrides,
	});
}

describe("browser WIT Environment Station", () => {
	it("derives executable guest behavior from the example runtime descriptor", async () => {
		const source = buildBrowserStationGuestSource([
			{ id: "hello-counter", runtime: counterRuntime },
		]);
		const guest = (await import(
			`data:text/javascript,${encodeURIComponent(source)}`
		)) as {
			invoke(request: BrowserStationInvokeRequest): BrowserStationInvokeResponse;
		};

		const response = guest.invoke({
						exampleId: "hello-counter",
						stationId: "station:browser:test",
						method: "POST",
						path: "/api/count",
						bodyJson: JSON.stringify({ by: 2 }),
					});
		expect({ status: response.status, body: JSON.parse(response.bodyJson) }).toEqual({
			status: 200,
			body: { count: 2 },
		});
	});

	it("executes the declared notes delete route", async () => {
		const source = buildBrowserStationGuestSource([
			{
				id: "kv-notes",
				runtime: {
					schemaVersion: "hobo.try-runtime/v1",
					resources: { notes: { kind: "kv", initial: [] } },
					routes: [
						{ method: "POST", path: "/api/notes", action: "create", resource: "notes" },
						{ method: "DELETE", path: "/api/notes/:id", action: "delete", resource: "notes" },
						{ method: "GET", path: "/api/notes", action: "list", resource: "notes" },
					],
				},
			},
		]);
		const guest = (await import(
			`data:text/javascript,${encodeURIComponent(source)}`
		)) as {
			invoke(request: BrowserStationInvokeRequest): BrowserStationInvokeResponse;
		};
		const invoke = (method: string, path: string, body?: unknown) =>
			((response) => ({ status: response.status, body: JSON.parse(response.bodyJson) }))(
				guest.invoke({
					exampleId: "kv-notes",
					stationId: "station:browser:test",
					method,
					path,
					bodyJson: JSON.stringify(body ?? {}),
				}),
			);

		const created = invoke("POST", "/api/notes", { id: "spoofed", text: "ship it" });
		expect(created).toEqual({ status: 201, body: { id: "1", text: "ship it" } });
		expect(invoke("DELETE", "/api/notes/:id", { id: "1" })).toEqual({
			status: 200,
			body: { id: "1", text: "ship it" },
		});
		expect(invoke("GET", "/api/notes")).toEqual({
			status: 200,
			body: { items: [] },
		});
	});

	it("reconciles generated protobuf, CUE, and WIT request/response views", async () => {
		const request = create(BrowserStationRequestSchema, {
			exampleId: "hello-counter",
			stationId: "station:browser:test",
			method: "POST",
			path: "/api/count",
			bodyJson: JSON.stringify({ by: 1 }),
		});
		const response = create(BrowserStationResponseSchema, {
			status: 200,
			bodyJson: JSON.stringify({ count: 1 }),
		});
		const [wit, proto, cue] = await Promise.all([
			readFile(new URL("../../../../../examples/browser-runtime/wit/station.wit", import.meta.url), "utf8"),
			readFile(new URL("../../../../data-models/browser_station.proto", import.meta.url), "utf8"),
			readFile(new URL("../../../../data-models/browser_station.cue", import.meta.url), "utf8"),
		]);

		expect(request).toMatchObject({ exampleId: "hello-counter", bodyJson: '{"by":1}' });
		expect(response).toMatchObject({ status: 200, bodyJson: '{"count":1}' });
		expect(wit).toContain("export invoke: func(request: invoke-request) -> invoke-response");
		expect(proto).toContain("message BrowserStationRequest");
		expect(cue).toContain("#BrowserStationRequest");
	});

	it("instantiates the component inside the blob host and reports lifecycle only", () => {
		const runtimeManifest = manifest({
			assets: ["station.js", "station.core.wasm", "station.component.wasm"],
			assetDigests: {
				"station.js": `sha256:${"b".repeat(64)}`,
				"station.core.wasm": `sha256:${"c".repeat(64)}`,
				"station.component.wasm": `sha256:${"a".repeat(64)}`,
			},
		});
		const html = buildBrowserWitStationHtml({
			exampleId: "hello-counter",
			title: "Hello Counter",
			ui: "counter",
			stationId: "station:browser:test",
			targetLabel: "Browser WASM",
			entryModuleSource: "export const $init = Promise.resolve(); export function invoke() {}",
			wasmAssets: [{ name: "station.core.wasm", base64: "AGFzbQAAAAA=" }],
			manifest: runtimeManifest,
			runtime: counterRuntime,
		});

		expect(html).toContain("new Blob([moduleSource]");
		expect(html).toContain("URL.createObjectURL");
		expect(html).toContain("await component.$init");
		expect(html).toContain("component.invoke");
		expect(html).toContain('await call("read", undefined, true)');
		expect(html).toContain('status: "ready"');
		expect(html).not.toContain("parent.invoke");
		expect(html).not.toContain("claim token");
	});

	it("exposes the notes delete route as a user action", () => {
		const html = buildBrowserWitStationHtml({
			exampleId: "kv-notes",
			title: "KV Notes",
			ui: "notes",
			stationId: "station:browser:test",
			targetLabel: "Browser WASM",
			entryModuleSource: "export const $init = Promise.resolve(); export function invoke() {}",
			wasmAssets: [],
			manifest: manifest(),
			runtime: {
				schemaVersion: "hobo.try-runtime/v1",
				resources: { notes: { kind: "kv", initial: [] } },
				routes: [
					{ method: "POST", path: "/api/notes", action: "create", resource: "notes" },
					{ method: "DELETE", path: "/api/notes/:id", action: "delete", resource: "notes" },
					{ method: "GET", path: "/api/notes", action: "list", resource: "notes" },
				],
			},
		});

		expect(html).toContain('button("Delete first", "delete"');
	});

	it("fails closed on a synthetic or malformed runtime manifest", () => {
		expect(() =>
			manifest({ componentDigest: "synthetic" }),
		).toThrow(/provenance/);
		expect(() =>
			manifest({ assetDigests: undefined }),
		).toThrow(/assetDigests/);
		expect(() =>
			manifest({ assets: ["station.js", "station.js", "station.component.wasm"] }),
		).toThrow(/assets/);
		expect(() =>
			manifest({
				assetDigests: {
					"station.js": `sha256:${"b".repeat(64)}`,
					"station.component.wasm": `sha256:${"c".repeat(64)}`,
					extra: `sha256:${"d".repeat(64)}`,
				},
			}),
		).toThrow(/assetDigests/);
	});
});
