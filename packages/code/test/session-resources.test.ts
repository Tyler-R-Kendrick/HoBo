import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import {
	assembleSessionResources,
	formatSessionResources,
	recordDevDeployment,
	recordSessionResources,
	SESSION_RESOURCES_SCHEMA,
} from "../src/session-resources.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "hobo-code-session-resources-"));
	homes.push(home);
	return home;
}

async function loginHome(tenant = "camp-west"): Promise<string> {
	const hoboHome = tempHome();
	const login = authLogin({ hoboHome, tenant, autoInitLocal: true });
	expect(login.ok && login.status === "logged-in").toBe(true);
	return hoboHome;
}

describe("session resource inventory", () => {
	it("is empty and names the login remediation when logged out", async () => {
		const inventory = await assembleSessionResources({
			hoboHome: tempHome(),
		});
		expect(inventory.ok).toBe(false);
		expect(inventory.code).toBe("HOBO_AUTH_REQUIRED");
		expect(inventory.station).toBeUndefined();
		expect(inventory.junctions).toEqual([]);
		expect(inventory.yards).toEqual([]);
		expect(inventory.camps).toEqual([]);
		expect(inventory.bindles).toEqual([]);
		expect(inventory.endpoints).toEqual([]);
		expect(inventory.missing.map((row) => row.kind)).toEqual([
			"station",
			"junction",
			"yard",
			"camp",
			"bindle",
		]);
		const text = formatSessionResources(inventory);
		expect(text).toMatch(/auth:out/);
		expect(text).toMatch(/hobo-code auth login/);
		expect(text).not.toMatch(/127\.0\.0\.1/);
	});

	it("shows the occupied station and explicit missing topology when logged in", async () => {
		const hoboHome = await loginHome();
		const inventory = await assembleSessionResources({
			hoboHome,
			env: {
				HOBO_ENV: "preview",
				HOBO_PROJECT: "hello-world",
				HOBO_BRANCH: "main",
			},
		});
		expect(inventory.ok).toBe(true);
		expect(inventory.scope.stationId).toBe("station:local");
		expect(inventory.scope.tenant).toBe("camp-west");
		expect(inventory.scope.environment).toBe("preview");
		expect(inventory.station?.id).toBe("station:local");
		expect(inventory.station?.kind).toBe("station");
		expect(inventory.station?.environment).toBe("preview");
		expect(inventory.junctions).toEqual([]);
		expect(inventory.yards.map((row) => row.id)).toEqual(["yard:local"]);
		expect(inventory.yards[0]?.status).toBe("serving");
		expect(inventory.camps.map((row) => row.id)).toEqual(["camp:code"]);
		expect(inventory.bindles.map((row) => row.id)).toEqual(["bindle:code"]);
		expect(inventory.camps[0]?.parentId).toBe("yard:local");
		expect(inventory.bindles[0]?.parentId).toBe("camp:code");
		expect(inventory.missing.map((row) => row.kind).sort()).toEqual([
			"junction",
		]);
		for (const row of inventory.missing) {
			expect(row.reason.length).toBeGreaterThan(0);
		}
		const text = formatSessionResources(inventory);
		expect(text).toMatch(/station:local/);
		expect(text).toMatch(/yard:local/);
		expect(text).toMatch(/preview/);
		expect(text).toMatch(/no junction/i);
		expect(text).not.toMatch(/no yard/i);
		expect(inventory.capabilities.length).toBeGreaterThan(0);
		expect(inventory.capabilities.map((row) => row.kind)).toContain("web");
		expect(inventory.capabilities.map((row) => row.kind)).toContain("kv");
		expect(
			inventory.capabilities.find((row) => row.kind === "web")?.available,
		).toBe(true);
		expect(
			inventory.capabilities.find((row) => row.kind === "container")?.available,
		).toBe(false);
		expect(
			inventory.capabilities.find((row) => row.kind === "rollout"),
		).toMatchObject({
			available: true,
		});
		expect(
			inventory.capabilities.find((row) => row.kind === "secret")?.available,
		).toBe(true);
		expect(
			inventory.capabilities.find((row) => row.kind === "crypto")?.available,
		).toBe(true);
		expect(inventory.capabilities.map((row) => row.kind)).not.toContain(
			"experiment",
		);
		expect(inventory.capabilities.map((row) => row.kind)).not.toContain(
			"golden",
		);
		expect(text).toMatch(/capabilities/);
		expect(text.indexOf("station:local")).toBeLessThan(text.indexOf("capabilities"));
		expect(inventory.evals?.defaultSuite.source).toBe("trainable-exact-match");
		expect(inventory.evals?.campId).toBe("camp:code");
		expect(inventory.managed.find((row) => row.id === "evals")).toMatchObject({
			kind: "sidecar",
			ownerKind: "camp",
			ownerId: "camp:code",
		});
	});

	it("lists occupancy sidecar endpoints from the Station snapshot", async () => {
		const hoboHome = await loginHome();
		const path = join(hoboHome, "stations", "station_local", "sidecars.json");
		mkdirSync(join(hoboHome, "stations", "station_local"), { recursive: true });
		writeFileSync(
			path,
			`${JSON.stringify(
				{
					schema: "hobo.code.station-sidecars/v1",
					stationId: "station:local",
					environment: "local-dev",
					dashboardUrl: "http://127.0.0.1:8787/",
					evidenceUrl: "http://127.0.0.1:8788/",
					evidenceReportUrl: "http://127.0.0.1:8788/__hobo/evidence",
					evidenceControlsUrl:
						"http://127.0.0.1:8788/__hobo/evidence/controls/cap",
					otlpHttpUrl: "http://127.0.0.1:4318/v1/logs",
					rolloutUrl: "http://127.0.0.1:8790/",
					experimentUrl: "http://127.0.0.1:8791/",
					kmsUrl: "http://127.0.0.1:8792/",
					startedAt: "2026-08-14T12:00:00.000Z",
				},
				null,
				2,
			)}\n`,
		);
		const inventory = assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
		});
		const names = inventory.endpoints.map((row) => row.resourceName);
		expect(names).toEqual(
			expect.arrayContaining([
				"dashboard",
				"evidence",
				"controls",
				"otlp",
				"rollout",
				"experiment",
				"kms",
				"secret",
				"crypto",
			]),
		);
		const evidence = inventory.endpoints.find(
			(row) => row.resourceName === "evidence",
		);
		expect(evidence?.preferredUrl).toMatch(
			/evidence\.code\..*\.hobo\.localhost/,
		);
		expect(evidence?.preferredUrl).not.toMatch(/127\.0\.0\.1/);
		expect(evidence?.status).toBe("serving");
		expect(evidence?.freshness).toBe("live");
		const dash = inventory.endpoints.find(
			(row) => row.resourceName === "dashboard",
		);
		expect(dash?.preferredUrl).toMatch(/dashboard\.code\..*\.hobo\.localhost/);
		expect(
			inventory.managed
				.filter((row) => row.ownerId === "camp:code")
				.map((row) => row.id),
		).toEqual(
			expect.arrayContaining([
				"dashboard",
				"evidence",
				"controls",
				"otlp",
				"rollout",
				"experiment",
				"kms",
			]),
		);
		expect(
			inventory.managed.find((row) => row.id === "dashboard")?.controllable,
		).toBe(true);
	});

	it("projects Station, Yard, and Camp managed resources as individually owned children", async () => {
		const hoboHome = await loginHome();
		const project = join(hoboHome, "hello-world");
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(
			join(project, "src", "bindle.ts"),
			`export default bindle("hello-world", (b) => ({
  api: b.api(),
  web: b.web(),
  kv: b.kv(),
}));
`,
		);
		recordDevDeployment({
			hoboHome,
			scope: {
				stationId: "station:local",
				tenant: "camp-west",
				environment: "local-dev",
			},
			bindleName: "hello-world",
			projectDir: project,
			appUrl: "http://127.0.0.1:4173/",
			debugUrl: "http://127.0.0.1:4173/?__hobo_debug=1",
			controlsUrl: "http://127.0.0.1:4174/?token=opaque",
			reportUrl: "http://127.0.0.1:4174/__hobo/evidence?token=opaque",
			namedUrl: "http://web.hello-world.local.hobo.localhost:4173",
		});
		const inventory = assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			ensureLocalLogin: true,
			projectDir: project,
		});
		const byId = Object.fromEntries(
			inventory.managed.map((row) => [row.id, row]),
		);
		expect(byId["yard:local:flow"]).toMatchObject({
			kind: "flow",
			ownerKind: "yard",
			ownerId: "yard:local",
			controllable: true,
		});
		expect(byId["yard:local:named-endpoints"]).toMatchObject({
			kind: "named-endpoint",
			ownerKind: "yard",
			ownerId: "yard:local",
			controllable: true,
		});
		expect(byId["bindle:code"]).toMatchObject({
			kind: "bindle",
			ownerKind: "camp",
			ownerId: "camp:code",
			controllable: false,
		});
		expect(byId["bindle:hello-world"]).toMatchObject({
			kind: "bindle",
			ownerKind: "camp",
			ownerId: "camp:hello-world",
			controllable: true,
		});
		expect(byId.kv).toMatchObject({
			kind: "bindle-resource",
			ownerKind: "camp",
			ownerId: "camp:hello-world",
			controllable: true,
		});
		expect(byId.web).toMatchObject({
			kind: "bindle-resource",
			ownerKind: "camp",
			ownerId: "camp:hello-world",
			controllable: true,
		});
		expect(byId.dashboard).toMatchObject({
			kind: "sidecar",
			ownerKind: "camp",
			ownerId: "camp:code",
			controllable: true,
		});
		const text = formatSessionResources(inventory);
		expect(text).toMatch(/yard:local:flow/);
		expect(text).toMatch(/kv/);
		expect(text.indexOf("yard:local")).toBeLessThan(text.indexOf("camp:hello-world"));
		expect(text.indexOf("camp:hello-world")).toBeLessThan(
			text.indexOf("bindle:hello-world"),
		);
		expect(inventory.evals?.defaultSuite.source).toBe("trainable-exact-match");
		expect(inventory.evals?.campId).toBe("camp:hello-world");
		expect(byId.evals).toMatchObject({
			kind: "sidecar",
			ownerKind: "camp",
			ownerId: "camp:hello-world",
		});
	});

	it("hosts project eval tests as a same-camp sidecar, not a capability", async () => {
		const hoboHome = await loginHome();
		const project = join(hoboHome, "hello-world");
		mkdirSync(join(project, "src"), { recursive: true });
		mkdirSync(join(project, "test"), { recursive: true });
		writeFileSync(
			join(project, "package.json"),
			JSON.stringify({
				name: "hello-world",
				scripts: { "test:eval": "vitest run test/shop.eval.test.ts" },
			}),
		);
		writeFileSync(join(project, "test", "shop.eval.test.ts"), "export {};\n");
		writeFileSync(
			join(project, "src", "bindle.ts"),
			`export default bindle("hello-world", (b) => ({ web: b.web() }));\n`,
		);
		const inventory = assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			ensureLocalLogin: true,
			projectDir: project,
		});
		expect(inventory.capabilities.map((row) => row.kind)).not.toContain(
			"golden",
		);
		expect(inventory.evals).toMatchObject({
			kind: "sidecar",
			name: "evals",
			hosting: "same-camp",
			campId: "camp:hello-world",
			defaultSuite: { source: "trainable-exact-match" },
			project: {
				source: "project-test-suite",
				command: "pnpm run test:eval",
				files: ["test/shop.eval.test.ts"],
			},
		});
		expect(
			inventory.managed.find((row) => row.id === "evals"),
		).toMatchObject({
			kind: "sidecar",
			ownerKind: "camp",
			ownerId: "camp:hello-world",
			controllable: true,
		});
	});

	it("filters last-seen facts to the current environment and tenant", async () => {
		const hoboHome = await loginHome();
		recordSessionResources({
			hoboHome,
			scope: {
				stationId: "station:local",
				tenant: "camp-west",
				environment: "preview",
			},
			nodes: [
				{
					kind: "yard",
					id: "yard:preview",
					name: "preview-yard",
					environment: "preview",
					status: "last-seen",
					fidelity: "simulated",
					scopeLabel: "local",
				},
				{
					kind: "bindle",
					id: "bindle:hello",
					name: "hello",
					environment: "preview",
					parentId: "yard:preview",
					status: "last-seen",
					fidelity: "simulated",
					scopeLabel: "local",
				},
			],
			endpoints: [
				{
					resourceName: "web",
					kind: "http",
					backendUrl: "http://127.0.0.1:4173",
					namedUrl: "http://web.hello.preview.hobo.localhost:4173",
					hostname: "web.hello.preview.hobo.localhost",
					mode: "local",
					preferredUrl: "http://127.0.0.1:4173",
					fidelity: "simulated",
				},
			],
			recordedAt: "2026-08-13T12:00:00.000Z",
		});
		recordSessionResources({
			hoboHome,
			scope: {
				stationId: "station:local",
				tenant: "camp-west",
				environment: "prod",
			},
			nodes: [
				{
					kind: "yard",
					id: "yard:prod",
					name: "prod-yard",
					environment: "prod",
					status: "last-seen",
					fidelity: "real",
					scopeLabel: "camp-deferred",
				},
			],
			endpoints: [
				{
					resourceName: "web",
					kind: "http",
					backendUrl: "https://shop.example.com",
					namedUrl: "https://web.hello.hobo.test",
					hostname: "web.hello.hobo.test",
					mode: "overlay",
					preferredUrl: "https://shop.example.com",
					fidelity: "real",
				},
			],
			recordedAt: "2026-08-13T12:00:00.000Z",
		});

		const preview = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "preview" },
		});
		expect(preview.yards.map((row) => row.id)).toEqual(["yard:preview"]);
		expect(preview.bindles.map((row) => row.id)).toEqual(["bindle:hello"]);
		expect(preview.endpoints.map((row) => row.backendUrl)).toEqual([
			"http://127.0.0.1:4173",
		]);
		expect(preview.endpoints[0]?.freshness).toBe(
			"last-seen:2026-08-13T12:00:00.000Z",
		);
		expect(preview.endpoints[0]?.resolvedAddresses).toContain("127.0.0.1");

		const prod = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "prod" },
		});
		expect(prod.yards.map((row) => row.id)).toEqual(["yard:prod"]);
		expect(prod.bindles).toEqual([]);
		expect(prod.endpoints.some((row) => row.backendUrl.includes("4173"))).toBe(
			false,
		);
	});

	it("refuses a federated station without a grant", async () => {
		const hoboHome = await loginHome();
		const inventory = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "preview" },
			topology: [
				{
					kind: "station",
					id: "station:peer",
					name: "peer",
					environment: "preview",
					status: "declared",
					fidelity: "real",
					scopeLabel: "camp-deferred",
				},
				{
					kind: "junction",
					id: "junction:mesh",
					name: "mesh",
					environment: "preview",
					status: "declared",
					fidelity: "real",
					scopeLabel: "hybrid",
				},
			],
		});
		expect(inventory.station?.id).toBe("station:local");
		expect(inventory.junctions.map((row) => row.id)).toEqual(["junction:mesh"]);
		expect(inventory.ok).toBe(true);
		const leaked = [
			inventory.station,
			...inventory.junctions,
			...inventory.yards,
			...inventory.camps,
			...inventory.bindles,
		].some((row) => row?.id === "station:peer");
		expect(leaked).toBe(false);
	});

	it("keeps a granted federated station in the inventory", async () => {
		const hoboHome = await loginHome();
		const inventory = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "preview" },
			grantedStationIds: ["station:peer"],
			topology: [
				{
					kind: "station",
					id: "station:peer",
					name: "peer",
					environment: "preview",
					status: "declared",
					fidelity: "real",
					scopeLabel: "hybrid",
				},
			],
		});
		expect(
			[inventory.station, ...inventory.junctions].some(
				(row) => row?.id === "station:peer",
			),
		).toBe(false);
		expect(inventory.peers.map((row) => row.id)).toEqual(["station:peer"]);
	});

	it("resolves loopback and *.hobo.localhost without inventing remote hosts", async () => {
		const hoboHome = await loginHome();
		const inventory = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			liveEndpoints: [
				{
					resourceName: "web",
					kind: "http",
					backendUrl: "http://127.0.0.1:4173",
					namedUrl: "http://web.hello.local-dev.hobo.localhost:4173",
					hostname: "web.hello.local-dev.hobo.localhost",
					mode: "local",
					preferredUrl: "http://127.0.0.1:4173",
					fidelity: "simulated",
				},
			],
			topology: [
				{
					kind: "yard",
					id: "yard:local",
					name: "local",
					environment: "local-dev",
					status: "serving",
					fidelity: "simulated",
					scopeLabel: "local",
				},
				{
					kind: "camp",
					id: "camp:local",
					name: "local",
					environment: "local-dev",
					parentId: "yard:local",
					status: "serving",
					fidelity: "simulated",
					scopeLabel: "local",
				},
				{
					kind: "bindle",
					id: "bindle:hello",
					name: "hello",
					environment: "local-dev",
					parentId: "camp:local",
					status: "serving",
					fidelity: "simulated",
					scopeLabel: "local",
				},
			],
		});
		expect(inventory.missing.map((row) => row.kind)).toEqual(["junction"]);
		expect(inventory.endpoints).toHaveLength(1);
		const web = inventory.endpoints[0];
		expect(web).toBeDefined();
		if (!web) throw new Error("missing web endpoint");
		expect(web.freshness).toBe("live");
		expect(web.preferredUrl).toBe(
			"http://web.hello.local-dev.hobo.localhost:4173",
		);
		expect(web.resolvedAddresses).toContain("127.0.0.1");
		expect(web.namedUrl).toContain(".hobo.localhost");
		expect(web.namedUrl).not.toMatch(/\.hobo$/);
		expect(web.unresolvedReason).toBeUndefined();
		const text = formatSessionResources(inventory);
		expect(text).toMatch(/bindle:hello/);
		expect(text).toContain("web.hello.local-dev.hobo.localhost");
		expect(text).not.toMatch(/127\.0\.0\.1/);
	});

	it("fails closed on a local-mode remote backend", async () => {
		const hoboHome = await loginHome();
		const inventory = await assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			liveEndpoints: [
				{
					resourceName: "web",
					kind: "http",
					backendUrl: "https://orders.amazonaws.com",
					namedUrl: "https://web.hello.local-dev.hobo.localhost",
					hostname: "web.hello.local-dev.hobo.localhost",
					mode: "local",
					preferredUrl: "https://orders.amazonaws.com",
					fidelity: "real",
				},
			],
		});
		expect(inventory.endpoints).toHaveLength(1);
		const web = inventory.endpoints[0];
		expect(web).toBeDefined();
		if (!web) throw new Error("missing web endpoint");
		expect(web.status).toBe("unresolved");
		expect(web.fidelity).toBe("unresolved");
		expect(web.unresolvedReason).toMatch(/air-gap|remote/i);
		expect(web.preferredUrl).not.toContain("amazonaws.com");
	});

	it("does not persist connection strings or secret-looking values", () => {
		const hoboHome = tempHome();
		expect(() =>
			recordSessionResources({
				hoboHome,
				scope: {
					stationId: "station:local",
					tenant: "camp-west",
					environment: "preview",
				},
				nodes: [],
				endpoints: [
					{
						resourceName: "db",
						kind: "postgres",
						backendUrl: "postgres://user:hunter2@127.0.0.1/app",
						mode: "local",
						preferredUrl: "postgres://user:hunter2@127.0.0.1/app",
						fidelity: "simulated",
					},
				],
			}),
		).toThrow(/secret|credential|password/i);
		expect(SESSION_RESOURCES_SCHEMA).toBe("hobo.code.session-resources/v1");
	});

	it("records loopback evidence URLs that carry a token= capability query", () => {
		const hoboHome = tempHome();
		const controls = "http://127.0.0.1:4174/?token=opaque-capability";
		const report =
			"http://127.0.0.1:4174/__hobo/evidence?token=opaque-capability";
		expect(() =>
			recordDevDeployment({
				hoboHome,
				scope: {
					stationId: "station:local",
					tenant: "camp-west",
					environment: "local-dev",
				},
				bindleName: "hello-world",
				appUrl: "http://127.0.0.1:4173/",
				debugUrl: "http://127.0.0.1:4173/?__hobo_debug=1",
				controlsUrl: controls,
				reportUrl: report,
			}),
		).not.toThrow();
		const inventory = assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			ensureLocalLogin: true,
		});
		const urls = inventory.endpoints.map((row) => row.backendUrl);
		expect(urls.some((url) => url.includes("127.0.0.1:4174"))).toBe(true);
		expect(urls.some((url) => url.includes("__hobo/evidence"))).toBe(true);
		expect(urls.some((url) => url.includes("4173"))).toBe(true);
	});

	it("fulfills a deployed hello-world bindle with camp, bindle, and declared resources", async () => {
		const hoboHome = await loginHome();
		const project = join(hoboHome, "hello-world");
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(
			join(project, "src", "bindle.ts"),
			`export default bindle("hello-world", (b) => {
  const a = b.api();
  const w = b.web().dependsOn(a);
  return { api: a, web: w };
});
`,
		);
		recordDevDeployment({
			hoboHome,
			scope: {
				stationId: "station:local",
				tenant: "camp-west",
				environment: "local-dev",
			},
			bindleName: "hello-world",
			projectDir: project,
			appUrl: "http://127.0.0.1:4173/",
			debugUrl: "http://127.0.0.1:4173/?__hobo_debug=1",
			controlsUrl: "http://127.0.0.1:4174/?token=opaque",
			reportUrl: "http://127.0.0.1:4174/__hobo/evidence?token=opaque",
			namedUrl: "http://web.hello-world.local.hobo.localhost:4173",
		});
		const inventory = assembleSessionResources({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			ensureLocalLogin: true,
		});
		expect(inventory.missing.map((row) => row.kind)).toEqual(["junction"]);
		expect(inventory.yards.map((row) => row.id)).toEqual(["yard:local"]);
		expect(inventory.camps.map((row) => row.id).sort()).toEqual([
			"camp:code",
			"camp:hello-world",
		]);
		expect(inventory.bindles.map((row) => row.id).sort()).toEqual([
			"bindle:code",
			"bindle:hello-world",
		]);
		expect(
			inventory.bindles.find((row) => row.id === "bindle:hello-world")
				?.parentId,
		).toBe("camp:hello-world");
		const names = inventory.endpoints.map((row) => row.resourceName);
		expect(names).toEqual(
			expect.arrayContaining(["web", "api", "debug", "controls", "report"]),
		);
		expect(
			inventory.endpoints.find((row) => row.resourceName === "api")
				?.preferredUrl,
		).toMatch(/api\.hello-world\..*\.hobo\.localhost/);
		expect(inventory.camp?.require).toContain("managed-http-runtime");
		expect(inventory.bindleManifest?.resources.map((row) => row.kind)).toEqual(
			expect.arrayContaining(["api", "web"]),
		);
		const text = formatSessionResources(inventory);
		expect(text).not.toMatch(/no yard/i);
		expect(text).toMatch(/api\.hello-world/);
	});
});
