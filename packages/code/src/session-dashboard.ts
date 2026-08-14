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
import { chewyFontFace } from "./evidence-chrome.js";
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

const GRAIN =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

const SPA = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>hobo-code · resources</title>
  <style>
    ${chewyFontFace()}
    :root {
      color-scheme: light;
      --ink:#101010; --paper:#ffffff; --cream:#f2f1ec; --go:#14672c; --spark:#c5301c;
      --mute:#4a4a46; --inset:#f4f4f2; --border:#e3e2de;
      --ease: cubic-bezier(.22,1,.36,1); --ease-boing: cubic-bezier(.34,1.56,.64,1);
    }
    * { box-sizing: border-box; }
    html, body { max-width: 100%; overflow-x: hidden; }
    body {
      margin:0; background: var(--cream); color: var(--ink);
      font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    body::after {
      content:""; position:fixed; inset:0; z-index:2147483646; pointer-events:none;
      opacity:.06; mix-blend-mode:multiply;
      background-image:url("${GRAIN}"); background-size:240px 240px;
    }
    .skip { position:absolute; left:-999px; top:8px; background:var(--paper); color:var(--ink);
      border:3px solid var(--ink); padding:8px 12px; z-index:2; }
    .skip:focus { left:8px; }
    header { border-bottom: 3px solid var(--ink); padding: 16px 24px; background: var(--paper); }
    h1, h2 { font-family: Chewy, "Arial Rounded MT Bold", system-ui, sans-serif; font-weight: 400; }
    h1 { margin: 0; font-size: 2.25rem; line-height: 1.1; letter-spacing: .01em;
      transform: rotate(-1deg); text-shadow: 3px 3px 0 var(--border);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 72rem; }
    #scope { margin: 6px 0 0; max-width: 72rem; }
    main { padding: 20px 24px 48px; max-width: 72rem; }
    .card { border: 3px solid var(--ink); border-radius: 18px; box-shadow: 4px 4px 0 var(--ink);
      padding: 16px 18px; margin: 0 0 20px; overflow: hidden; min-width: 0; background: var(--paper); }
    .featured { padding: 22px 22px 24px; box-shadow: 6px 6px 0 var(--ink); }
    .pane-head { display:flex; align-items:center; gap:10px; margin: 0 0 12px; min-height: 28px; }
    .pane-head svg { width:24px; height:24px; fill: currentColor; }
    .station-head { display:grid; grid-template-columns: auto auto minmax(0,1fr) auto; gap:10px; align-items:center; min-width:0; }
    .station-head h2 { margin: 0; font-size: 1.5rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .scope-line { margin: 8px 0 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .muted { color: var(--mute); }
    #banner { margin: 0 24px 0; max-width: 72rem; padding: 10px 14px; border: 3px solid var(--ink);
      background: var(--paper); box-shadow: 4px 4px 0 var(--spark); }
    #banner[hidden] { display: none !important; }
    .ico { display:inline-grid; place-items:center; width:44px; height:44px; padding:0;
      border:3px solid var(--ink); background: var(--paper); box-shadow: 4px 4px 0 var(--ink);
      color: var(--ink); clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px); }
    .ico svg { width:18px; height:18px; fill: currentColor; }
    button.ico { cursor: pointer; transition: transform 120ms var(--ease-boing), box-shadow 120ms var(--ease), background 120ms var(--ease); }
    button.ico:hover { background: var(--spark); color: var(--paper); transform: translateY(-2px) rotate(-2deg); }
    button.ico:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--ink); }
    button.ico.on { background: var(--ink); color: var(--paper); }
    button.ico.on:hover { background: var(--spark); }
    button.ico.copied { background: var(--go); color: var(--paper); }
    button.ico.failed { background: var(--spark); color: var(--paper); }
    button.ico:disabled, button.ico[aria-disabled="true"] { opacity:.45; cursor:not-allowed; box-shadow:none; transform:none; }
    span.ico { cursor: default; }
    .ico:focus-visible, a.ep-link:focus-visible, summary:focus-visible, .skip:focus-visible {
      outline: 2.5px solid var(--spark); outline-offset: 3px;
    }
    .acts { display:inline-flex; gap:8px; flex: 0 0 auto; }
    .lamp { display:inline-block; width:14px; height:14px; border:3px solid var(--ink); border-radius:50%;
      background: var(--paper); flex: 0 0 auto; }
    .lamp.ready, .lamp.go { background: var(--go); }
    .lamp.not-ready, .lamp.off { background: var(--paper); }
    .ep-list, .item-list { display:flex; flex-direction:column; gap:10px; min-width:0; }
    .ep-card { display:grid; grid-template-columns: auto minmax(0,1fr) auto; gap:10px; align-items:center;
      border: 3px solid var(--ink); border-radius: 12px; padding:10px; min-width:0; background: var(--inset); }
    .item-row { display:grid; grid-template-columns: auto auto minmax(0,1fr) auto; gap:10px; align-items:center;
      border: 3px solid var(--ink); border-radius: 12px; padding:10px; min-width:0; background: var(--inset); }
    .ep-urls, .item-id { min-width:0; overflow:hidden; }
    .item-id, .ep-link, .ep-line span { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .875rem; }
    .ep-line { display:grid; grid-template-columns: minmax(0,1fr) auto; gap:6px; align-items:center; min-width:0; }
    .ep-urls a, .ep-urls span, .ep-line a, .ep-line > span, .item-id { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    a.ep-link { color: var(--ink); font-weight: 700; text-underline-offset: 3px; }
    a.ep-link:hover { color: var(--spark); }
    .listen a, .listen span { font-size: 12px; color: var(--mute); font-weight: 400; }
    details.fold { margin: 12px 0 0; min-width:0; }
    details.fold > summary { cursor: pointer; list-style: none; display:flex; align-items:center;
      gap:10px; min-height: 44px; width: max-content; }
    details.fold > summary::-webkit-details-marker { display:none; }
    .caps-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap:8px; margin-top:10px; }
    .cap { display:grid; grid-template-columns: auto minmax(0,1fr); gap:6px; align-items:center;
      border: 3px solid var(--ink); border-radius: 12px; padding:8px; min-width:0; }
    .cap span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family: ui-monospace, monospace; font-size: .8rem; }
    .tree-node { margin: 12px 0; padding: 8px 0 4px 18px; min-width:0;
      background: linear-gradient(var(--ink), var(--ink)) 0 0 / 3px calc(100% - 8px) no-repeat; }
    .tree-camp { margin-left: 14px; }
    .tree-bindle { margin-left: 14px; }
    .tree-head { display:flex; flex-wrap:wrap; gap: 8px; align-items:center; margin: 0 0 8px; min-width:0; }
    .tree-head strong { flex: 1 1 8rem; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      font-family: ui-monospace, monospace; font-size: .95rem; }
    .tree-head .acts { margin-left: auto; }
    .tree-kind { flex:0 0 auto; width:18px; height:18px; border:3px solid var(--ink); background: var(--paper); }
    .tree-kind.yard { width:22px; height:12px; }
    .tree-kind.camp { width:0; height:0; border:0; border-left:10px solid transparent; border-right:10px solid transparent; border-bottom:16px solid var(--ink); background:transparent; }
    .tree-kind.bindle { width:12px; height:12px; transform:rotate(45deg); }
    .tree-kind.station { border-radius:50%; }
    .tree-kind.junction { width:18px; height:8px; }
    .sigs { display:inline-flex; gap:8px; flex: 0 0 auto; }
    .sig { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-variant-numeric: tabular-nums; }
    .sig svg { width:14px; height:14px; fill: currentColor; }
    * { scrollbar-color: var(--ink) var(--inset); scrollbar-width: thick; }
    @media (max-width: 640px) {
      h1 { font-size: 1.6rem; }
      main, header { padding-left: 14px; padding-right: 14px; }
      .item-row, .ep-card { grid-template-columns: auto auto minmax(0,1fr); }
      .ep-card { grid-template-columns: auto minmax(0,1fr); }
      .item-row .acts, .item-row .sigs, .ep-card .acts { grid-column: 1 / -1; justify-self: end; }
    }
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; --ink:#f2f1ec; --paper:#0a0a0a; --cream:#0a0a0a;
        --inset:#111111; --mute:#c9c8c2; --border:#4a4a46; }
      body::after { mix-blend-mode: screen; opacity:.08; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0s !important;
        transition-duration: .01ms !important; transition-delay: 0s !important; }
      h1, button.ico { transform: none; }
      button.ico:hover, button.ico:active { transform: none; }
      body::after { opacity: 0; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#station-card">station</a>
  <header><h1>hobo-code · resources</h1><p class="muted" id="scope" role="status"></p></header>
  <p id="banner" role="alert" hidden></p>
  <main>
    <section class="card featured" id="station-card" aria-labelledby="station-heading"><div id="station-pane"></div></section>
    <section class="card" id="resources-card"><h2 class="pane-head" aria-label="yard"><span class="tree-kind yard"></span></h2><div id="resources"></div></section>
    <section class="card" id="telemetry-card"><h2 class="pane-head" aria-label="otel"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8c2-4 3 4 5 0s3 4 5 0 3 4 5 0" fill="none" stroke="currentColor" stroke-width="2"/></svg></h2><div id="telemetry"></div></section>
    <section class="card" id="fleet-card" hidden><h2 class="pane-head" aria-label="fleet"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/></svg></h2><div id="fleet"></div></section>
  </main>
  <script>
    async function api(path, opt) {
      const res = await fetch(path, opt);
      return res.json();
    }
    function showError(message) {
      var banner = document.getElementById("banner");
      if (!message) {
        banner.hidden = true;
        banner.textContent = "";
        return;
      }
      banner.hidden = false;
      banner.textContent = message;
    }
    var focusKey = "";
    async function act(id, verb) {
      const result = await api("/api/resources/" + encodeURIComponent(id) + "/" + verb, { method: "POST" });
      if (result && result.error) {
        showError(result.error);
      } else {
        showError("");
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
    function isStationEndpoint(name) {
      return name === "dashboard" || name === "evidence" || name === "controls" ||
        name === "report" || name === "otlp" || name === "evals" ||
        name === "rollout" || name === "experiment" || name === "kms" ||
        name === "secret" || name === "crypto" || name === "history";
    }
    function isOccupancyDoor(name) {
      return name === "dashboard" || name === "evidence" || name === "otlp";
    }
    function canRestart(id) {
      return id.indexOf("bindle:") === 0 || id === "web" || id === "api";
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
    function svg(path) {
      return "<svg viewBox='0 0 16 16' aria-hidden='true'>" + path + "</svg>";
    }
    var ICO = {
      play: svg("<polygon points='4,2 14,8 4,14'/>"),
      stop: svg("<rect x='3' y='3' width='10' height='10'/>"),
      restart: svg("<path d='M3 8a5 5 0 0 1 9-3l1-2v6H7l2-2a3.5 3.5 0 1 0 1 4'/>"),
      copy: svg("<rect x='5' y='5' width='8' height='8'/><rect x='3' y='3' width='8' height='8' fill='none' stroke='currentColor' stroke-width='2'/>"),
      lock: svg("<rect x='4' y='7' width='8' height='7'/><path d='M6 7V5a2 2 0 0 1 4 0v2' fill='none' stroke='currentColor' stroke-width='2'/>"),
      grid: svg("<rect x='2' y='2' width='5' height='5'/><rect x='9' y='2' width='5' height='5'/><rect x='2' y='9' width='5' height='5'/><rect x='9' y='9' width='5' height='5'/>"),
      log: svg("<rect x='3' y='2' width='10' height='12'/><path d='M5 5h6M5 8h6M5 11h4' stroke='var(--paper)' stroke-width='1.5'/>"),
      trace: svg("<path d='M3 3h4v4H3zM9 9h4v4H9z'/><path d='M7 5h2v2H8v2' fill='none' stroke='currentColor' stroke-width='2'/>"),
      metric: svg("<rect x='3' y='9' width='3' height='5'/><rect x='7' y='5' width='3' height='9'/><rect x='11' y='3' width='3' height='11'/>")
    };
    function ico(verb, extra, label) {
      return "<span class='ico " + (extra || "") + "' role='img' aria-label='" + esc(label) + "' title='" + esc(label) + "'>" + (ICO[verb] || "") + "</span>";
    }
    function linkHtml(url, kind) {
      if (!url) return "";
      var label = esc(url);
      var open = openable(url)
        ? "<a class='ep-link' href='" + label + "' target='_blank' rel='noopener noreferrer'>" + label + "</a>"
        : "<span>" + label + "</span>";
      return "<span class='ep-line " + (kind || "") + "'>" + open +
        "<button type='button' class='ico copy' data-copy='" + encodeURIComponent(url) + "' aria-label='copy' title='copy'>" + ICO.copy + "</button></span>";
    }
    var capsOpen = false;
    var sidecarsOpen = false;
    document.addEventListener("click", function (event) {
      var copyBtn = event.target.closest("[data-copy]");
      if (copyBtn) {
        event.preventDefault();
        focusKey = "copy:" + (copyBtn.getAttribute("data-copy") || "");
        var text = decodeURIComponent(copyBtn.getAttribute("data-copy") || "");
        var ok = function () {
          copyBtn.classList.remove("failed");
          copyBtn.classList.add("copied");
          setTimeout(function () { copyBtn.classList.remove("copied"); }, 1200);
        };
        var fail = function () {
          copyBtn.classList.remove("copied");
          copyBtn.classList.add("failed");
          showError("clipboard refused");
          setTimeout(function () { copyBtn.classList.remove("failed"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok).catch(fail);
          return;
        }
        fail();
        return;
      }
      var actBtn = event.target.closest("[data-act]");
      if (!actBtn || actBtn.getAttribute("aria-disabled") === "true") return;
      event.preventDefault();
      focusKey = "act:" + (actBtn.getAttribute("data-act") || "") + ":" + (actBtn.getAttribute("data-id") || "");
      act(actBtn.getAttribute("data-id") || "", actBtn.getAttribute("data-act") || "");
    });
    async function render() {
      var existingCaps = document.getElementById("station-capabilities");
      if (existingCaps) capsOpen = existingCaps.open;
      var existingSidecars = document.getElementById("station-sidecars");
      if (existingSidecars) sidecarsOpen = existingSidecars.open;
      const inv = await api("/api/resources");
      const tel = await api("/api/telemetry");
      const scope = document.getElementById("scope");
      scope.textContent = inv.ok
        ? (inv.scope.stationId + " × " + inv.scope.environment)
        : (inv.message || "auth:out");
      const life = inv.lifecycle || [];
      function icoAct(verb, extra, label, id, actName) {
        return "<button type='button' class='ico " + (extra || "") + "' data-act='" +
          esc(actName) + "' data-id='" + esc(id) + "' aria-label='" + esc(label) +
          "' title='" + esc(label) + "'>" + (ICO[verb] || "") + "</button>";
      }
      function actions(id, locked, ready) {
        if (locked) {
          return "<span class='acts'>" + ico("lock", "", "locked") + "</span>";
        }
        if (ready) {
          return "<span class='acts'>" +
            icoAct("stop", "on", "stop", id, "stop") +
            (canRestart(id) ? icoAct("restart", "", "restart", id, "restart") : "") +
            "</span>";
        }
        return "<span class='acts'>" + icoAct("play", "", "start", id, "start") + "</span>";
      }
      function lamp(ready) {
        return "<i class='lamp " + (ready ? "ready" : "not-ready") +
          "' role='img' aria-label='" + (ready ? "ready" : "stopped") + "'></i>";
      }
      function rowHtml(kind, id, state, extra, locked, ready) {
        return "<div class='item-row'>" + lamp(ready) +
          "<span class='tree-kind " + esc(kind) + "' aria-hidden='true'></span>" +
          "<span class='item-id' title='" + esc(id) + "'>" + esc(id) + "</span>" +
          actions(id, locked, ready) + "</div>";
      }
      function sig(icon, count, label) {
        return "<span class='sig' aria-label='" + esc(label) + " " + count + "'>" +
          icon + "<b>" + count + "</b></span>";
      }
      function capsHtml(rows, open) {
        if (!rows.length) return "";
        const body = rows.map((r) =>
          "<div class='cap'>" + lamp(r.available) + "<span title='" + esc(r.kind) + "'>" +
          esc(r.kind) + "</span></div>"
        ).join("");
        return "<details id='station-capabilities' class='fold'" +
          (open ? " open" : "") +
          "><summary aria-label='capabilities'>" + ICO.grid + "</summary><div class='caps-grid'>" +
          body +
          "</div></details>";
      }
      function endpointRows(list) {
        return list.map((e) => {
          const snap = life.find((s) => s.id === e.resourceName);
          const ready = snap && snap.ready;
          return "<div class='ep-card'>" + lamp(ready) +
            "<div class='ep-urls'><strong title='" + esc(e.resourceName) + "'>" + esc(e.resourceName) +
            "</strong>" + linkHtml(namedUrl(e), "named") +
            linkHtml(listenUrl(e), "listen") + "</div>" +
            actions(e.resourceName, false, ready) + "</div>";
        }).join("");
      }
      const stationEps = (inv.endpoints || []).filter((e) => isStationEndpoint(e.resourceName));
      const doorEps = stationEps.filter((e) => isOccupancyDoor(e.resourceName));
      const sidecarEps = stationEps.filter((e) => !isOccupancyDoor(e.resourceName));
      const bindleEps = (inv.endpoints || []).filter((e) => !isStationEndpoint(e.resourceName));
      const station = inv.station;
      const stationSnap = station ? life.find((s) => s.id === station.id) : undefined;
      const stationReady = stationSnap && stationSnap.ready;
      const stationPane = document.getElementById("station-pane");
      if (!station) {
        stationPane.innerHTML = "<p class='muted'>" + esc(inv.message || "no station") + "</p>";
      } else {
        var folded = sidecarEps.length
          ? "<details id='station-sidecars' class='fold'" + (sidecarsOpen ? " open" : "") +
            "><summary aria-label='sidecars'>" + ICO.grid + "</summary><div class='ep-list'>" +
            endpointRows(sidecarEps) + "</div></details>"
          : "";
        stationPane.innerHTML =
          "<div class='station-head'>" + lamp(stationReady) +
          "<span class='tree-kind station' aria-hidden='true'></span>" +
          "<h2 id='station-heading' title='" + esc(station.id) + "'>" + esc(station.id) + "</h2>" +
          actions(station.id, true, stationReady) + "</div>" +
          "<p class='muted scope-line' title='" +
          esc((inv.scope.environment || "") + " · " + (inv.scope.tenant || "")) + "'>" +
          esc(inv.scope.environment || "") + " · " + esc(inv.scope.tenant || "") + "</p>" +
          "<div class='ep-list'>" + endpointRows(doorEps) + "</div>" +
          folded +
          capsHtml(inv.capabilities || [], capsOpen);
      }
      const yards = inv.yards || [];
      const camps = inv.camps || [];
      const bindles = inv.bindles || [];
      const claimed = {};
      function managedOf(ownerId) {
        return (inv.managed || []).filter(function (m) {
          return m.ownerId === ownerId && m.kind !== "bindle" && !isStationEndpoint(m.id);
        });
      }
      function nodeReady(n) {
        const snap = life.find(function (s) { return s.id === n.id; });
        return {
          snap: snap,
          ready: snap && snap.ready,
          state: snap ? snap.state : n.status
        };
      }
      function managedTable(ownerId, fallbackState) {
        const rows = managedOf(ownerId);
        if (!rows.length) return "";
        return "<div class='item-list'>" +
          rows.map(function (m) {
            const child = life.find(function (s) { return s.id === m.id; });
            return rowHtml(
              m.kind,
              m.id,
              child ? child.state : fallbackState,
              m.ownerKind,
              m.controllable === false,
              child && child.ready
            );
          }).join("") +
          "</div>";
      }
      function endpointsForBindle(bindle) {
        const names = {};
        if (inv.bindleManifest && inv.bindleManifest.name === bindle.name) {
          (inv.bindleManifest.resources || []).forEach(function (r) { names[r.name] = true; });
        }
        managedOf(bindle.parentId).forEach(function (m) {
          if (m.kind === "bindle-resource") names[m.name || m.id] = true;
        });
        return bindleEps.filter(function (e) {
          if (!names[e.resourceName] || claimed[e.resourceName]) return false;
          claimed[e.resourceName] = true;
          return true;
        });
      }
      function treeBlock(kind, node, inner) {
        const st = nodeReady(node);
        const locked = node.id === "camp:code" || node.id === "bindle:code";
        return "<div class='tree-node tree-" + kind + "'>" +
          "<div class='tree-head'>" + lamp(st.ready) +
          "<span class='tree-kind " + kind + "' aria-hidden='true'></span><strong title='" +
          esc(node.id) + "'>" + esc(node.id) + "</strong>" +
          actions(node.id, locked, st.ready) + "</div>" +
          (inner || "") +
          "</div>";
      }
      function bindleHtml(bindle) {
        const eps = endpointsForBindle(bindle);
        const epTable = eps.length
          ? "<div class='ep-list'>" + endpointRows(eps) + "</div>"
          : "";
        return treeBlock("bindle", bindle, managedTable(bindle.id, bindle.status) + epTable);
      }
      function campHtml(campNode) {
        const kids = bindles.filter(function (b) { return b.parentId === campNode.id; });
        return treeBlock(
          "camp",
          campNode,
          managedTable(campNode.id, campNode.status) + kids.map(bindleHtml).join("")
        );
      }
      function yardHtml(yard) {
        const kids = camps.filter(function (c) { return c.parentId === yard.id; });
        return treeBlock(
          "yard",
          yard,
          managedTable(yard.id, yard.status) + kids.map(campHtml).join("")
        );
      }
      const yardIds = {};
      yards.forEach(function (y) { yardIds[y.id] = true; });
      const campIds = {};
      camps.forEach(function (c) { campIds[c.id] = true; });
      const orphanCamps = camps.filter(function (c) { return !c.parentId || !yardIds[c.parentId]; });
      const orphanBindles = bindles.filter(function (b) { return !b.parentId || !campIds[b.parentId]; });
      const junctions = (inv.junctions || []).map(function (n) {
        return treeBlock("junction", n, "");
      }).join("");
      const tree = yards.map(yardHtml).join("") + orphanCamps.map(campHtml).join("") +
        orphanBindles.map(bindleHtml).join("");
      const leftover = bindleEps.filter(function (e) { return !claimed[e.resourceName]; });
      document.getElementById("resources").innerHTML =
        junctions + tree +
        (leftover.length
          ? "<div class='ep-list'>" + endpointRows(leftover) + "</div>"
          : "");
      const otlp = (inv.endpoints || []).find((e) => e.resourceName === "otlp") || {};
      const grpcListen = tel.collector && tel.collector.grpcPort
        ? ("http://127.0.0.1:" + tel.collector.grpcPort + "/")
        : "";
      const collector = tel.collector
        ? ("<div class='ep-card'>" + lamp(tel.collector.status === "listening") +
           "<div class='ep-urls'>" +
           linkHtml(tel.collector.httpUrl || namedUrl(otlp), "named") +
           linkHtml(listenUrl(otlp), "listen") +
           (grpcListen ? linkHtml(grpcListen, "listen") : "") +
           "</div></div>")
        : "";
      const otelRows = (tel.resources || []).map((r) =>
        "<div class='item-row'>" + lamp(r.export === "exporting") +
        "<span class='tree-kind " + esc(r.kind || "") + "' aria-hidden='true'></span>" +
        "<span class='item-id' title='" + esc(r.resourceName) + "'>" + esc(r.resourceName) + "</span>" +
        "<span class='sigs'>" +
        sig(ICO.log, r.logs || 0, "logs") +
        sig(ICO.trace, r.traces || 0, "traces") +
        sig(ICO.metric, r.metrics || 0, "metrics") +
        "</span></div>"
      ).join("");
      document.getElementById("telemetry").innerHTML =
        collector + "<div class='item-list'>" + otelRows + "</div>";
      var fleetCard = document.getElementById("fleet-card");
      var fleetPeers = inv.peers || [];
      if (!fleetPeers.length) {
        fleetCard.hidden = true;
        document.getElementById("fleet").innerHTML = "";
      } else {
        fleetCard.hidden = false;
        document.getElementById("fleet").innerHTML =
          "<div class='item-list'>" +
          fleetPeers.map(function (n) {
            return "<div class='item-row'>" + lamp(true) +
              "<span class='tree-kind station' aria-hidden='true'></span>" +
              "<span class='item-id' title='" + esc(n.id) + "'>" + esc(n.id) + "</span></div>";
          }).join("") + "</div>";
      }
      if (focusKey) {
        var needle = focusKey.split(":");
        var restore = needle[0] === "copy"
          ? document.querySelector("[data-copy='" + focusKey.slice(5) + "']")
          : document.querySelector("[data-act='" + needle[1] + "'][data-id='" + needle.slice(2).join(":") + "']");
        if (restore) restore.focus();
      }
    }
    render().catch((err) => {
      showError(String(err));
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
