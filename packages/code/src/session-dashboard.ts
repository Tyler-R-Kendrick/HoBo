/**
 * ADR-0111 local dashboard listener for hobo-code.
 * Same occupancy projection as `hobo-code resources`. Not apps/dashboard.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { preferNamedEndpoint } from "./occupancy-endpoints.js";
import {
	createResourceLifecycle,
	type ResourceLifecycle,
} from "./session-lifecycle.js";
import { createOtelSink, fleetView, type OtelSink } from "./session-otel.js";
import {
	assembleSessionResources,
	type SessionResourceInventory,
} from "./session-resources.js";
import { describeAuthedStationSession } from "./station-session.js";

// public-contract: ADR-0111 local dashboard listen port
export const DEFAULT_DASHBOARD_PORT = 8787;
// public-contract: local OTLP HTTP ingest port
export const DEFAULT_OTLP_HTTP_PORT = 4318;
// public-contract: local OTLP gRPC ingest port
export const DEFAULT_OTLP_GRPC_PORT = 4317;

export interface LocalDashboard {
	readonly url: string;
	readonly port: number;
	readonly otlpHttpUrl: string;
	readonly otlpHttpPort: number;
	readonly otlpGrpcPort: number;
	readonly inventory: () => SessionResourceInventory;
	readonly sink: OtelSink;
	readonly lifecycle: ResourceLifecycle;
	close(): Promise<void>;
}

const SPA = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>hobo-code dashboard</title>
  <style>
    :root { color-scheme: light; --ink:#101010; --paper:#fff; --go:#14672c; --spark:#c5301c; }
    body { margin:0; font: 15px/1.45 ui-monospace, monospace; background: var(--paper); color: var(--ink); }
    header { border-bottom: 3px solid var(--ink); padding: 12px 20px; }
    h1 { font-family: Chewy, Impact, sans-serif; font-weight: 400; margin: 0; }
    main { padding: 16px 20px 40px; }
    .card { border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 12px 14px; margin: 0 0 16px; }
    .row { display:flex; justify-content:space-between; gap: 12px; align-items:baseline; }
    button { border: 2px solid var(--ink); background: var(--paper); padding: 4px 10px; font: inherit; cursor: pointer; }
    .ready { color: var(--go); font-weight: 700; }
    .not-ready { color: var(--spark); }
    .muted { color: #4a4a46; }
    table { width:100%; border-collapse: collapse; }
    td, th { text-align:left; padding: 4px 6px; border-bottom: 1px solid #e3e2de; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <header><h1>hobo-code · resources</h1><p class="muted" id="scope">loading occupancy…</p></header>
  <main>
    <section class="card" id="resources-card"><h2>Resources</h2><div id="resources">loading</div></section>
    <section class="card" id="telemetry-card"><h2>OTel</h2><pre id="telemetry">loading</pre></section>
    <section class="card" id="fleet-card"><h2>Fleet</h2><pre id="fleet">loading</pre></section>
  </main>
  <script>
    async function api(path, opt) {
      const res = await fetch(path, opt);
      return res.json();
    }
    async function act(id, verb) {
      await api("/api/resources/" + encodeURIComponent(id) + "/" + verb, { method: "POST" });
      await render();
    }
    async function render() {
      const inv = await api("/api/resources");
      const fleet = await api("/api/fleet");
      const tel = await api("/api/telemetry");
      const scope = document.getElementById("scope");
      scope.textContent = inv.ok
        ? (inv.scope.stationId + " × " + inv.scope.environment)
        : (inv.message || "auth:out");
      const nodes = []
        .concat(inv.station ? [inv.station] : [])
        .concat(inv.peers || [])
        .concat(inv.junctions || [])
        .concat(inv.yards || [])
        .concat(inv.camps || [])
        .concat(inv.bindles || []);
      const life = inv.lifecycle || [];
      const rows = nodes.map((n) => {
        const snap = life.find((s) => s.id === n.id);
        const ready = snap && snap.ready;
        return "<tr><td>" + n.kind + "</td><td>" + n.id + "</td><td class='" +
          (ready ? "ready" : "not-ready") + "'>" +
          (snap ? snap.state : n.status) +
          "</td><td>" + (n.environment || "") +
          "</td><td><button onclick='act(" + JSON.stringify(n.id) + ",\\"start\\")'>start</button> " +
          "<button onclick='act(" + JSON.stringify(n.id) + ",\\"stop\\")'>stop</button> " +
          "<button onclick='act(" + JSON.stringify(n.id) + ",\\"restart\\")'>restart</button></td></tr>";
      }).join("");
      const eps = (inv.endpoints || []).map((e) =>
        "<tr><td>" + e.resourceName + "</td><td>" + (e.namedUrl || "") +
        "</td><td>" + (e.backendUrl || "") +
        "</td><td>" + ((e.resolvedAddresses || []).join(", ")) + "</td></tr>"
      ).join("");
      document.getElementById("resources").innerHTML =
        "<table><thead><tr><th>kind</th><th>id</th><th>state</th><th>env</th><th></th></tr></thead><tbody>" +
        (rows || "<tr><td colspan=5>no resources</td></tr>") +
        "</tbody></table>" +
        "<h3>Endpoints</h3><table><thead><tr><th>name</th><th>named</th><th>backend</th><th>resolved</th></tr></thead><tbody>" +
        (eps || "<tr><td colspan=4>none</td></tr>") + "</tbody></table>";
      document.getElementById("telemetry").textContent = JSON.stringify(tel, null, 2);
      document.getElementById("fleet").textContent = JSON.stringify(fleet, null, 2);
    }
    render().catch((err) => {
      document.getElementById("resources").textContent = String(err);
    });
  </script>
</body>
</html>
`;

function json(
	response: import("node:http").ServerResponse,
	status: number,
	body: unknown,
): void {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(payload);
}

function readBody(
	request: import("node:http").IncomingMessage,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

function listen(
	server: Server,
	port: number,
	host = "127.0.0.1",
): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			const address = server.address() as AddressInfo;
			resolve(address.port);
		});
	});
}

export async function startLocalDashboard(options: {
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly port?: number;
	readonly otlpHttpPort?: number;
	readonly otlpGrpcPort?: number;
	readonly sink?: OtelSink;
	readonly lifecycle?: ResourceLifecycle;
	readonly campConnected?: boolean;
}): Promise<LocalDashboard> {
	const env = options.env ?? process.env;
	const sink = options.sink ?? createOtelSink();
	const lifecycle = options.lifecycle ?? createResourceLifecycle();
	const load = (): SessionResourceInventory => {
		const inventory = assembleSessionResources({
			hoboHome: options.hoboHome,
			env,
		});
		for (const node of [
			...(inventory.station ? [inventory.station] : []),
			...inventory.peers,
			...inventory.junctions,
			...inventory.yards,
			...inventory.camps,
			...inventory.bindles,
		]) {
			lifecycle.register({
				id: node.id,
				kind: node.kind,
				provisioned: node.status === "declared" || node.status === "serving",
				...(inventory.endpoints[0]?.backendUrl
					? { healthUrl: inventory.endpoints[0].backendUrl }
					: {}),
			});
		}
		for (const endpoint of inventory.endpoints) {
			lifecycle.register({
				id: endpoint.resourceName,
				kind: endpoint.kind,
				healthUrl: endpoint.backendUrl,
				provisioned: true,
			});
		}
		return inventory;
	};

	const handle = async (
		request: import("node:http").IncomingMessage,
		response: import("node:http").ServerResponse,
	): Promise<void> => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const method = (request.method ?? "GET").toUpperCase();
		if (method === "GET" && url.pathname === "/") {
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			response.end(SPA);
			return;
		}
		if (method === "GET" && url.pathname === "/api/resources") {
			const inventory = load();
			json(response, 200, {
				...inventory,
				lifecycle: lifecycle.list(),
			});
			return;
		}
		if (method === "GET" && url.pathname === "/api/telemetry") {
			json(response, 200, { resources: sink.list() });
			return;
		}
		if (method === "GET" && url.pathname === "/api/fleet") {
			json(
				response,
				200,
				fleetView({ campConnected: options.campConnected === true }),
			);
			return;
		}
		const telemetryMatch =
			/^\/api\/resources\/([^/]+)\/(logs|traces|metrics)$/u.exec(url.pathname);
		if (method === "GET" && telemetryMatch) {
			const id = decodeURIComponent(telemetryMatch[1] ?? "");
			const kind = telemetryMatch[2];
			const tel = sink.forResource(id);
			json(response, 200, {
				resourceName: id,
				logs: kind === "logs" ? tel.logs : [],
				traces: kind === "traces" ? tel.traces : [],
				metrics: kind === "metrics" ? tel.metrics : [],
			});
			return;
		}
		const actionMatch =
			/^\/api\/resources\/([^/]+)\/(start|stop|restart)$/u.exec(url.pathname);
		if (method === "POST" && actionMatch) {
			const id = decodeURIComponent(actionMatch[1] ?? "");
			const verb = actionMatch[2];
			load();
			const snap =
				verb === "start"
					? await lifecycle.start(id)
					: verb === "stop"
						? await lifecycle.stop(id)
						: await lifecycle.restart(id);
			json(response, 200, snap);
			return;
		}
		if (method === "POST" && url.pathname === "/v1/logs") {
			const raw = await readBody(request);
			const count = sink.ingestOtlpJson("logs", JSON.parse(raw || "{}"));
			json(response, 200, { accepted: count });
			return;
		}
		if (method === "POST" && url.pathname === "/v1/traces") {
			const raw = await readBody(request);
			const count = sink.ingestOtlpJson("traces", JSON.parse(raw || "{}"));
			json(response, 200, { accepted: count });
			return;
		}
		if (method === "POST" && url.pathname === "/v1/metrics") {
			const raw = await readBody(request);
			const count = sink.ingestOtlpJson("metrics", JSON.parse(raw || "{}"));
			json(response, 200, { accepted: count });
			return;
		}
		json(response, 404, { error: "not found" });
	};

	const dashboard = createServer((request, response) => {
		void handle(request, response).catch((error) => {
			if (!response.headersSent) {
				json(response, 500, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});
	});
	const otlp = createServer((request, response) => {
		void handle(request, response).catch((error) => {
			if (!response.headersSent) {
				json(response, 500, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});
	});
	const grpc = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "application/grpc" });
		response.end();
	});

	const bind = async (server: Server, preferred: number): Promise<number> => {
		try {
			return await listen(server, preferred);
		} catch {
			return listen(server, 0);
		}
	};
	const port = await bind(
		dashboard,
		options.port ??
			Number(env.HOBO_DEV_DASHBOARD_PORT ?? DEFAULT_DASHBOARD_PORT),
	);
	const otlpHttpPort = await bind(
		otlp,
		options.otlpHttpPort ??
			Number(env.HOBO_DEV_OTLP_HTTP_PORT ?? DEFAULT_OTLP_HTTP_PORT),
	);
	const otlpGrpcPort = await bind(
		grpc,
		options.otlpGrpcPort ??
			Number(env.HOBO_DEV_OTLP_GRPC_PORT ?? DEFAULT_OTLP_GRPC_PORT),
	);

	const view = describeAuthedStationSession({
		hoboHome: options.hoboHome,
		env,
		ensureLocalLogin: false,
	});
	const scope = {
		tenant: view.tenant,
		environment: view.environment,
		...(view.project !== undefined ? { project: view.project } : {}),
		...(view.branch !== undefined ? { branch: view.branch } : {}),
	};
	return {
		url: preferNamedEndpoint(`http://127.0.0.1:${port}/`, "dashboard", scope),
		port,
		otlpHttpUrl: preferNamedEndpoint(
			`http://127.0.0.1:${otlpHttpPort}/v1/logs`,
			"otlp",
			scope,
		),
		otlpHttpPort,
		otlpGrpcPort,
		inventory: load,
		sink,
		lifecycle,
		async close() {
			await Promise.all([
				new Promise<void>((resolve) => dashboard.close(() => resolve())),
				new Promise<void>((resolve) => otlp.close(() => resolve())),
				new Promise<void>((resolve) => grpc.close(() => resolve())),
			]);
		},
	};
}
