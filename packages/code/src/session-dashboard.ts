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
    /* breadcrumbs: station › yard › resource */
    .crumbs { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
    .crumbs a, .crumbs .here { display:inline-flex; align-items:center; gap:6px; max-width:22rem;
      border:2px solid var(--border-strong); border-radius:999px; padding:4px 12px;
      font-family:ui-monospace,monospace; font-size:.75rem; color:var(--ink); text-decoration:none; }
    .crumbs a span, .crumbs .here span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .crumbs a:hover { border-color:var(--spark); color:var(--spark); }
    .crumbs .here { border-color:var(--ink); font-weight:700; }
    /* one row grammar; per-table fixed columns so planks align in a column */
    .row { display:grid; gap:12px; align-items:center; min-width:0; padding:10px 0;
      border-bottom:2px solid var(--border); }
    .row:last-child { border-bottom:0; }
    .row.r-ep { grid-template-columns:14px 18px minmax(7rem,1.1fr) minmax(0,1.6fr) 8.5rem 9.9rem; }
    .row.r-ep .ep-cell { grid-column:4; }
    .row.r-ep .sigs { grid-column:5; }
    .row.r-ep .acts { grid-column:6; }
    .row.r-sum { grid-template-columns:14px 20px minmax(0,1fr) auto 6.9rem; }
    .row.r-sum .sums { grid-column:4; }
    .row.r-sum .acts { grid-column:5; }
    .row.cap { grid-template-columns:auto minmax(0,1fr); }
    .thead { display:grid; grid-template-columns:14px 18px minmax(7rem,1.1fr) minmax(0,1.6fr) 8.5rem 9.9rem;
      gap:12px; padding:0 0 6px; border-bottom:3px solid var(--border); color:var(--mute);
      font-size:.75rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
    .group-cap { margin:16px 0 2px; }
    .row-main { min-width:0; overflow:hidden; }
    .row-name { display:block; font-size:1rem; font-weight:700; line-height:1.25;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .row-name.mono { font-weight:400; font-size:.875rem; }
    a.res-link { color:var(--ink); text-underline-offset:3px; }
    a.res-link:hover { color:var(--spark); }
    .ep-cell { min-width:0; overflow:hidden; }
    .ep-line { display:block; min-width:0; }
    .ep-cell .ep-line a, .ep-cell .ep-line > span.ep-link,
    .ep-cell .ep-line > span.listen-addr { display:block; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .ep-detail { display:flex; flex-direction:column; gap:8px; margin:0 0 12px; min-width:0; }
    .ep-detail .ep-line { display:grid; grid-template-columns:4.5rem minmax(0,1fr) auto;
      gap:8px; align-items:center; }
    .ep-detail .ep-k { font-size:.75rem; font-weight:700; letter-spacing:.06em;
      text-transform:uppercase; color:var(--mute); }
    .ep-detail .ep-line a, .ep-detail .ep-line > span.ep-link,
    .ep-detail .ep-line > span.listen-addr { display:block; min-width:0; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
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
    .sigs { display:inline-flex; gap:10px; flex:0 0 auto; justify-self:end; }
    .sigs:empty { display:none; }
    .sig { display:inline-flex; align-items:center; gap:4px; font-size:.75rem;
      font-variant-numeric:tabular-nums; font-family:ui-monospace,monospace; color:var(--mute); }
    .sig svg { width:13px; height:13px; fill:currentColor; }
    .sums { display:inline-flex; gap:14px; justify-self:end; }
    .sum { display:inline-flex; align-items:center; gap:6px; font-family:ui-monospace,monospace;
      font-size:.75rem; color:var(--mute); font-variant-numeric:tabular-nums; }
    .sum .tree-kind { width:12px; height:12px; border-width:2.5px; }
    .sum .tree-kind.yard { width:15px; height:8px; }
    .sum .tree-kind.camp { border-left-width:7px; border-right-width:7px; border-bottom-width:12px; }
    .sum .tree-kind.bindle { width:9px; height:9px; }
    .sum .dot { width:10px; height:10px; border-radius:50%; border:2.5px solid var(--ink); background:var(--go); }
    /* pressable = raised: only real controls wear the plank + sticker shadow */
    .acts { display:flex; align-items:center; gap:8px; justify-content:flex-end; justify-self:stretch; }
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
    .chips .chip-k { text-transform:uppercase; letter-spacing:.06em; font-weight:700; font-size:.75rem; }
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
    .detail-head { display:grid; grid-template-columns:auto auto minmax(0,1fr) auto; gap:12px;
      align-items:center; min-width:0; margin:0 0 12px; }
    .detail-head h2 { margin:0; font-size:1.5rem; line-height:1.1;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .trust { margin:0 0 12px; }
    .trust dd { font-family:ui-monospace,monospace; font-size:.875rem;
      overflow-wrap:anywhere; word-break:break-word; white-space:normal; }
    .fact-group { margin:0 0 10px; }
    .fact-group > .group-cap { margin:10px 0 4px; }
    .fact-group:first-child > .group-cap { margin-top:0; }
    details.fact-fold { margin:8px 0 0; }
    details.fact-fold > summary { cursor:pointer; list-style:none; font-size:.75rem;
      font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--mute);
      min-height:44px; display:inline-flex; align-items:center; gap:8px; }
    details.fact-fold > summary::-webkit-details-marker { display:none; }
    details.fact-fold > summary:hover { color:var(--spark); }
    details.fact-fold > summary::after { content:""; width:7px; height:7px; margin-top:-2px;
      border-right:2px solid currentColor; border-bottom:2px solid currentColor;
      transform:rotate(45deg); }
    details.fact-fold[open] > summary::after { margin-top:2px; transform:rotate(225deg); }
    .life-strap { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center;
      margin:0 0 12px; min-width:0; }
    .life-strap .life-bit { display:inline-flex; align-items:center; gap:6px; min-width:0;
      font-size:.75rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
      color:var(--mute); }
    .life-strap .life-bit .mono { font-weight:400; letter-spacing:0; text-transform:none;
      font-size:.875rem; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      max-width:18rem; }
    .life-strap .life-err { color:var(--spark); text-transform:none; letter-spacing:0; font-weight:700;
      font-family:ui-monospace,monospace; font-size:.875rem; }
    .manifest-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; }
    .manifest-list li { display:grid; grid-template-columns:5.5rem minmax(0,1fr); gap:8px;
      border:3px solid var(--ink); border-radius:12px; box-shadow:4px 4px 0 var(--ink);
      padding:8px 10px; background:var(--inset); min-width:0; }
    .manifest-list .mk { font-size:.75rem; font-weight:700; letter-spacing:.06em;
      text-transform:uppercase; color:var(--mute); }
    .manifest-list .mv { font-family:ui-monospace,monospace; font-size:.875rem; min-width:0;
      overflow-wrap:anywhere; word-break:break-word; }
    .manifest-list .mv .dep, .manifest-list .mv .allow { display:block; color:var(--mute); font-size:.75rem; }
    .tel-head { display:flex; align-items:center; gap:10px; margin:18px 0 4px; }
    .tel-row { display:grid; grid-template-columns:6.5rem 8rem minmax(0,1fr); gap:12px; padding:6px 0;
      border-bottom:2px solid var(--border); font-family:ui-monospace,monospace; font-size:.75rem; min-width:0; }
    .tel-row:last-child { border-bottom:0; }
    .tel-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .empty { margin:0; padding:14px 16px; border:3px dashed var(--border-strong); border-radius:12px;
      color:var(--mute); }
    @media (max-width: 640px) {
      header.dash-head, main { padding-left:14px; padding-right:14px; }
      #banner { margin:8px 14px 0; }
      .thead { display:none; }
      .row.r-ep { grid-template-columns:14px 18px minmax(0,1fr) 6.6rem; }
      .row.r-ep .ep-cell { grid-column:3 / -1; grid-row:2; }
      .row.r-ep .sigs { grid-column:3 / -1; grid-row:3; }
      .row.r-ep .acts { grid-column:4; grid-row:1; }
      .row.r-ep .copy { display:none; }
      .row.r-sum { grid-template-columns:14px 20px minmax(0,1fr) 6.9rem; }
      .row.r-sum .sums { grid-column:3 / -1; grid-row:2; }
      .row.r-sum .acts { grid-column:4; grid-row:1; }
      .tel-row { grid-template-columns:6.5rem minmax(0,1fr); }
      .tel-row span:nth-child(3) { grid-column:1 / -1; }
    }
    @media (prefers-reduced-motion: reduce) {
      button.ico, details.fold > summary::after { transition:none; }
      button.ico:hover, button.ico:active { transform:none; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">station</a>
  <header class="dash-head"><div class="dash-title"><h1>hobo-code · resources</h1><p class="muted" id="scope" role="status"></p></div>${rubberhoseThemeToggleMarkup()}</header>
  <p id="banner" role="alert" hidden></p>
  <main id="main">
    <nav id="crumbs" class="crumbs" aria-label="path" hidden></nav>
    <section class="card featured" id="station-card" aria-labelledby="station-heading"><div id="station-pane"></div></section>
    <section class="card" id="yards-card"><h2 class="pane-head" aria-label="yards"><span class="tree-kind yard" aria-hidden="true"></span><span class="pane-title">yards</span></h2><div id="yards"></div></section>
    <section class="card" id="fleet-card" hidden><h2 class="pane-head" aria-label="fleet"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/></svg><span class="pane-title">peers</span></h2><div id="fleet"></div></section>
    <section class="card" id="detail-card" hidden><div id="detail"></div></section>
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
    var detailTab = "logs";
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
      chev: svg("<path d='M5 2l6 6-6 6' fill='none' stroke='currentColor' stroke-width='2.5'/>"),
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
    function lifeBit(label, on, value) {
      return "<span class='life-bit'>" + lamp(on === true) +
        "<span>" + esc(label) + "</span>" +
        (value ? "<span class='mono' title='" + esc(value) + "'>" + esc(value) + "</span>" : "") +
        "</span>";
    }
    function lifeStrap(inv, id) {
      var snap = snapOf(inv, id);
      if (!snap) return "";
      var bits = lifeBit("ready", snap.ready) +
        lifeBit("started", snap.started) +
        lifeBit("healthy", snap.healthy) +
        "<span class='life-bit'><span>state</span><span class='mono' title='" +
        esc(snap.state) + "'>" + esc(snap.state) + "</span></span>";
      if (snap.lastError) {
        bits += "<span class='life-bit life-err' title='" + esc(snap.lastError) + "'>" +
          esc(snap.lastError) + "</span>";
      }
      return "<div class='life-strap' role='status' aria-label='lifecycle'>" + bits + "</div>";
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
    function resHref(id) {
      return "#/resource/" + encodeURIComponent(id);
    }
    function yardHref(id) {
      return "#/yard/" + encodeURIComponent(id);
    }
    function campHref(id) {
      return "#/camp/" + encodeURIComponent(id);
    }
    function bindleHref(id) {
      return "#/bindle/" + encodeURIComponent(id);
    }
    function hrefFor(kind, id) {
      if (kind === "yard") return yardHref(id);
      if (kind === "camp") return campHref(id);
      if (kind === "bindle") return bindleHref(id);
      return resHref(id);
    }
    function drillLink(kind, id) {
      return "<a class='res-link' href='" + hrefFor(kind, id) + "' title='" + esc(id) + "'>" + esc(id) + "</a>";
    }
    function resLink(id) {
      return drillLink("resource", id);
    }
    var telemetry = {};
    function sigHtml(icon, count, label) {
      var text = count + " " + label;
      return "<span class='sig' role='img' aria-label='" + esc(text) + "' title='" + esc(text) + "'>" +
        ICO[icon] + "<span>" + esc(count) + "</span></span>";
    }
    function sigParts(t) {
      var parts = [];
      if (t && t.logs > 0) parts.push(sigHtml("logs", t.logs, "logs"));
      if (t && t.traces > 0) parts.push(sigHtml("traces", t.traces, "traces"));
      if (t && t.metrics > 0) parts.push(sigHtml("metrics", t.metrics, "metrics"));
      return parts.join("");
    }
    function sigsHtml(id) {
      return "<span class='sigs'>" + sigParts(telemetry[id]) + "</span>";
    }
    function sigsRollup(ids) {
      var total = { logs: 0, traces: 0, metrics: 0 };
      ids.forEach(function (id) {
        var t = telemetry[id];
        if (!t) return;
        total.logs += t.logs || 0;
        total.traces += t.traces || 0;
        total.metrics += t.metrics || 0;
      });
      return "<span class='sigs'>" + sigParts(total) + "</span>";
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
    function route() {
      var hash = location.hash || "#/";
      var yardMatch = /^#\\/yard\\/(.+)$/.exec(hash);
      if (yardMatch) return { view: "yard", id: decodeURIComponent(yardMatch[1]) };
      var campMatch = /^#\\/camp\\/(.+)$/.exec(hash);
      if (campMatch) return { view: "camp", id: decodeURIComponent(campMatch[1]) };
      var bindleMatch = /^#\\/bindle\\/(.+)$/.exec(hash);
      if (bindleMatch) return { view: "bindle", id: decodeURIComponent(bindleMatch[1]) };
      var resMatch = /^#\\/resource\\/(.+)$/.exec(hash);
      if (resMatch) return { view: "resource", id: decodeURIComponent(resMatch[1]) };
      return { view: "overview" };
    }
    var capsOpen = false;
    var sidecarsOpen = false;
    document.addEventListener("click", function (event) {
      var tabButton = event.target.closest("[data-tab]");
      if (tabButton) {
        event.preventDefault();
        detailTab = tabButton.getAttribute("data-tab") || "logs";
        focusKey = "tab:" + detailTab;
        render().catch(function () {});
        return;
      }
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
      const view = route();
      const overview = view.view === "overview";
      document.getElementById("station-card").hidden = !overview;
      document.getElementById("yards-card").hidden = !overview;
      document.getElementById("detail-card").hidden = overview;
      document.getElementById("crumbs").hidden = overview;
      const fleetCard = document.getElementById("fleet-card");
      const fleetPeers = inv.peers || [];
      fleetCard.hidden = !overview || !fleetPeers.length;
      if (overview) {
        renderOverview(inv);
      } else {
        renderCrumbs(inv, view);
        if (view.view === "yard") {
          await renderYard(inv, view.id);
        } else if (view.view === "camp") {
          await renderCamp(inv, view.id);
        } else if (view.view === "bindle") {
          await renderBindle(inv, view.id);
        } else {
          await renderResource(inv, view.id);
        }
      }
      if (focusKey) {
        var needle = focusKey.split(":");
        var restore = needle[0] === "copy"
          ? document.querySelector("[data-copy='" + focusKey.slice(5) + "']")
          : needle[0] === "tab"
            ? document.querySelector("[data-tab='" + needle[1] + "']")
            : document.querySelector("[data-act='" + needle[1] + "'][data-id='" + needle.slice(2).join(":") + "']");
        if (restore) restore.focus();
        focusKey = "";
      }
    }
    function snapOf(inv, id) {
      return (inv.lifecycle || []).find(function (s) { return s.id === id; });
    }
    function readyOf(inv, id) {
      var snap = snapOf(inv, id);
      return snap && snap.ready;
    }
    function managedOf(inv, ownerId) {
      return (inv.managed || []).filter(function (m) {
        return m.ownerId === ownerId && m.kind !== "bindle" && !isStationEndpoint(m.id);
      });
    }
    function campById(inv, id) {
      return (inv.camps || []).find(function (c) { return c.id === id; });
    }
    function bindleById(inv, id) {
      return (inv.bindles || []).find(function (b) { return b.id === id; });
    }
    function campsOf(inv, yardId) {
      return (inv.camps || []).filter(function (c) { return c.parentId === yardId; });
    }
    function bindlesOf(inv, campId) {
      return (inv.bindles || []).filter(function (b) { return b.parentId === campId; });
    }
    function bindleEndpointNames(inv, bindle) {
      var names = {};
      if (inv.bindleManifest && inv.bindleManifest.name === bindle.name) {
        (inv.bindleManifest.resources || []).forEach(function (r) { names[r.name] = true; });
      }
      managedOf(inv, bindle.parentId).forEach(function (m) {
        if (m.kind === "bindle-resource") names[m.name || m.id] = true;
      });
      return names;
    }
    function claimingBindle(inv, name) {
      return (inv.bindles || []).find(function (b) {
        return bindleEndpointNames(inv, b)[name];
      });
    }
    function bindleResourceIds(inv, bindle) {
      return Object.keys(bindleEndpointNames(inv, bindle));
    }
    function chainFor(inv, view) {
      var yardId = "";
      var campId = "";
      var bindleId = "";
      if (view.view === "yard") yardId = view.id;
      if (view.view === "camp") campId = view.id;
      if (view.view === "bindle") bindleId = view.id;
      if (view.view === "resource") {
        var claimed = claimingBindle(inv, view.id);
        if (claimed) {
          bindleId = claimed.id;
        } else {
          var managed = (inv.managed || []).find(function (m) { return m.id === view.id; });
          if (managed) {
            if (managed.ownerId.indexOf("bindle:") === 0) bindleId = managed.ownerId;
            else if (managed.ownerId.indexOf("camp:") === 0) campId = managed.ownerId;
            else if (managed.ownerId.indexOf("yard:") === 0) yardId = managed.ownerId;
          }
        }
      }
      if (bindleId && !campId) {
        var bindle = bindleById(inv, bindleId);
        if (bindle && bindle.parentId) campId = bindle.parentId;
      }
      if (campId && !yardId) {
        var camp = campById(inv, campId);
        if (camp && camp.parentId) yardId = camp.parentId;
      }
      return { yardId: yardId, campId: campId, bindleId: bindleId };
    }
    function renderCrumbs(inv, view) {
      var chain = chainFor(inv, view);
      var parts = ["<a href='#/'>" + kindMark("station") + "<span>station</span></a>"];
      [["yard", chain.yardId], ["camp", chain.campId], ["bindle", chain.bindleId]].forEach(function (level) {
        if (!level[1] || view.view === level[0]) return;
        parts.push(mark("chev", "in"));
        parts.push("<a href='" + hrefFor(level[0], level[1]) + "'>" + kindMark(level[0]) +
          "<span>" + esc(level[1]) + "</span></a>");
      });
      parts.push(mark("chev", "in"));
      var hereKind = view.view === "resource" ? "" : view.view;
      parts.push("<span class='here' aria-current='page'>" +
        (hereKind ? kindMark(hereKind) : "") + "<span>" + esc(view.id) + "</span></span>");
      document.getElementById("crumbs").innerHTML = parts.join("");
    }
    function theadHtml(label) {
      return "<div class='thead' aria-hidden='true'><span></span><span></span><span>" + esc(label) +
        "</span><span>endpoint</span><span>signals</span><span></span></div>";
    }
    function groupCap(label) {
      return "<p class='eyebrow group-cap'>" + esc(label) + "</p>";
    }
    function endpointCell(e) {
      if (!e) return "<span class='ep-cell'></span>";
      var named = namedUrl(e);
      var listen = listenUrl(e);
      var primary = named || listen;
      var lines = "";
      if (primary) {
        lines += "<span class='ep-line'>" + (openable(primary)
          ? "<a class='ep-link' href='" + esc(primary) + "' target='_blank' rel='noopener noreferrer' title='" + esc(primary) + "'>" + esc(primary) + "</a>"
          : "<span class='ep-link' title='" + esc(primary) + "'>" + esc(primary) + "</span>") + "</span>";
      }
      if (listen && listen !== primary) {
        lines += "<span class='ep-line'><span class='listen-addr' title='" + esc(listen) + "'>" +
          esc(listen) + "</span></span>";
      }
      return "<span class='ep-cell'>" + lines + "</span>";
    }
    function resourceRow(inv, opts) {
      var ready = readyOf(inv, opts.id);
      var primary = opts.endpoint ? (namedUrl(opts.endpoint) || listenUrl(opts.endpoint)) : "";
      return "<div class='row r-ep'>" + lamp(ready) + kindMark(opts.kind) +
        "<span class='row-main'><span class='row-name mono'>" + resLink(opts.id) + "</span></span>" +
        endpointCell(opts.endpoint) +
        sigsHtml(opts.id) +
        actsHtml((opts.endpoint ? copyBtn(primary) : "") + actionsInner(opts.id, opts.locked === true, ready)) +
        "</div>";
    }
    function doorRows(inv, list) {
      return list.map(function (e) {
        return resourceRow(inv, { id: e.resourceName, kind: e.kind || "endpoint", endpoint: e });
      }).join("");
    }
    function countChip(kind, count, label) {
      return "<span class='sum' role='img' aria-label='" + esc(count + " " + label) + "'>" +
        "<span class='tree-kind " + esc(kind) + "'></span>" + esc(count) + "</span>";
    }
    function runningChip(running, total) {
      return "<span class='sum' role='img' aria-label='" + esc(running + " of " + total + " running") + "'>" +
        "<span class='dot'></span>" + esc(running) + "/" + esc(total) + "</span>";
    }
    function summaryRow(inv, opts) {
      var ready = readyOf(inv, opts.id);
      return "<div class='row r-sum'>" + lamp(ready) + kindMark(opts.kind) +
        "<span class='row-main'><span class='row-name mono'>" + drillLink(opts.kind, opts.id) +
        "</span></span><span class='sums'>" + (opts.sums || "") + "</span>" +
        actsHtml(actionsInner(opts.id, opts.locked === true, ready)) +
        "</div>";
    }
    function campRollupIds(inv, camp) {
      var ids = [camp.id];
      bindlesOf(inv, camp.id).forEach(function (bindle) {
        ids.push(bindle.id);
        bindleResourceIds(inv, bindle).forEach(function (name) { ids.push(name); });
      });
      managedOf(inv, camp.id).forEach(function (m) {
        if (m.kind !== "bindle-resource") ids.push(m.id);
      });
      return ids;
    }
    function campSummaryRow(inv, camp) {
      var bindles = bindlesOf(inv, camp.id);
      var ids = campRollupIds(inv, camp);
      var running = ids.filter(function (id) { return readyOf(inv, id); }).length;
      return summaryRow(inv, {
        kind: "camp", id: camp.id, locked: camp.id === "camp:code",
        sums: countChip("bindle", bindles.length, "bindles") + runningChip(running, ids.length) + sigsRollup(ids)
      });
    }
    function bindleSummaryRow(inv, bindle) {
      var resources = bindleResourceIds(inv, bindle);
      var ids = [bindle.id].concat(resources);
      var running = ids.filter(function (id) { return readyOf(inv, id); }).length;
      return summaryRow(inv, {
        kind: "bindle", id: bindle.id, locked: bindle.id === "bindle:code",
        sums: countChip("endpoint", resources.length, "resources") + runningChip(running, ids.length) + sigsRollup(ids)
      });
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
    function renderOverview(inv) {
      const stationEps = (inv.endpoints || []).filter(function (e) { return isStationEndpoint(e.resourceName); });
      const doorEps = stationEps.filter(function (e) { return isOccupancyDoor(e.resourceName); });
      const sidecarEps = stationEps.filter(function (e) { return !isOccupancyDoor(e.resourceName); });
      const station = inv.station;
      const stationPane = document.getElementById("station-pane");
      if (!station) {
        stationPane.innerHTML = "<p class='muted'>" + esc(inv.message || "no station") + "</p>";
      } else {
        var folded = sidecarEps.length
          ? "<details id='station-sidecars' class='fold'" + (sidecarsOpen ? " open" : "") +
            "><summary aria-label='hosts'>" + ICO.grid +
            "<span class='pane-title'>hosts</span></summary>" +
            doorRows(inv, sidecarEps) + "</details>"
          : "";
        stationPane.innerHTML =
          "<div class='station-listing'><div class='station-head'>" + lamp(readyOf(inv, station.id)) +
          kindMark("station") +
          "<div class='station-titles'><h2 id='station-heading'>station</h2>" +
          "<p class='station-id' title='" + esc(station.id) + "'>" + esc(station.id) + "</p></div>" +
          actsHtml(actionsInner(station.id, true, readyOf(inv, station.id))) + "</div>" +
          chipsHtml(inv) +
          "<div class='station-nest'>" + doorRows(inv, doorEps) + folded + "</div>" +
          capsHtml(inv.capabilities || [], capsOpen) +
          "</div>";
      }
      const yards = inv.yards || [];
      function yardSummaryRow(yard) {
        var camps = campsOf(inv, yard.id);
        var ids = [yard.id];
        camps.forEach(function (camp) {
          campRollupIds(inv, camp).forEach(function (id) { ids.push(id); });
        });
        managedOf(inv, yard.id).forEach(function (m) { ids.push(m.id); });
        var bindleCount = camps.reduce(function (sum, camp) {
          return sum + bindlesOf(inv, camp.id).length;
        }, 0);
        var running = ids.filter(function (id) { return readyOf(inv, id); }).length;
        return summaryRow(inv, {
          kind: "yard", id: yard.id,
          sums: countChip("camp", camps.length, "camps") + countChip("bindle", bindleCount, "bindles") +
            runningChip(running, ids.length) + sigsRollup(ids)
        });
      }
      const junctions = (inv.junctions || []).map(function (n) {
        return "<div class='row r-sum'>" + lamp(readyOf(inv, n.id)) + kindMark("junction") +
          "<span class='row-main'><span class='row-name mono' title='" + esc(n.id) + "'>" + esc(n.id) +
          "</span></span><span class='sums'></span>" +
          actsHtml(actionsInner(n.id, false, readyOf(inv, n.id))) + "</div>";
      }).join("");
      const yardIds = {};
      yards.forEach(function (y) { yardIds[y.id] = true; });
      const orphanCamps = (inv.camps || []).filter(function (c) { return !c.parentId || !yardIds[c.parentId]; });
      const orphans = orphanCamps.map(function (c) { return campSummaryRow(inv, c); }).join("");
      const board = junctions + yards.map(yardSummaryRow).join("") + orphans;
      document.getElementById("yards").innerHTML = board ||
        "<p class='empty'>no yards on this station yet — <code>hobo-code dev</code> lays one down</p>";
      const fleetPeers = inv.peers || [];
      document.getElementById("fleet").innerHTML =
        fleetPeers.map(function (n) {
          return "<div class='row r-sum'>" + lamp(true) + kindMark("station") +
            "<span class='row-main'><span class='row-name mono' title='" + esc(n.id) + "'>" +
            esc(n.id) + "</span></span><span class='sums'></span><span class='acts'></span></div>";
        }).join("");
    }
    function factsHtml(groups) {
      if (!groups || !groups.length) return "";
      return groups.map(function (group) {
        var plaque = "";
        if (group.facts && group.facts.length) {
          plaque += "<dl class='trust'>" + group.facts.map(function (f) {
            var state = f[2] ? " data-state='" + esc(f[2]) + "'" : "";
            return "<div" + state + "><dt>" + esc(f[0]) + "</dt><dd title='" +
              esc(f[1]) + "'>" + esc(f[1]) + "</dd></div>";
          }).join("") + "</dl>";
        }
        if (group.listHtml) plaque += group.listHtml;
        if (!plaque) return "";
        var body = group.fold
          ? "<details class='fact-fold'><summary>" + esc(group.title) + "</summary>" +
            plaque + "</details>"
          : (group.title ? groupCap(group.title) : "") + plaque;
        return "<div class='fact-group'>" + body + "</div>";
      }).join("");
    }
    function pushFact(facts, label, value, state) {
      if (value === undefined || value === null || value === "") return;
      facts.push(state ? [label, String(value), state] : [label, String(value)]);
    }
    function manifestResourceList(resources) {
      if (!resources || !resources.length) return "";
      return "<ul class='manifest-list'>" + resources.map(function (r) {
        var extra = "";
        if (r.dependsOn && r.dependsOn.length) {
          extra += "<span class='dep'>depends on " + esc(r.dependsOn.join(", ")) + "</span>";
        }
        if (r.allow && r.allow.length) {
          extra += "<span class='allow'>allow " + esc(r.allow.join(", ")) + "</span>";
        }
        return "<li><span class='mk'>" + esc(r.kind) + "</span><span class='mv'>" +
          esc(r.name) + extra + "</span></li>";
      }).join("") + "</ul>";
    }
    function detailFacts(inv, id, node, endpoint, managed) {
      var identity = [];
      var epMeta = [];
      var scope = [];
      var manifest = [];
      var listHtml = "";
      var snap = snapOf(inv, id);
      var rowManaged = managed || (inv.managed || []).find(function (m) { return m.id === id; });
      var kind = endpoint ? (endpoint.kind || "endpoint")
        : node ? node.kind
          : rowManaged ? rowManaged.kind : "";
      var displayName = (node && node.name) || (rowManaged && rowManaged.name) ||
        (endpoint && endpoint.resourceName) || "";
      pushFact(identity, "id", id);
      if (displayName && displayName !== id && ("bindle:" + displayName) !== id &&
          ("camp:" + displayName) !== id && ("yard:" + displayName) !== id) {
        pushFact(identity, "name", displayName);
      }
      pushFact(identity, "kind", kind);
      if (node && node.parentId) {
        pushFact(identity, "owner", node.parentId);
      } else if (rowManaged) {
        pushFact(identity, "owner", rowManaged.ownerId);
        pushFact(identity, "owner kind", rowManaged.ownerKind);
      }
      if (rowManaged && rowManaged.controllable === false) {
        pushFact(identity, "controllable", "no");
      }
      var status = endpoint ? endpoint.status : node ? node.status : "";
      pushFact(identity, "status", status,
        status === "serving" ? "verified" : status === "last-seen" ? "stale"
          : status === "unresolved" ? "missing" : undefined);
      var fidelity = endpoint ? endpoint.fidelity : node ? node.fidelity : "";
      pushFact(identity, "fidelity", fidelity);
      pushFact(identity, "scope", node && node.scopeLabel);
      if (snap && snap.provisioned !== undefined) {
        pushFact(identity, "provisioned", snap.provisioned ? "yes" : "no");
      }
      if (endpoint) {
        pushFact(epMeta, "mode", endpoint.mode);
        pushFact(epMeta, "freshness", endpoint.freshness,
          endpoint.freshness === "live" ? "verified"
            : endpoint.freshness === "last-seen" ? "stale" : undefined);
        pushFact(epMeta, "hostname", endpoint.hostname);
        if (endpoint.listenPort) pushFact(epMeta, "listen port", endpoint.listenPort);
        if (endpoint.resolvedAddresses && endpoint.resolvedAddresses.length) {
          pushFact(epMeta, "resolved", endpoint.resolvedAddresses.join(", "));
        }
        pushFact(epMeta, "unresolved", endpoint.unresolvedReason, "missing");
      }
      pushFact(scope, "env", (node && node.environment) || (inv.scope && inv.scope.environment));
      pushFact(scope, "tenant", inv.scope && inv.scope.tenant);
      pushFact(scope, "station", inv.scope && inv.scope.stationId);
      pushFact(scope, "project", inv.scope && inv.scope.project);
      pushFact(scope, "branch", inv.scope && inv.scope.branch);
      pushFact(scope, "rail", inv.scope && inv.scope.railHash);
      pushFact(scope, "occupancy", inv.scope && inv.scope.occupancyStatus);
      if (node && node.kind === "camp" && inv.camp &&
          (inv.camp.name === node.name || ("camp:" + inv.camp.name) === node.id)) {
        pushFact(manifest, "camp env", inv.camp.envType);
        if (inv.camp.require && inv.camp.require.length) {
          pushFact(manifest, "require", inv.camp.require.join(", "));
        }
        if (inv.camp.runtimeRequirements && inv.camp.runtimeRequirements.length) {
          pushFact(manifest, "runtime", inv.camp.runtimeRequirements.join(", "));
        }
        if (inv.camp.labels) {
          Object.keys(inv.camp.labels).forEach(function (key) {
            pushFact(manifest, "label." + key, inv.camp.labels[key]);
          });
        }
      }
      if (node && node.kind === "bindle" && inv.bindleManifest &&
          (inv.bindleManifest.name === node.name ||
            ("bindle:" + inv.bindleManifest.name) === node.id)) {
        var man = inv.bindleManifest;
        pushFact(manifest, "manifest", man.name);
        pushFact(manifest, "project dir", man.projectDir);
        if (man.requirements && man.requirements.length) {
          pushFact(manifest, "requirements", man.requirements.join(", "));
        }
        if (man.envKeys && man.envKeys.length) {
          pushFact(manifest, "env keys", man.envKeys.join(", "));
        }
        listHtml = manifestResourceList(man.resources);
      }
      if (inv.bindleManifest && inv.bindleManifest.resources) {
        var declName = endpoint ? endpoint.resourceName
          : rowManaged ? rowManaged.name : "";
        var decl = declName
          ? inv.bindleManifest.resources.find(function (r) { return r.name === declName; })
          : null;
        if (decl) {
          pushFact(manifest, "declared kind", decl.kind);
          if (decl.dependsOn && decl.dependsOn.length) {
            pushFact(manifest, "depends on", decl.dependsOn.join(", "));
          }
          if (decl.allow && decl.allow.length) {
            pushFact(manifest, "allow", decl.allow.join(", "));
          }
        }
      }
      if (inv.missing && inv.missing.length && node) {
        var miss = inv.missing.filter(function (m) { return m.kind === node.kind; });
        if (miss.length) {
          pushFact(identity, "missing", miss.map(function (m) { return m.reason; }).join("; "), "missing");
        }
      }
      return [
        { title: "identity", facts: identity, primary: true },
        { title: "endpoint", facts: epMeta, primary: true },
        { title: "scope", facts: scope, fold: true },
        { title: "manifest", facts: manifest, listHtml: listHtml, fold: true }
      ].filter(function (g) { return (g.facts && g.facts.length) || g.listHtml; });
    }
    function primaryFacts(groups) {
      return (groups || []).filter(function (g) { return g.primary; });
    }
    function foldedFacts(groups) {
      return (groups || []).filter(function (g) { return !g.primary; });
    }
    function telemetryTabs(id) {
      var tel = telemetry[id];
      var counts = { logs: tel ? tel.logs : 0, traces: tel ? tel.traces : 0, metrics: tel ? tel.metrics : 0 };
      function tabBtn(name) {
        var label = name + " (" + (counts[name] || 0) + ")";
        return "<button type='button' class='ico" + (detailTab === name ? " on" : "") +
          "' data-tab='" + name + "' aria-label='" + esc(label) + "' title='" + esc(label) +
          "' aria-pressed='" + (detailTab === name) + "'>" + ICO[name] + "</button>";
      }
      return "<div class='tel-head'>" + tabBtn("logs") + tabBtn("traces") + tabBtn("metrics") +
        "<span class='sig'>" + (counts[detailTab] || 0) + "</span></div><div id='tel-body'></div>";
    }
    async function fillTelemetry(id) {
      const body = document.getElementById("tel-body");
      if (!body) return;
      try {
        const tabData = await api("/api/resources/" + encodeURIComponent(id) + "/" + detailTab);
        const list = (tabData && tabData[detailTab]) || [];
        const recent = list.slice(-50).reverse();
        if (!recent.length) {
          body.innerHTML = "<p class='empty'>no " + esc(detailTab) + " yet</p>";
          return;
        }
        body.innerHTML = recent.map(function (row) {
          var when = String(row.time || row.startTime || "").slice(11, 19);
          if (detailTab === "logs") {
            return "<div class='tel-row'><span>" + esc(when) + "</span><span>" + esc(row.severity || "") +
              "</span><span title='" + esc(row.body || "") + "'>" + esc(row.body || "") + "</span></div>";
          }
          if (detailTab === "traces") {
            return "<div class='tel-row'><span>" + esc(when) + "</span><span>" + esc(row.name || "") +
              "</span><span title='" + esc(row.traceId || "") + "'>" + esc(row.traceId || "") + "</span></div>";
          }
          return "<div class='tel-row'><span>" + esc(when) + "</span><span>" + esc(row.name || "") +
            "</span><span>" + esc(row.value) + "</span></div>";
        }).join("");
      } catch (err) {
        body.innerHTML = "<p class='empty'>signals unavailable</p>";
      }
    }
    function scopeHead(inv, kind, id, locked) {
      var ready = readyOf(inv, id);
      return "<div class='detail-head'>" + lamp(ready) + kindMark(kind) +
        "<h2 title='" + esc(id) + "'>" + esc(id) + "</h2>" +
        actsHtml(actionsInner(id, locked === true, ready)) + "</div>";
    }
    function missingScope(detail) {
      detail.innerHTML = "<p class='empty'>nothing here — <a class='res-link' href='#/'>back to the station</a></p>";
    }
    async function renderYard(inv, yardId) {
      const detail = document.getElementById("detail");
      const yard = (inv.yards || []).find(function (y) { return y.id === yardId; });
      if (!yard) return missingScope(detail);
      const camps = campsOf(inv, yardId);
      const campsHtml = camps.length
        ? groupCap("camps") + camps.map(function (c) { return campSummaryRow(inv, c); }).join("")
        : "<p class='empty'>no camps on this yard yet — <code>hobo-code dev</code> pitches one</p>";
      const ownRows = managedOf(inv, yardId).map(function (m) {
        return resourceRow(inv, { id: m.id, kind: m.kind, locked: m.controllable === false });
      }).join("");
      const ownHtml = ownRows ? groupCap("resources") + theadHtml("resource") + ownRows : "";
      var yardFacts = detailFacts(inv, yardId, yard);
      detail.innerHTML = scopeHead(inv, "yard", yardId, false) +
        lifeStrap(inv, yardId) +
        factsHtml(primaryFacts(yardFacts)) +
        campsHtml + ownHtml +
        factsHtml(foldedFacts(yardFacts)) +
        telemetryTabs(yardId);
      await fillTelemetry(yardId);
    }
    async function renderCamp(inv, campId) {
      const detail = document.getElementById("detail");
      const camp = campById(inv, campId);
      if (!camp) return missingScope(detail);
      const bindles = bindlesOf(inv, campId);
      const bindlesHtml = bindles.length
        ? groupCap("bindles") + bindles.map(function (b) { return bindleSummaryRow(inv, b); }).join("")
        : "<p class='empty'>no bindles camped here yet — <code>hobo-code dev</code> rolls one out</p>";
      const ownRows = managedOf(inv, campId).filter(function (m) {
        return m.kind !== "bindle-resource";
      }).map(function (m) {
        return resourceRow(inv, { id: m.id, kind: m.kind, locked: m.controllable === false });
      }).join("");
      const ownHtml = ownRows ? groupCap("resources") + theadHtml("resource") + ownRows : "";
      var campFacts = detailFacts(inv, campId, camp);
      detail.innerHTML = scopeHead(inv, "camp", campId, campId === "camp:code") +
        lifeStrap(inv, campId) +
        factsHtml(primaryFacts(campFacts)) +
        bindlesHtml + ownHtml +
        factsHtml(foldedFacts(campFacts)) +
        telemetryTabs(campId);
      await fillTelemetry(campId);
    }
    async function renderBindle(inv, bindleId) {
      const detail = document.getElementById("detail");
      const bindle = bindleById(inv, bindleId);
      if (!bindle) return missingScope(detail);
      const names = bindleResourceIds(inv, bindle);
      const claimed = {};
      names.forEach(function (n) { claimed[n] = true; });
      var rows = names.map(function (name) {
        var endpoint = (inv.endpoints || []).find(function (e) { return e.resourceName === name; });
        var managed = (inv.managed || []).find(function (m) { return m.id === name; });
        var kind = endpoint ? (endpoint.kind || "endpoint") : managed ? managed.kind : "endpoint";
        return resourceRow(inv, {
          id: name, kind: kind,
          locked: managed ? managed.controllable === false : false,
          endpoint: endpoint
        });
      }).join("");
      (inv.endpoints || []).filter(function (e) {
        return !isStationEndpoint(e.resourceName) && !claimed[e.resourceName] &&
          !claimingBindle(inv, e.resourceName);
      }).forEach(function (e) {
        rows += resourceRow(inv, { id: e.resourceName, kind: e.kind || "endpoint", endpoint: e });
      });
      const rowsHtml = rows
        ? groupCap("resources") + theadHtml("resource") + rows
        : "<p class='empty'>this bindle declares no resources yet</p>";
      var bindleFacts = detailFacts(inv, bindleId, bindle);
      detail.innerHTML = scopeHead(inv, "bindle", bindleId, bindleId === "bindle:code") +
        lifeStrap(inv, bindleId) +
        factsHtml(primaryFacts(bindleFacts)) +
        rowsHtml +
        factsHtml(foldedFacts(bindleFacts)) +
        telemetryTabs(bindleId);
      await fillTelemetry(bindleId);
    }
    async function renderResource(inv, id) {
      const detail = document.getElementById("detail");
      const node = [].concat(inv.yards || [], inv.camps || [], inv.bindles || [], inv.junctions || [],
        inv.station ? [inv.station] : [], inv.peers || [])
        .find(function (n) { return n.id === id; });
      const managed = (inv.managed || []).find(function (m) { return m.id === id; });
      const endpoint = (inv.endpoints || []).find(function (e) { return e.resourceName === id; });
      const snap = snapOf(inv, id);
      if (!node && !managed && !endpoint && !snap) return missingScope(detail);
      const ready = snap && snap.ready;
      const kind = endpoint ? (endpoint.kind || "endpoint") : node ? node.kind : managed ? managed.kind : "endpoint";
      const locked = (node && (id === "camp:code" || id === "bindle:code")) ||
        (managed && managed.controllable === false) ||
        occupancyLocked(id);
      var epHtml = "";
      if (endpoint) {
        var named = namedUrl(endpoint);
        var listen = listenUrl(endpoint);
        var backend = endpoint.backendUrl || "";
        var lines = "";
        function epLine(label, url, cls) {
          if (!url) return "";
          var link = openable(url)
            ? "<a class='" + cls + "' href='" + esc(url) + "' target='_blank' rel='noopener noreferrer' title='" + esc(url) + "'>" + esc(url) + "</a>"
            : "<span class='" + cls + "' title='" + esc(url) + "'>" + esc(url) + "</span>";
          return "<span class='ep-line'><span class='ep-k'>" + esc(label) + "</span> " + link +
            copyBtn(url) + "</span>";
        }
        lines += epLine("named", named, "ep-link");
        if (listen && listen !== named) lines += epLine("listen", listen, "listen-link");
        if (backend && backend !== named && backend !== listen) {
          lines += epLine("backend", backend, "ep-link");
        }
        epHtml = "<div class='ep-detail'>" + lines + "</div>";
      }
      var groups = detailFacts(inv, id, node, endpoint, managed);
      detail.innerHTML =
        "<div class='detail-head'>" + lamp(ready) + kindMark(kind) +
        "<h2 title='" + esc(id) + "'>" + esc(id) + "</h2>" +
        actsHtml(actionsInner(id, locked === true, ready)) + "</div>" +
        lifeStrap(inv, id) +
        factsHtml(primaryFacts(groups)) + epHtml +
        factsHtml(foldedFacts(groups)) + telemetryTabs(id);
      await fillTelemetry(id);
    }
    render().catch(function (err) {
      showError(String(err));
    });
    window.addEventListener("hashchange", function () {
      render().catch(function () {});
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
			const live =
				endpoint.freshness === "live" && endpoint.status === "serving";
			lifecycle.register({
				id: endpoint.resourceName,
				kind: endpoint.kind,
				provisioned: true,
				initiallyStarted: occupancy ? enabled && live : live,
				...(!mesh && live ? { healthUrl: endpoint.backendUrl } : {}),
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
