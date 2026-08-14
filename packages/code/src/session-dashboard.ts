/**
 * ADR-0111 local dashboard listener for hobo-code.
 * Same occupancy projection as `hobo-code resources`. Not apps/dashboard.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
	occupancySidecarEndpoints,
	preferNamedEndpoint,
} from "./occupancy-endpoints.js";
import {
	createResourceLifecycle,
	type ResourceLifecycle,
} from "./session-lifecycle.js";
import {
	createOtelSink,
	fleetView,
	type OtelSink,
	projectOccupancyTelemetry,
} from "./session-otel.js";
import {
	createOccupancyController,
	isManagedResourceEnabled,
	isOccupancySidecar,
	type OccupancyController,
	occupancyCampIsActive,
	occupancyFlowIsActive,
	type SidecarControl,
	type StartDevSession,
} from "./session-resource-control.js";
import {
	assembleSessionResources,
	CODE_BINDLE_ID,
	CODE_CAMP_ID,
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
    button.copy { padding: 2px 8px; }
    .ready { color: var(--go); font-weight: 700; }
    .not-ready { color: var(--spark); }
    .muted { color: #4a4a46; }
    table { width:100%; border-collapse: collapse; }
    td, th { text-align:left; padding: 4px 6px; border-bottom: 1px solid #e3e2de; }
    a.ep-link { color: var(--ink); font-weight: 700; text-underline-offset: 3px; }
    a.ep-link:hover { color: var(--spark); }
    .ep { display:flex; flex-wrap:wrap; align-items:baseline; gap: 6px; }
    .listen .ep-link, .listen span { font-size: 13px; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <header><h1>hobo-code · resources</h1><p class="muted" id="scope">loading occupancy…</p></header>
  <main>
    <section class="card" id="resources-card"><h2>Resources</h2><p class="muted">station · yard · camp — manage each child (flow, named-endpoints, bindle resources)</p><div id="resources">loading</div></section>
    <section class="card" id="telemetry-card"><h2>OTel</h2><div id="telemetry">loading</div></section>
    <section class="card" id="fleet-card"><h2>Fleet</h2><pre id="fleet">loading</pre></section>
  </main>
  <script>
    async function api(path, opt) {
      const res = await fetch(path, opt);
      return res.json();
    }
    async function act(id, verb) {
      const result = await api("/api/resources/" + encodeURIComponent(id) + "/" + verb, { method: "POST" });
      if (result && result.error) {
        window.alert(result.error);
      }
      await render();
    }
    function esc(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
      });
    }
    function openable(url) {
      try {
        var parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        var port = parsed.port ? Number(parsed.port) : (parsed.protocol === "https:" ? 443 : 80);
        return Number.isInteger(port) && port > 0;
      } catch (err) {
        return false;
      }
    }
    function namedUrl(endpoint) {
      return endpoint.preferredUrl || endpoint.namedUrl || "";
    }
    function listenUrl(endpoint) {
      var named = namedUrl(endpoint);
      var backend = endpoint.backendUrl || "";
      var address = (endpoint.resolvedAddresses || [])[0];
      function ontoIp(url, host) {
        try {
          var parsed = new URL(url);
          if (!openable(url)) return "";
          var current = parsed.hostname;
          if (current === "127.0.0.1" || current === "[::1]" || current === "::1") return parsed.href;
          parsed.hostname = host || "127.0.0.1";
          return parsed.href;
        } catch (err) {
          return "";
        }
      }
      var rewritten = ontoIp(backend || named, address);
      if (rewritten && rewritten !== named && openable(rewritten)) return rewritten;
      if (address && endpoint.listenPort > 0) return "http://" + address + ":" + endpoint.listenPort + "/";
      return "";
    }
    function linkHtml(url, kind) {
      if (!url) return "<span class='muted'>—</span>";
      var label = esc(url);
      var open = openable(url)
        ? "<a class='ep-link' href='" + label + "' target='_blank' rel='noopener noreferrer'>" + label + "</a>"
        : "<span>" + label + "</span>";
      return "<span class='ep " + (kind || "") + "'>" + open +
        " <button type='button' class='copy' data-copy='" + encodeURIComponent(url) + "'>copy</button></span>";
    }
    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-copy]");
      if (!button) return;
      event.preventDefault();
      var text = decodeURIComponent(button.getAttribute("data-copy") || "");
      var done = function () {
        button.textContent = "copied";
        setTimeout(function () { button.textContent = "copy"; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
        return;
      }
      done();
    });
    async function render() {
      const inv = await api("/api/resources");
      const fleet = await api("/api/fleet");
      const tel = await api("/api/telemetry");
      const scope = document.getElementById("scope");
      scope.textContent = inv.ok
        ? (inv.scope.stationId + " × " + inv.scope.environment)
        : (inv.message || "auth:out");
      const primitives = []
        .concat(inv.station ? [inv.station] : [])
        .concat(inv.peers || [])
        .concat(inv.junctions || [])
        .concat(inv.yards || [])
        .concat(inv.camps || []);
      const life = inv.lifecycle || [];
      function actions(id, locked) {
        return locked
          ? "<span class='muted'>occupancy</span>"
          : "<button onclick='act(" + JSON.stringify(id) + ",\\"start\\")'>start</button> " +
            "<button onclick='act(" + JSON.stringify(id) + ",\\"stop\\")'>stop</button> " +
            "<button onclick='act(" + JSON.stringify(id) + ",\\"restart\\")'>restart</button>";
      }
      function rowHtml(kind, id, state, extra, locked, ready) {
        return "<tr><td>" + kind + "</td><td>" + id + "</td><td class='" +
          (ready ? "ready" : "not-ready") + "'>" + state +
          "</td><td>" + (extra || "") + "</td><td>" + actions(id, locked) + "</td></tr>";
      }
      const groups = primitives.map((n) => {
        const snap = life.find((s) => s.id === n.id);
        const ready = snap && snap.ready;
        const children = (inv.managed || []).filter((m) => m.ownerId === n.id);
        const childRows = children.map((m) => {
          const child = life.find((s) => s.id === m.id);
          const childReady = child && child.ready;
          return rowHtml(
            m.kind,
            m.id,
            child ? child.state : n.status,
            m.ownerKind,
            m.controllable === false,
            childReady
          );
        }).join("");
        const hostLocked = n.kind === "station" || n.id === "camp:code" || n.id === "bindle:code";
        return "<h3>" + n.kind + " · " + n.id + "</h3><table><thead><tr><th>kind</th><th>id</th><th>state</th><th></th><th></th></tr></thead><tbody>" +
          rowHtml(n.kind, n.id, snap ? snap.state : n.status, n.environment || "", hostLocked, ready) +
          (childRows || "") +
          "</tbody></table>";
      }).join("");
      const eps = (inv.endpoints || []).map((e) => {
        const snap = life.find((s) => s.id === e.resourceName);
        const ready = snap && snap.ready;
        return "<tr><td>" + e.resourceName + "</td><td>" + e.kind + "</td><td>" +
        linkHtml(namedUrl(e), "named") +
        "</td><td>" + linkHtml(listenUrl(e), "listen") +
        "</td><td class='" + (ready ? "ready" : "not-ready") + "'>" +
        (snap ? snap.state : "stopped") +
        "</td><td>" + actions(e.resourceName, false) + "</td></tr>";
      }).join("");
      const caps = (inv.capabilities || []).map((r) =>
        "<tr><td>" + r.kind + "</td><td class='" +
        (r.available ? "ready" : "not-ready") + "'>" +
        (r.available ? "available" : "unavailable") +
        "</td><td>" + r.fidelity + "</td><td>" + (r.note || "") + "</td></tr>"
      ).join("");
      const camp = inv.camp
        ? ("<p>camp " + inv.camp.name + " · require " + (inv.camp.require || []).join(", ") +
           " · env " + ((inv.bindleManifest && inv.bindleManifest.envKeys) || []).join(", ") + "</p>")
        : "";
      document.getElementById("resources").innerHTML =
        camp +
        (groups || "<p>no resources</p>") +
        "<h3>Endpoints</h3><table><thead><tr><th>name</th><th>kind</th><th>named</th><th>listen</th><th>state</th><th></th></tr></thead><tbody>" +
        (eps || "<tr><td colspan=6>none</td></tr>") + "</tbody></table>" +
        "<h3>Capabilities</h3><table><thead><tr><th>kind</th><th>local</th><th>fidelity</th><th>note</th></tr></thead><tbody>" +
        (caps || "<tr><td colspan=4>none</td></tr>") + "</tbody></table>";
      const otlp = (inv.endpoints || []).find((e) => e.resourceName === "otlp") || {};
      const grpcListen = tel.collector && tel.collector.grpcPort
        ? ("http://127.0.0.1:" + tel.collector.grpcPort + "/")
        : "";
      const collector = tel.collector
        ? ("<p>collector " + linkHtml(tel.collector.httpUrl || namedUrl(otlp), "named") +
           " · listen " + linkHtml(listenUrl(otlp), "listen") +
           (grpcListen ? " · grpc " + linkHtml(grpcListen, "listen") : "") +
           " · " + (tel.collector.status || "unknown") + "</p>")
        : "";
      const otelRows = (tel.resources || []).map((r) =>
        "<tr><td>" + r.resourceName + "</td><td>" + r.kind + "</td><td class='" +
        (r.export === "exporting" ? "ready" : "not-ready") + "'>" + r.export +
        "</td><td>" + (r.logs || 0) + "</td><td>" + (r.traces || 0) + "</td><td>" +
        (r.metrics || 0) + "</td><td class='muted'>" + (r.note || "") + "</td></tr>"
      ).join("");
      document.getElementById("telemetry").innerHTML =
        collector +
        "<table><thead><tr><th>service</th><th>kind</th><th>export</th><th>logs</th><th>traces</th><th>metrics</th><th>note</th></tr></thead><tbody>" +
        (otelRows || "<tr><td colspan=7>no services</td></tr>") +
        "</tbody></table>";
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

function relatedLifecycleIds(
	id: string,
	inventory: SessionResourceInventory,
): readonly string[] {
	const managed = inventory.managed ?? [];
	const childrenOf = (ownerId: string): string[] =>
		managed.filter((row) => row.ownerId === ownerId).map((row) => row.id);
	const httpIds = inventory.endpoints
		.filter((row) => row.kind === "http")
		.map((row) => row.resourceName);
	if (/^yard:[^:]+$/.test(id)) {
		const campsHere = inventory.camps
			.filter((row) => row.parentId === id && row.id !== CODE_CAMP_ID)
			.map((row) => row.id);
		return [
			id,
			...childrenOf(id),
			...campsHere,
			...campsHere.flatMap((campId) => childrenOf(campId)),
		];
	}
	if (/^camp:[^:]+$/.test(id)) {
		return [id, ...childrenOf(id)];
	}
	if (id === CODE_CAMP_ID || id === CODE_BINDLE_ID || isOccupancySidecar(id)) {
		return [id];
	}
	if (id.startsWith("bindle:") || httpIds.includes(id)) {
		return [
			id,
			...inventory.bindles
				.filter((row) => row.id !== CODE_BINDLE_ID)
				.map((row) => row.id),
			...httpIds.filter((name) => !isOccupancySidecar(name)),
		];
	}
	return [id];
}

function isLocalTopology(kind: string): boolean {
	return kind === "station" || kind === "yard" || kind === "camp";
}

function otelSubjects(
	inventory: SessionResourceInventory,
): { id: string; kind: string }[] {
	const rows: { id: string; kind: string }[] = [];
	const seen = new Set<string>();
	const add = (id: string, kind: string): void => {
		if (seen.has(id)) return;
		seen.add(id);
		rows.push({ id, kind });
	};
	for (const endpoint of inventory.endpoints) {
		add(endpoint.resourceName, endpoint.kind);
	}
	for (const bindle of inventory.bindles) {
		add(bindle.id, "bindle");
	}
	return rows;
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
	readonly projectRoot?: string;
	readonly startDevSession?: StartDevSession;
	readonly controller?: OccupancyController;
	readonly evidenceControl?: SidecarControl;
}): Promise<LocalDashboard> {
	const env = options.env ?? process.env;
	const sink = options.sink ?? createOtelSink();
	const lifecycle = options.lifecycle ?? createResourceLifecycle();
	const sidecar: SidecarControl = {
		start: async () => {},
		stop: async () => {},
	};
	const controller =
		options.controller ??
		createOccupancyController({
			hoboHome: options.hoboHome,
			env,
			sidecar,
			...(options.projectRoot !== undefined
				? { projectRoot: options.projectRoot }
				: {}),
			...(options.startDevSession !== undefined
				? { startDevSession: options.startDevSession }
				: {}),
		});
	const liveOccupancy = {
		dashboardUrl: "",
		otlpHttpUrl: "",
	};
	const liveCollector = { httpUrl: "", grpcPort: 0 };
	const load = (): SessionResourceInventory => {
		const inventory = assembleSessionResources({
			hoboHome: options.hoboHome,
			env,
			...(options.projectRoot !== undefined
				? { projectDir: options.projectRoot }
				: {}),
			liveEndpoints: occupancySidecarEndpoints({
				...(liveOccupancy.dashboardUrl
					? { dashboardUrl: liveOccupancy.dashboardUrl }
					: {}),
				...(liveOccupancy.otlpHttpUrl
					? { otlpHttpUrl: liveOccupancy.otlpHttpUrl }
					: {}),
			}),
		});
		const appHealth =
			inventory.endpoints.find((row) => row.resourceName === "web")
				?.backendUrl ?? inventory.endpoints[0]?.backendUrl;
		const flowActive = occupancyFlowIsActive(
			options.hoboHome,
			inventory.scope.stationId,
			inventory.scope.environment,
		);
		for (const node of [
			...(inventory.station ? [inventory.station] : []),
			...inventory.peers,
			...inventory.junctions,
			...inventory.yards,
			...inventory.camps,
			...inventory.bindles,
		]) {
			const topology = isLocalTopology(node.kind);
			const started =
				node.kind === "camp"
					? occupancyCampIsActive(
							options.hoboHome,
							inventory.scope.stationId,
							inventory.scope.environment,
							node.id,
						)
					: node.kind === "yard" || node.kind === "station"
						? flowActive || node.kind === "station"
						: false;
			lifecycle.register({
				id: node.id,
				kind: node.kind,
				provisioned: node.status === "declared" || node.status === "serving",
				...(topology ? { initiallyStarted: started } : {}),
				...(!topology && appHealth ? { healthUrl: appHealth } : {}),
			});
		}
		for (const endpoint of inventory.endpoints) {
			const occupancy = isOccupancySidecar(endpoint.resourceName);
			const enabled = isManagedResourceEnabled(
				options.hoboHome,
				inventory.scope.stationId,
				inventory.scope.environment,
				endpoint.resourceName,
			);
			lifecycle.register({
				id: endpoint.resourceName,
				kind: endpoint.kind,
				provisioned: true,
				...(occupancy
					? { initiallyStarted: enabled }
					: { healthUrl: endpoint.backendUrl }),
			});
		}
		for (const resource of inventory.managed) {
			const enabled = isManagedResourceEnabled(
				options.hoboHome,
				inventory.scope.stationId,
				inventory.scope.environment,
				resource.id,
			);
			const flowChild = resource.kind === "flow";
			lifecycle.register({
				id: resource.id,
				kind: resource.kind,
				provisioned: true,
				initiallyStarted: resource.controllable
					? flowChild
						? flowActive && enabled
						: enabled
					: true,
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
			const inventory = load();
			json(
				response,
				200,
				projectOccupancyTelemetry({
					resources: otelSubjects(inventory),
					sink,
					collector: {
						httpUrl: liveCollector.httpUrl,
						grpcPort: liveCollector.grpcPort,
					},
				}),
			);
			return;
		}
		if (method === "GET" && url.pathname === "/api/fleet") {
			const inventory = load();
			json(
				response,
				200,
				fleetView({
					campConnected:
						options.campConnected === true || inventory.camps.length > 0,
				}),
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
			try {
				if (verb === "stop" || verb === "restart") {
					await controller.stop(id);
				}
				if (verb === "start" || verb === "restart") {
					await controller.start(id);
				}
			} catch (error) {
				json(response, 409, {
					error: error instanceof Error ? error.message : String(error),
					id,
					verb,
				});
				return;
			}
			const inventory = load();
			if (verb === "stop" || verb === "restart") {
				for (const relatedId of relatedLifecycleIds(id, inventory)) {
					try {
						await lifecycle.stop(relatedId);
					} catch {
						// id may not be registered
					}
				}
			}
			if (verb === "start" || verb === "restart") {
				for (const relatedId of relatedLifecycleIds(id, inventory)) {
					try {
						await lifecycle.start(relatedId);
					} catch {
						// id may not be registered
					}
				}
			}
			const snap = (() => {
				try {
					return lifecycle.snapshot(id);
				} catch {
					return {
						id,
						kind: "unknown",
						state: verb === "stop" ? "stopped" : "started",
						ready: verb !== "stop",
						provisioned: true,
						started: verb !== "stop",
						healthy: verb !== "stop",
					};
				}
			})();
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
	liveOccupancy.dashboardUrl = preferNamedEndpoint(
		`http://127.0.0.1:${port}/`,
		"dashboard",
		scope,
	);
	liveOccupancy.otlpHttpUrl = preferNamedEndpoint(
		`http://127.0.0.1:${otlpHttpPort}/v1/logs`,
		"otlp",
		scope,
	);
	liveCollector.httpUrl = liveOccupancy.otlpHttpUrl;
	liveCollector.grpcPort = otlpGrpcPort;
	const listening = { dashboard: true, otlp: true, grpc: true };
	const closeServer = (server: Server): Promise<void> =>
		new Promise((resolve) => {
			server.close(() => resolve());
		});
	sidecar.stop = async (id) => {
		if (id === "dashboard" && listening.dashboard) {
			await closeServer(dashboard);
			listening.dashboard = false;
		}
		if (id === "otlp") {
			if (listening.otlp) {
				await closeServer(otlp);
				listening.otlp = false;
			}
			if (listening.grpc) {
				await closeServer(grpc);
				listening.grpc = false;
			}
		}
		if (id === "evidence" || id === "controls" || id === "report") {
			await options.evidenceControl?.stop(id);
		}
	};
	sidecar.start = async (id) => {
		if (id === "dashboard" && !listening.dashboard) {
			await listen(dashboard, port);
			listening.dashboard = true;
		}
		if (id === "otlp") {
			if (!listening.otlp) {
				await listen(otlp, otlpHttpPort);
				listening.otlp = true;
			}
			if (!listening.grpc) {
				await listen(grpc, otlpGrpcPort);
				listening.grpc = true;
			}
		}
		if (id === "evidence" || id === "controls" || id === "report") {
			await options.evidenceControl?.start(id);
		}
	};

	const startedAt = new Date().toISOString();
	sink.ingestLog({
		resourceName: "dashboard",
		body: "dashboard listening",
		severity: "INFO",
		time: startedAt,
	});
	sink.ingestMetric({
		resourceName: "dashboard",
		name: "up",
		value: 1,
		time: startedAt,
	});
	sink.ingestLog({
		resourceName: "otlp",
		body: "otlp http listening",
		severity: "INFO",
		time: startedAt,
	});
	sink.ingestMetric({
		resourceName: "otlp",
		name: "up",
		value: 1,
		time: startedAt,
	});
	return {
		url: liveOccupancy.dashboardUrl,
		port,
		otlpHttpUrl: liveOccupancy.otlpHttpUrl,
		otlpHttpPort,
		otlpGrpcPort,
		inventory: load,
		sink,
		lifecycle,
		async close() {
			await Promise.all([
				listening.dashboard ? closeServer(dashboard) : Promise.resolve(),
				listening.otlp ? closeServer(otlp) : Promise.resolve(),
				listening.grpc ? closeServer(grpc) : Promise.resolve(),
			]);
			listening.dashboard = false;
			listening.otlp = false;
			listening.grpc = false;
		},
	};
}
