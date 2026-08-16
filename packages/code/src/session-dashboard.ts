/**
 * ADR-0111 local dashboard listener for hobo-code.
 * Same occupancy projection as `hobo-code resources`. Not apps/dashboard.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	evidenceDocumentCss,
	rubberhoseThemeBootScript,
	rubberhoseThemeToggleMarkup,
	rubberhoseThemeToggleScript,
} from "./evidence-chrome.js";
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
	occupancyRunIsLive,
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>hobo-code · resources</title>
  <script>${rubberhoseThemeBootScript()}</script>
  <style>
    ${evidenceDocumentCss()}
    html, body { max-width: 100%; overflow-x: hidden; }
    body { padding: 0; max-width: none; margin: 0; }
    .skip { position:absolute; left:-999px; top:8px; background:var(--paper); color:var(--ink);
      border:3px solid var(--ink); padding:8px 12px; z-index:2; font-family: Chewy, system-ui, sans-serif; }
    .skip:focus { left:8px; }
    header.dash-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px;
      background:transparent; border:0; box-shadow:none; border-radius:0;
      max-width:72rem; margin:0 auto; padding:20px 24px 4px; }
    header.dash-head .theme-toggle { min-width:44px; min-height:44px; width:44px; height:44px; padding:0; }
    .dash-title { min-width:0; }
    h1, h2, .pane-title { font-family: Chewy, "Arial Rounded MT Bold", system-ui, sans-serif; font-weight: 400; }
    h1 { margin:0; font-size:1.75rem; line-height:1.1; letter-spacing:.01em;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #scope { margin:4px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      font-family: ui-monospace, monospace; font-size:.75rem; }
    #banner { margin:8px 24px 0; max-width:72rem; padding:10px 14px; border:3px solid var(--ink);
      background:var(--paper); box-shadow:4px 4px 0 var(--spark); }
    #banner[hidden] { display:none !important; }
    main { max-width:72rem; margin:0 auto; padding:16px 24px 56px; display:flex; flex-direction:column; gap:20px; }
    .card { margin:0; overflow:hidden; min-width:0; }
    .featured { box-shadow:6px 6px 0 var(--ink); }
    .muted { color: var(--mute); }
    .mono { font-family: ui-monospace, monospace; }
    .pane-head { display:flex; align-items:center; gap:10px; margin:0 0 12px; min-height:32px; }
    .pane-head svg { width:22px; height:22px; fill:currentColor; }
    .pane-title { font-size:1.5rem; line-height:1.2; letter-spacing:.01em; }
    /* one row grammar everywhere: lamp · kind · name+meta · signals · actions */
    .row { display:grid; grid-template-columns:auto auto minmax(0,1fr) auto auto; gap:12px;
      align-items:center; min-width:0; padding:10px 0; border-bottom:2px solid var(--border); }
    .row:last-child { border-bottom:0; }
    .row.cap { grid-template-columns:auto minmax(0,1fr); }
    .row-main { min-width:0; overflow:hidden; }
    .row-name { display:block; font-size:1rem; font-weight:700; line-height:1.25;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .row-name.mono { font-weight:400; font-size:.875rem; }
    .ep-line { display:block; margin:2px 0 0; min-width:0; }
    .ep-line a, .ep-line span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    a.ep-link, span.ep-link { font-family:ui-monospace,monospace; font-size:.875rem; color:var(--ink);
      text-underline-offset:3px; }
    a.ep-link:hover { color: var(--spark); }
    a.listen-link, span.listen-addr { font-family:ui-monospace,monospace; font-size:.75rem;
      color:var(--mute); text-underline-offset:3px; }
    a.listen-link:hover { color: var(--spark); }
    /* inert markers are flat ink — no shadow, no chamfer, no costume */
    .lamp { display:inline-block; width:14px; height:14px; border:3px solid var(--ink); border-radius:50%;
      background:var(--paper); flex:0 0 auto; }
    .lamp.ready, .lamp.go { background: var(--go); }
    .lamp.not-ready, .lamp.off { background: var(--paper); }
    .tree-kind { flex:0 0 auto; width:16px; height:16px; border:3px solid var(--ink); background:var(--paper); }
    .tree-kind.yard { width:20px; height:11px; }
    .tree-kind.camp { width:0; height:0; border:0; border-left:9px solid transparent;
      border-right:9px solid transparent; border-bottom:15px solid var(--ink); background:transparent; }
    .tree-kind.bindle { width:11px; height:11px; transform:rotate(45deg); }
    .tree-kind.station { border-radius:50%; }
    .tree-kind.junction { width:16px; height:7px; }
    .mark { display:inline-grid; place-items:center; width:24px; height:24px; color:var(--mute); }
    .mark svg { width:16px; height:16px; fill:currentColor; }
    .sigs { display:inline-flex; gap:10px; flex:0 0 auto; }
    .sigs:empty { display:none; }
    .sig { display:inline-flex; align-items:center; gap:4px; font-size:.75rem;
      font-variant-numeric:tabular-nums; font-family:ui-monospace,monospace; color:var(--mute); }
    .sig svg { width:13px; height:13px; fill:currentColor; }
    /* pressable = raised: only real controls wear the plank + sticker shadow */
    .acts { display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; justify-content:flex-end; }
    button.ico { display:inline-grid; place-items:center; width:44px; height:44px; padding:0;
      border:3px solid var(--ink); background:var(--paper); color:var(--ink); cursor:pointer;
      clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px);
      filter: drop-shadow(3px 3px 0 var(--ink));
      transition: transform 120ms var(--ease-boing), filter 120ms var(--ease), background 120ms var(--ease); }
    button.ico svg { width:18px; height:18px; fill:currentColor; }
    button.ico:hover { background: var(--ink); color: var(--paper); transform: translateY(-2px) rotate(-2deg); }
    button.ico:active { transform: translate(3px, 3px); filter: drop-shadow(0 0 0 var(--ink)); }
    button.ico.on { background: var(--ink); color: var(--paper); }
    button.ico.on:hover { background: var(--ink); color: var(--paper); }
    button.ico.copied { background: var(--go); color: var(--paper); }
    button.ico.failed { background: var(--spark); color: var(--paper); }
    button.ico:disabled, button.ico[aria-disabled="true"] { opacity:.45; cursor:not-allowed; filter:none; transform:none; }
    button.ico:focus-visible, a:focus-visible, summary:focus-visible, .skip:focus-visible {
      outline: 2.5px solid var(--spark); outline-offset: 3px;
    }
    .chips { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 0; padding:0; list-style:none; }
    .chips li { display:inline-flex; align-items:center; gap:6px; border:2px solid var(--border-strong);
      border-radius:999px; padding:3px 10px; font-size:.75rem; color:var(--mute); min-width:0; }
    .chips .chip-k { text-transform:uppercase; letter-spacing:.06em; font-weight:700; font-size:.7rem; }
    .chips .mono { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.75rem; }
    .station-listing { min-width:0; }
    .station-head { display:grid; grid-template-columns:auto auto minmax(0,1fr) auto; gap:12px;
      align-items:center; min-width:0; }
    .station-head h2 { margin:0; font-size:1.5rem; line-height:1.1; }
    .station-titles { min-width:0; }
    .station-id { margin:2px 0 0; color:var(--mute); font-family:ui-monospace,monospace; font-size:.75rem;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .station-nest { margin:12px 0 0; min-width:0; }
    .station-caps { margin:14px 0 0; padding:10px 0 0; border-top:3px solid var(--border); }
    .caps-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(10rem, 1fr)); column-gap:24px; }
    .caps-list .row { border-bottom:0; padding:6px 0; }
    details.fold { margin:8px 0 0; min-width:0; }
    details.fold > summary { cursor:pointer; list-style:none; display:flex; align-items:center;
      gap:10px; min-height:44px; width:max-content; padding:0 4px; }
    details.fold > summary::-webkit-details-marker { display:none; }
    details.fold > summary:hover { color: var(--spark); }
    details.fold > summary .pane-title { font-size:1.125rem; }
    details.fold > summary::after { content:""; width:9px; height:9px; margin:-4px 0 0;
      border-right:3px solid currentColor; border-bottom:3px solid currentColor;
      transform:rotate(45deg); transition: transform 120ms var(--ease); }
    details.fold[open] > summary::after { margin:2px 0 0; transform:rotate(225deg); }
    details.fold > summary svg { width:18px; height:18px; fill:currentColor; }
    .tree-node { min-width:0; }
    .tree-kids { margin-left:26px; min-width:0; }
    .tree-camp { min-width:0; }
    .tree-bindle { min-width:0; }
    .empty { margin:0; padding:14px 16px; border:3px dashed var(--border-strong); border-radius:12px;
      color:var(--mute); }
    @media (max-width: 640px) {
      header.dash-head, main { padding-left:14px; padding-right:14px; }
      #banner { margin:8px 14px 0; }
      .row { grid-template-columns:auto auto minmax(0,1fr) auto; }
      .row.cap { grid-template-columns:auto minmax(0,1fr); }
      .row .acts { order:4; }
      .row .sigs { order:5; grid-column:1 / -1; justify-self:end; }
      .tree-kids { margin-left:14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      button.ico, details.fold > summary::after { transition:none; }
      button.ico:hover, button.ico:active { transform:none; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#station-card">station</a>
  <header class="dash-head"><div class="dash-title"><h1>hobo-code · resources</h1><p class="muted" id="scope" role="status"></p></div>${rubberhoseThemeToggleMarkup()}</header>
  <p id="banner" role="alert" hidden></p>
  <main>
    <section class="card featured" id="station-card" aria-labelledby="station-heading"><div id="station-pane"></div></section>
    <section class="card" id="resources-card"><h2 class="pane-head" aria-label="yard"><span class="tree-kind yard" aria-hidden="true"></span><span class="pane-title">yard</span></h2><div id="resources"></div></section>
    <section class="card" id="fleet-card" hidden><h2 class="pane-head" aria-label="fleet"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/></svg><span class="pane-title">peers</span></h2><div id="fleet"></div></section>
  </main>
  <script>
    var POLL_MS = 5000;
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
    var flashUntil = 0;
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
    function occupancyLocked(id) {
      return isStationEndpoint(id);
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
      logs: svg("<path d='M2 4h12M2 8h12M2 12h8' fill='none' stroke='currentColor' stroke-width='2'/>"),
      traces: svg("<rect x='2' y='3' width='8' height='2'/><rect x='5' y='7' width='8' height='2'/><rect x='8' y='11' width='6' height='2'/>"),
      metrics: svg("<path d='M1 10h3l2-6 3 9 2-6h4' fill='none' stroke='currentColor' stroke-width='2'/>")
    };
    function mark(name, label) {
      return "<span class='mark' role='img' aria-label='" + esc(label) + "' title='" + esc(label) + "'>" + (ICO[name] || "") + "</span>";
    }
    function kindMark(kind) {
      return "<span class='tree-kind " + esc(kind) + "' role='img' aria-label='" + esc(kind) + "' title='" + esc(kind) + "'></span>";
    }
    function lamp(ready) {
      return "<i class='lamp " + (ready ? "ready" : "not-ready") +
        "' role='img' aria-label='" + (ready ? "ready" : "stopped") + "'></i>";
    }
    function icoAct(verb, extra, label, id, actName) {
      return "<button type='button' class='ico " + (extra || "") + "' data-act='" +
        esc(actName) + "' data-id='" + esc(id) + "' aria-label='" + esc(label) +
        "' title='" + esc(label) + "'>" + (ICO[verb] || "") + "</button>";
    }
    function actionsInner(id, locked, ready) {
      if (locked || occupancyLocked(id)) {
        return mark("lock", "locked");
      }
      if (ready) {
        return icoAct("stop", "on", "stop", id, "stop") +
          (canRestart(id) ? icoAct("restart", "", "restart", id, "restart") : "");
      }
      return icoAct("play", "", "start", id, "start");
    }
    function actsHtml(inner) {
      return "<span class='acts'>" + inner + "</span>";
    }
    function copyBtn(url) {
      if (!url) return "";
      return "<button type='button' class='ico copy' data-copy='" + encodeURIComponent(url) +
        "' aria-label='copy' title='copy'>" + ICO.copy + "</button>";
    }
    var telemetry = {};
    function sigHtml(icon, count, label) {
      var text = count + " " + label;
      return "<span class='sig' role='img' aria-label='" + esc(text) + "' title='" + esc(text) + "'>" +
        ICO[icon] + "<span>" + esc(count) + "</span></span>";
    }
    function sigsHtml(id) {
      var t = telemetry[id];
      var parts = [];
      if (t && t.logs > 0) parts.push(sigHtml("logs", t.logs, "logs"));
      if (t && t.traces > 0) parts.push(sigHtml("traces", t.traces, "traces"));
      if (t && t.metrics > 0) parts.push(sigHtml("metrics", t.metrics, "metrics"));
      return "<span class='sigs'>" + parts.join("") + "</span>";
    }
    function chipsHtml(inv) {
      var chips = [];
      if (inv.scope.environment) chips.push(["env", inv.scope.environment]);
      if (inv.scope.tenant) chips.push(["tenant", inv.scope.tenant]);
      if (inv.station && inv.station.scopeLabel) chips.push(["scope", inv.station.scopeLabel]);
      if (inv.scope.project) chips.push(["project", inv.scope.project]);
      if (inv.scope.branch) chips.push(["branch", inv.scope.branch]);
      if (!chips.length) return "";
      return "<ul class='chips'>" + chips.map(function (chip) {
        return "<li><span class='chip-k'>" + esc(chip[0]) + "</span><span class='mono' title='" +
          esc(chip[1]) + "'>" + esc(chip[1]) + "</span></li>";
      }).join("") + "</ul>";
    }
    var capsOpen = false;
    var sidecarsOpen = false;
    document.addEventListener("click", function (event) {
      var copyButton = event.target.closest("[data-copy]");
      if (copyButton) {
        event.preventDefault();
        focusKey = "copy:" + (copyButton.getAttribute("data-copy") || "");
        var text = decodeURIComponent(copyButton.getAttribute("data-copy") || "");
        var ok = function () {
          copyButton.classList.remove("failed");
          copyButton.classList.add("copied");
          flashUntil = Date.now() + 1300;
          setTimeout(function () { copyButton.classList.remove("copied"); }, 1200);
        };
        var fail = function () {
          copyButton.classList.remove("copied");
          copyButton.classList.add("failed");
          flashUntil = Date.now() + 1700;
          showError("clipboard refused");
          setTimeout(function () { copyButton.classList.remove("failed"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok).catch(fail);
          return;
        }
        fail();
        return;
      }
      var actButton = event.target.closest("[data-act]");
      if (!actButton || actButton.getAttribute("aria-disabled") === "true") return;
      event.preventDefault();
      focusKey = "act:" + (actButton.getAttribute("data-act") || "") + ":" + (actButton.getAttribute("data-id") || "");
      act(actButton.getAttribute("data-id") || "", actButton.getAttribute("data-act") || "");
    });
    var rendering = false;
    async function render() {
      if (rendering) return;
      rendering = true;
      try {
        await renderOnce();
      } finally {
        rendering = false;
      }
    }
    async function renderOnce() {
      var existingCaps = document.getElementById("station-capabilities");
      if (existingCaps) capsOpen = existingCaps.open;
      var existingSidecars = document.getElementById("station-sidecars");
      if (existingSidecars) sidecarsOpen = existingSidecars.open;
      const results = await Promise.all([
        api("/api/resources"),
        api("/api/telemetry").catch(function () { return null; })
      ]);
      const inv = results[0];
      telemetry = {};
      if (results[1] && results[1].resources) {
        results[1].resources.forEach(function (row) { telemetry[row.resourceName] = row; });
      }
      const scope = document.getElementById("scope");
      scope.textContent = inv.ok
        ? (inv.scope.stationId + " × " + inv.scope.environment)
        : (inv.message || "auth:out");
      const life = inv.lifecycle || [];
      function snapOf(id) {
        return life.find(function (s) { return s.id === id; });
      }
      function capsHtml(rows, open) {
        if (!rows.length) return "";
        const body = rows.map(function (r) {
          return "<div class='row cap'>" + lamp(r.available) +
            "<span class='row-main'><span class='row-name mono' title='" + esc(r.kind) + "'>" +
            esc(r.kind) + "</span></span></div>";
        }).join("");
        return "<details id='station-capabilities' class='fold station-caps'" + (open ? " open" : "") +
          "><summary aria-label='capabilities'><span class='pane-title'>capabilities</span></summary>" +
          "<div class='caps-list'>" + body + "</div></details>";
      }
      function endpointRows(list) {
        return list.map(function (e) {
          const snap = snapOf(e.resourceName);
          const ready = snap && snap.ready;
          const named = namedUrl(e);
          const listen = listenUrl(e);
          const primary = named || listen;
          var lines = "";
          if (primary) {
            lines += "<span class='ep-line'>" + (openable(primary)
              ? "<a class='ep-link' href='" + esc(primary) + "' target='_blank' rel='noopener noreferrer' title='" + esc(primary) + "'>" + esc(primary) + "</a>"
              : "<span class='ep-link' title='" + esc(primary) + "'>" + esc(primary) + "</span>") + "</span>";
          }
          if (listen && listen !== primary) {
            lines += "<span class='ep-line'>" + (openable(listen)
              ? "<a class='listen-link' href='" + esc(listen) + "' target='_blank' rel='noopener noreferrer' title='" + esc(listen) + "'>" + esc(listen) + "</a>"
              : "<span class='listen-addr' title='" + esc(listen) + "'>" + esc(listen) + "</span>") + "</span>";
          }
          return "<div class='row'>" + lamp(ready) + kindMark(e.kind || "endpoint") +
            "<span class='row-main'><span class='row-name' title='" + esc(e.resourceName) + "'>" +
            esc(e.resourceName) + "</span>" + lines + "</span>" +
            sigsHtml(e.resourceName) +
            actsHtml(copyBtn(primary) + actionsInner(e.resourceName, false, ready)) +
            "</div>";
        }).join("");
      }
      const stationEps = (inv.endpoints || []).filter(function (e) { return isStationEndpoint(e.resourceName); });
      const doorEps = stationEps.filter(function (e) { return isOccupancyDoor(e.resourceName); });
      const sidecarEps = stationEps.filter(function (e) { return !isOccupancyDoor(e.resourceName); });
      const bindleEps = (inv.endpoints || []).filter(function (e) { return !isStationEndpoint(e.resourceName); });
      const station = inv.station;
      const stationSnap = station ? snapOf(station.id) : undefined;
      const stationReady = stationSnap && stationSnap.ready;
      const stationPane = document.getElementById("station-pane");
      if (!station) {
        stationPane.innerHTML = "<p class='muted'>" + esc(inv.message || "no station") + "</p>";
      } else {
        var folded = sidecarEps.length
          ? "<details id='station-sidecars' class='fold'" + (sidecarsOpen ? " open" : "") +
            "><summary aria-label='hosts'>" + ICO.grid +
            "<span class='pane-title'>hosts</span></summary>" +
            endpointRows(sidecarEps) + "</details>"
          : "";
        stationPane.innerHTML =
          "<div class='station-listing'><div class='station-head'>" + lamp(stationReady) +
          kindMark("station") +
          "<div class='station-titles'><h2 id='station-heading'>station</h2>" +
          "<p class='station-id' title='" + esc(station.id) + "'>" + esc(station.id) + "</p></div>" +
          actsHtml(actionsInner(station.id, true, stationReady)) + "</div>" +
          chipsHtml(inv) +
          "<div class='station-nest'>" + endpointRows(doorEps) + folded + "</div>" +
          capsHtml(inv.capabilities || [], capsOpen) +
          "</div>";
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
        const snap = snapOf(n.id);
        return { snap: snap, ready: snap && snap.ready };
      }
      function managedTable(ownerId) {
        const rows = managedOf(ownerId);
        if (!rows.length) return "";
        return rows.map(function (m) {
          const child = snapOf(m.id);
          return "<div class='row'>" + lamp(child && child.ready) + kindMark(m.kind) +
            "<span class='row-main'><span class='row-name mono' title='" + esc(m.id) + "'>" +
            esc(m.id) + "</span></span>" +
            sigsHtml(m.id) +
            actsHtml(actionsInner(m.id, m.controllable === false, child && child.ready)) +
            "</div>";
        }).join("");
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
          "<div class='row'>" + lamp(st.ready) + kindMark(kind) +
          "<span class='row-main'><span class='row-name mono' title='" + esc(node.id) + "'>" +
          esc(node.id) + "</span></span>" +
          sigsHtml(node.id) +
          actsHtml(actionsInner(node.id, locked, st.ready)) + "</div>" +
          (inner ? "<div class='tree-kids'>" + inner + "</div>" : "") +
          "</div>";
      }
      function bindleHtml(bindle) {
        const eps = endpointsForBindle(bindle);
        return treeBlock("bindle", bindle, managedTable(bindle.id) + endpointRows(eps));
      }
      function campHtml(campNode) {
        const kids = bindles.filter(function (b) { return b.parentId === campNode.id; });
        return treeBlock("camp", campNode, managedTable(campNode.id) + kids.map(bindleHtml).join(""));
      }
      function yardHtml(yard) {
        const kids = camps.filter(function (c) { return c.parentId === yard.id; });
        return treeBlock("yard", yard, managedTable(yard.id) + kids.map(campHtml).join(""));
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
      const board = junctions + tree + (leftover.length ? endpointRows(leftover) : "");
      document.getElementById("resources").innerHTML = board ||
        "<p class='empty'>no bindles on this yard yet — <code>hobo-code dev</code> puts one here</p>";
      var fleetCard = document.getElementById("fleet-card");
      var fleetPeers = inv.peers || [];
      if (!fleetPeers.length) {
        fleetCard.hidden = true;
        document.getElementById("fleet").innerHTML = "";
      } else {
        fleetCard.hidden = false;
        document.getElementById("fleet").innerHTML =
          fleetPeers.map(function (n) {
            return "<div class='row'>" + lamp(true) + kindMark("station") +
              "<span class='row-main'><span class='row-name mono' title='" + esc(n.id) + "'>" +
              esc(n.id) + "</span></span><span class='sigs'></span><span class='acts'></span></div>";
          }).join("");
      }
      if (focusKey) {
        var needle = focusKey.split(":");
        var restore = needle[0] === "copy"
          ? document.querySelector("[data-copy='" + focusKey.slice(5) + "']")
          : document.querySelector("[data-act='" + needle[1] + "'][data-id='" + needle.slice(2).join(":") + "']");
        if (restore) restore.focus();
        focusKey = "";
      }
    }
    render().catch(function (err) {
      showError(String(err));
    });
    setInterval(function () {
      if (document.hidden) return;
      if (Date.now() < flashUntil) return;
      render().catch(function () {});
    }, POLL_MS);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) render().catch(function () {});
    });
    ${rubberhoseThemeToggleScript()}
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

function isMeshBackend(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		return host === "hobo.internal" || host.endsWith(".hobo.internal");
	} catch {
		return false;
	}
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
		const bindleLive =
			controller.isLive() ||
			occupancyRunIsLive(
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
			const userBindle = node.kind === "bindle" && node.id !== CODE_BINDLE_ID;
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
						: userBindle
							? bindleLive
							: false;
			lifecycle.register({
				id: node.id,
				kind: node.kind,
				provisioned: node.status === "declared" || node.status === "serving",
				...(topology || userBindle ? { initiallyStarted: started } : {}),
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
			const mesh = isMeshBackend(endpoint.backendUrl);
			lifecycle.register({
				id: endpoint.resourceName,
				kind: endpoint.kind,
				provisioned: true,
				...(occupancy
					? { initiallyStarted: enabled }
					: bindleLive
						? {
								initiallyStarted: true,
								...(!mesh ? { healthUrl: endpoint.backendUrl } : {}),
							}
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
