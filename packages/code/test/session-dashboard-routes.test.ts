/**
 * The dashboard's own HTTP surface: its routes, and its sidecars.
 *
 * `session-dashboard.test.ts` drives the inventory and lifecycle flows — what
 * the dashboard says about the resources it manages. This covers the two parts
 * that sit either side of that: the request router itself, and the sidecar
 * control the dashboard exposes *over its own listeners*.
 *
 * The second is the interesting one. The dashboard is not only a viewer of
 * resources; it is a resource, and so is the OTLP collector beside it. Stopping
 * `otlp` through the dashboard's own API has to close two listeners — the HTTP
 * ingest and the gRPC port — and starting it has to bring both back on the
 * ports it was already bound to. Getting that wrong leaves a half-running
 * collector that accepts traces and drops logs, which reads as a telemetry gap
 * rather than as a stopped sidecar.
 *
 * The router's rules:
 *
 * **A telemetry route returns only the kind it was asked for.** `/logs`,
 * `/traces` and `/metrics` share one handler and one sink, and each answers
 * with empty arrays for the other two. A route that returned everything would
 * make the three paths indistinguishable and quietly triple every payload.
 *
 * **Ingest accepts an empty body.** A collector that 500s on a keepalive POST
 * makes the exporter retry it forever.
 *
 * **Anything unrouted is a 404 with a JSON body**, not an HTML error page —
 * every other route on this server answers JSON, and a client that parses the
 * success path should be able to parse the failure.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import { startLocalDashboard } from "../src/session-dashboard.js";

const homes: string[] = [];
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
	for (const stop of stops.splice(0)) await stop().catch(() => undefined);
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

/** A logged-in station with a dashboard listening on an ephemeral port. */
async function dashboard() {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-dash-routes-"));
	homes.push(hoboHome);
	authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
	const dash = await startLocalDashboard({
		hoboHome,
		env: { HOBO_ENV: "local-dev" },
		projectRoot: hoboHome,
		port: 0,
		otlpHttpPort: 0,
		otlpGrpcPort: 0,
	});
	stops.push(() => dash.close());
	return dash;
}

type Dash = Awaited<ReturnType<typeof dashboard>>;

/**
 * Addressed by the bound port rather than the reported `url`. The dashboard
 * runs its URL through `preferNamedEndpoint`, which may hand back a named
 * address that does not resolve from the test process -- the port is what it
 * actually listened on.
 */
const base = (dash: Dash) => `http://127.0.0.1:${dash.port}`;

const get = (dash: Dash, path: string) => fetch(`${base(dash)}${path}`);

const post = (dash: Dash, path: string, body = "") =>
	fetch(`${base(dash)}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
	});

describe("the routes it serves", () => {
	it("serves the app shell at the root", async () => {
		const dash = await dashboard();
		const res = await get(dash, "/");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	it("answers the inventory as json", async () => {
		const dash = await dashboard();
		const res = await get(dash, "/api/resources");
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty("scope");
	});

	it("carries the lifecycle list alongside the inventory", async () => {
		// One request, both halves. A client that had to make two would render
		// resources and their states from different instants.
		const dash = await dashboard();
		expect(await (await get(dash, "/api/resources")).json()).toHaveProperty(
			"lifecycle",
		);
	});

	it("answers telemetry", async () => {
		const dash = await dashboard();
		expect((await get(dash, "/api/telemetry")).status).toBe(200);
	});

	it("answers the fleet view", async () => {
		const dash = await dashboard();
		expect((await get(dash, "/api/fleet")).status).toBe(200);
	});

	it("404s an unknown path", async () => {
		const dash = await dashboard();
		expect((await get(dash, "/nope")).status).toBe(404);
	});

	it("404s in json rather than html", async () => {
		// Every other route answers JSON; a client that parses the success path
		// should be able to parse the failure.
		const dash = await dashboard();
		expect(await (await get(dash, "/nope")).json()).toHaveProperty("error");
	});

	it("404s a POST to a GET-only route", async () => {
		// The method is part of the route, so a POST to the inventory is not a
		// 405 with a hint -- it simply does not match anything.
		const dash = await dashboard();
		expect((await post(dash, "/api/resources")).status).toBe(404);
	});

	it("404s a GET on an action route", async () => {
		const dash = await dashboard();
		expect((await get(dash, "/api/resources/dashboard/stop")).status).toBe(404);
	});
});

describe("per-resource telemetry", () => {
	it.each(["logs", "traces", "metrics"])("answers %s", async (kind) => {
		const dash = await dashboard();
		const res = await get(dash, `/api/resources/dashboard/${kind}`);
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveProperty(kind);
	});

	it("names the resource it answered for", async () => {
		const dash = await dashboard();
		const body = (await (
			await get(dash, "/api/resources/dashboard/logs")
		).json()) as { resourceName?: string };
		expect(body.resourceName).toBe("dashboard");
	});

	it("returns only the kind that was asked for", async () => {
		// Three paths, one handler, one sink. A route that returned everything
		// would make the paths indistinguishable and triple every payload.
		const dash = await dashboard();
		const body = (await (
			await get(dash, "/api/resources/dashboard/logs")
		).json()) as { traces?: unknown[]; metrics?: unknown[] };
		expect(body.traces).toEqual([]);
		expect(body.metrics).toEqual([]);
	});

	it("decodes a resource id that needed escaping", async () => {
		// Ids carry colons -- `camp:code` and friends -- so the path segment is
		// percent-encoded and has to come back as the id the sink knows.
		const dash = await dashboard();
		const body = (await (
			await get(dash, `/api/resources/${encodeURIComponent("camp:code")}/logs`)
		).json()) as { resourceName?: string };
		expect(body.resourceName).toBe("camp:code");
	});

	it("answers for a resource with no telemetry rather than 404ing", async () => {
		// The dashboard lists resources before any of them has emitted; an empty
		// pane is the right answer, not a missing one.
		const dash = await dashboard();
		const res = await get(dash, "/api/resources/never-seen/logs");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ logs: [] });
	});

	it("refuses a telemetry kind it does not serve", async () => {
		expect(
			(await get(await dashboard(), "/api/resources/dashboard/profiles"))
				.status,
		).toBe(404);
	});
});

describe("OTLP ingest", () => {
	it.each(["logs", "traces", "metrics"])("accepts %s", async (kind) => {
		const dash = await dashboard();
		const res = await post(dash, `/v1/${kind}`, JSON.stringify({}));
		expect(res.status).toBe(200);
	});

	it("reports how many records it took", async () => {
		const dash = await dashboard();
		expect(
			await (await post(dash, "/v1/logs", JSON.stringify({}))).json(),
		).toHaveProperty("accepted");
	});

	it("accepts an empty body", async () => {
		// A collector that 500s on a keepalive POST makes the exporter retry it
		// forever.
		expect((await post(await dashboard(), "/v1/logs")).status).toBe(200);
	});

	it("takes a real log record", async () => {
		const dash = await dashboard();
		const payload = {
			resourceLogs: [
				{
					resource: {
						attributes: [
							{ key: "service.name", value: { stringValue: "hello-world" } },
						],
					},
					scopeLogs: [
						{
							logRecords: [
								{
									timeUnixNano: "1700000000000000000",
									severityText: "INFO",
									body: { stringValue: "started" },
								},
							],
						},
					],
				},
			],
		};
		const body = (await (
			await post(dash, "/v1/logs", JSON.stringify(payload))
		).json()) as { accepted?: number };
		expect(body.accepted).toBeGreaterThan(0);
	});

	it("makes an ingested record readable through the telemetry route", async () => {
		// The two halves of the collector: what goes in over OTLP has to come
		// back out on the pane that shows it.
		const dash = await dashboard();
		await post(
			dash,
			"/v1/logs",
			JSON.stringify({
				resourceLogs: [
					{
						resource: {
							attributes: [
								{ key: "service.name", value: { stringValue: "hello-world" } },
							],
						},
						scopeLogs: [
							{
								logRecords: [
									{
										timeUnixNano: "1700000000000000000",
										severityText: "INFO",
										body: { stringValue: "started" },
									},
								],
							},
						],
					},
				],
			}),
		);
		const body = (await (
			await get(dash, "/api/resources/hello-world/logs")
		).json()) as { logs?: unknown[] };
		expect((body.logs ?? []).length).toBeGreaterThan(0);
	});
});

describe("the sidecars a Station may not stop", () => {
	// The dashboard is not only a viewer of resources -- it is one, and so is
	// the collector beside it. But a Station cannot shut down its own
	// occupancy sidecars through its own dashboard: doing so would close the
	// listener serving the request, and leave no surface to start them from.
	// The controller refuses with 409 before `sidecar.stop` is ever reached.
	it.each([
		"otlp",
		"dashboard",
		"evidence",
	])("refuses to stop %s", async (id) => {
		expect(
			(await post(await dashboard(), `/api/resources/${id}/stop`)).status,
		).toBe(409);
	});

	it("says why it refused", async () => {
		const body = (await (
			await post(await dashboard(), "/api/resources/otlp/stop")
		).json()) as { error?: string };
		expect(body.error).toMatch(/occupancy sidecars/u);
	});

	it("names the resource it refused for", async () => {
		const body = (await (
			await post(await dashboard(), "/api/resources/otlp/stop")
		).json()) as { id?: string; verb?: string };
		expect(body.id).toBe("otlp");
		expect(body.verb).toBe("stop");
	});

	it("refuses a restart for the same reason", async () => {
		// Restart is a stop followed by a start; the stop half is refused, so
		// the whole verb is.
		expect(
			(await post(await dashboard(), "/api/resources/otlp/restart")).status,
		).toBe(409);
	});

	it("leaves the collector listening after a refused stop", async () => {
		// The refusal has to be a no-op, not a partial teardown.
		const dash = await dashboard();
		await post(dash, "/api/resources/otlp/stop");
		expect(
			(
				await fetch(`http://127.0.0.1:${dash.otlpHttpPort}/v1/logs`, {
					method: "POST",
					body: "{}",
				})
			).status,
		).toBe(200);
	});

	it("leaves the dashboard itself serving after a refused stop", async () => {
		const dash = await dashboard();
		await post(dash, "/api/resources/dashboard/stop");
		expect((await get(dash, "/api/resources")).status).toBe(200);
	});

	it("refuses to start one as well", async () => {
		// Both verbs, not just stop. An occupancy sidecar's lifecycle belongs
		// to the Station that hosts it; the dashboard is a window onto that,
		// not a control for it.
		expect(
			(await post(await dashboard(), "/api/resources/otlp/start")).status,
		).toBe(409);
	});

	it("keeps accepting telemetry after a refused start", async () => {
		// The refusal is a no-op in both directions -- nothing is rebound, and
		// what was already listening still is.
		const dash = await dashboard();
		await post(dash, "/api/resources/otlp/start");
		expect((await post(dash, "/v1/logs", "{}")).status).toBe(200);
	});

	it("gives the same reason for a refused start", async () => {
		const body = (await (
			await post(await dashboard(), "/api/resources/otlp/start")
		).json()) as { error?: string; verb?: string };
		expect(body.error).toMatch(/occupancy sidecars/u);
		expect(body.verb).toBe("start");
	});

	it("answers for an id the lifecycle has never registered", async () => {
		// The snapshot falls back to a synthesised state rather than throwing,
		// so an action on an unknown id reports what it did instead of 500ing.
		const res = await post(
			await dashboard(),
			"/api/resources/not-a-resource/stop",
		);
		expect([200, 409]).toContain(res.status);
	});
});
