/**
 * Browser entry — the ONLY module that instantiates Phaser.Game (ADR-0140).
 * Everything else is the headless library: engine + presenter + client + seam.
 * Bundled by esbuild to public/dist/yard.js.
 */

import type { YardProjectionSnapshot } from "@hobo/management";
import type { WorldState } from "@hobo/yard-world";
import Phaser from "phaser";
import type { AssetIndex } from "./assets-index-core.js";
import { createYardAudio, cueForFx, type YardAudio } from "./audio.js";
import {
	createDomOverlay,
	displaySheetForWaybill,
	displaySheetForZone,
	dockForZone,
} from "./dom-overlay.js";
import { detectRecentSuccess } from "./entity-state.js";
import { YARD_LAYOUT, type ZoneId, zoneAnchor, zoneAt } from "./layout.js";
import { createWorldClient } from "./net/world-client.js";
import { createYardClient } from "./net/yard-client.js";
import { yardPhaserConfig } from "./phaser/game-config.js";
import { PreloadScene, type YardHost, YardScene } from "./phaser/scenes.js";
import {
	presentYard,
	type RenderModel,
	resolveBoTransitAnim,
} from "./phaser/yard-presenter.js";
import { SCENARIOS } from "./scenarios/index.js";
import { scenarioWorld } from "./scenarios/world-fixture.js";
import { describeYardSceneLoad } from "./scenes/yard-scene.js";
import {
	createTestSeam,
	isTestMode,
	seededRandom,
	type YardTestEntity,
	type YardTestFx,
	type YardTestHost,
	type YardTestWorld,
	type YardTheme,
} from "./test-seam.js";
import { anyDerailed, deriveTrains, type TrainView } from "./trains.js";
import {
	createSpikeLedger,
	deriveWaybills,
	isHighball,
	type Waybill,
	waybillForZone,
} from "./waybills.js";
import { toWorldView, type WorldView } from "./world-view.js";
import { createYardEngine, selectZoneWithSnapshot } from "./yard-engine.js";

const params = new URLSearchParams(location.search);
const API = params.get("api") || "http://127.0.0.1:8790";
const ASSET_BASE = params.get("assets") || "/assets";
const {
	testMode: TEST_MODE,
	seed: TEST_SEED,
	scenario: SCENARIO_PARAM,
} = isTestMode(location.search);
const SCENARIO_MODE = SCENARIO_PARAM !== null && SCENARIO_PARAM in SCENARIOS;

let rng = seededRandom(TEST_SEED);
if (TEST_MODE) {
	Math.random = () => rng();
}

const engine = createYardEngine();
const client = createYardClient({ apiBase: API });

let snap: YardProjectionSnapshot | null = null;
/** Bo jumps for ~2s after a rail activates / a connection authorizes. */
let successRemaining = 0;
let worldView: WorldView | null = null;
let worldDemo = false;
let assetsReady = false;
let speech = "";
let speechRemaining = 0;
let lastError = "";
let loadedImageKeys = new Set<string>();
let scenarioState: { id: string; tick: number } | null = null;
let theme: YardTheme = "day";
let waybills: readonly Waybill[] = [];
let trains: readonly TrainView[] = [];
let audio: YardAudio | null = null;
let highball = false;
/** Lantern inspect: the zone under the pointer. Reads are zero-friction. */
let hoveredZone: ZoneId | null = null;

function setHoveredZone(zone: ZoneId | null): void {
	if (hoveredZone === zone) return;
	hoveredZone = zone;
	document.body.dataset.hoverZone = zone ?? "";
}
const spikes = createSpikeLedger();
const recentFx: YardTestFx[] = [];
const RECENT_FX_MAX = 32;

function recordFx(fx: string): void {
	recentFx.push({ fx, atFrame: seam.frameCount });
	if (recentFx.length > RECENT_FX_MAX) recentFx.shift();
	const cue = cueForFx(fx);
	if (cue) audio?.play(cue);
}

function setSpeech(text: string, seconds: number): void {
	speech = text;
	speechRemaining = seconds;
	recordFx(text);
}

const overlay = createDomOverlay({
	doc: document,
	client,
	instantStream: TEST_MODE,
	onConfirmed: (message) => {
		setSpeech(message, 2);
		engine.dismissSheet();
		void refreshSnapshot();
	},
	onStamped: (waybill) => {
		recordFx(`stamp:${waybill.kind}`);
		setSpeech("Stamped.", 2);
		engine.dismissSheet();
		void refreshSnapshot();
	},
	onSpiked: (waybillId) => {
		recordFx(`spike:${waybillId}`);
		spikes.spike(waybillId);
		recomputeWaybills();
		engine.dismissSheet();
		if (snap) engine.applySnapshot(snap);
	},
	onDismissed: () => {
		engine.dismissSheet();
		if (snap) engine.applySnapshot(snap);
	},
	onAction: (message) => {
		setSpeech(message, 2.5);
		void refreshSnapshot();
	},
	onActionError: (message) => {
		setSpeech(message, 3);
		overlay.setStatus(message);
	},
});

function setWorld(world: WorldState | null, demo: boolean): void {
	worldDemo = demo;
	worldView = toWorldView(world, demo);
	const b = document.body.dataset;
	b.worldChars = String(worldView?.characters.length ?? 0);
	b.demo = demo || SCENARIO_MODE ? "1" : "0";
}

/** Re-derive the waybill desk (spike-filtered) + Highball from the snapshot. */
function recomputeWaybills(): void {
	if (!snap) return;
	waybills = Object.freeze(spikes.filter(deriveWaybills(snap)));
	// A steaming car (needs-reauth) hisses, rate-limited by the audio layer.
	if (snap.connections.some((c) => String(c.status) === "needs-reauth")) {
		recordFx("needs-reauth");
	}
	const wasHighball = highball;
	highball = isHighball(snap, waybills);
	// The whistle marks the *transition* to a clean board, not the state.
	if (highball && !wasHighball) recordFx("highball");
	const b = document.body.dataset;
	b.waybills = String(waybills.length);
	b.highball = highball ? "1" : "0";
}

function applySnapshot(next: YardProjectionSnapshot): void {
	if (detectRecentSuccess(snap, next)) successRemaining = 2;
	spikes.onSeq(next.seq);
	snap = next;
	recomputeWaybills();
	maybeShowNewsreel(next);
	engine.applySnapshot(
		next,
		successRemaining > 0 ? { recentSuccess: true } : undefined,
	);
	overlay.updatePills(next);
	lastError = "";
	const b = document.body.dataset;
	b.yardReady = "1";
	b.boAnim = currentBoAnim();
	b.zone = currentZone();
	b.connCount = String(next.connections.length);
	b.traffic = String(next.metering.trafficRate);
	b.bootstrap = String(Boolean(next.occupancy.bootstrapActive));
}

// --- shift newsreel: "SINCE YOUR LAST SHIFT—" (coarse deltas, skippable) ---
const NEWSREEL_SEQ_KEY = "hobo-yard-last-seq";
const NEWSREEL_SUMMARY_KEY = "hobo-yard-last-shift";
let newsreelDone = false;

type ShiftSummary = {
	seq: number;
	rails: number;
	connections: number;
	activeConnections: number;
};

function shiftSummary(s: YardProjectionSnapshot): ShiftSummary {
	return {
		seq: s.seq,
		rails: s.rails.length,
		connections: s.connections.length,
		activeConnections: s.connections.filter(
			(c) => String(c.status) === "active",
		).length,
	};
}

function storeShift(): void {
	if (!snap) return;
	try {
		localStorage.setItem(NEWSREEL_SEQ_KEY, String(snap.seq));
		localStorage.setItem(
			NEWSREEL_SUMMARY_KEY,
			JSON.stringify(shiftSummary(snap)),
		);
	} catch {
		/* storage unavailable — the newsreel is optional chrome */
	}
}

function newsreelLines(
	next: YardProjectionSnapshot,
	lastSeq: number,
	last: Partial<ShiftSummary> | null,
): string[] {
	const lines: string[] = [];
	const now = shiftSummary(next);
	if (typeof last?.rails === "number" && now.rails !== last.rails) {
		lines.push(`RAILS: ${last.rails} → ${now.rails}`);
	}
	if (
		typeof last?.connections === "number" &&
		now.connections !== last.connections
	) {
		lines.push(`CONNECTIONS: ${last.connections} → ${now.connections}`);
	}
	if (
		typeof last?.activeConnections === "number" &&
		now.activeConnections !== last.activeConnections
	) {
		lines.push(
			`AUTHORIZED: ${last.activeConnections} → ${now.activeConnections}`,
		);
	}
	if (next.seq > lastSeq) lines.push(`SEQ: ${lastSeq} → ${next.seq}`);
	if (next.doctor.hazards.length > 0) {
		lines.push(`HAZARDS NOW: ${next.doctor.hazards.join(", ")}`);
	}
	// Reality is the level designer: quiet only when the board really is quiet.
	if (lines.length === 0) lines.push("ALL QUIET");
	return lines;
}

function maybeShowNewsreel(next: YardProjectionSnapshot): void {
	if (newsreelDone) return;
	newsreelDone = true;
	// Deterministic evidence: hidden in test mode unless explicitly requested.
	if ((TEST_MODE || SCENARIO_MODE) && params.get("newsreel") !== "1") return;
	let lastSeq: number | null = null;
	let last: Partial<ShiftSummary> | null = null;
	try {
		const rawSeq = localStorage.getItem(NEWSREEL_SEQ_KEY);
		lastSeq = rawSeq === null ? null : Number(rawSeq);
		const rawSummary = localStorage.getItem(NEWSREEL_SUMMARY_KEY);
		last = rawSummary
			? (JSON.parse(rawSummary) as Partial<ShiftSummary>)
			: null;
	} catch {
		return;
	}
	if (lastSeq === null || !Number.isFinite(lastSeq)) {
		// First shift ever — nothing to report; just start the ledger.
		storeShift();
		return;
	}
	const reel = document.getElementById("newsreel");
	const list = document.getElementById("newsreel-list");
	if (!reel || !list) return;
	list.innerHTML = "";
	for (const line of newsreelLines(next, lastSeq, last)) {
		const li = document.createElement("li");
		li.textContent = line;
		list.appendChild(li);
	}
	reel.hidden = false;
}

// The Yard office drawer holds the CLI-duplicating chrome (status pills +
// action strip). It ships collapsed; test/scenario runs force it open so
// evidence tours can click `#actions button` (a closed <details> is inert).
if (TEST_MODE || SCENARIO_MODE) {
	document.getElementById("dev-drawer")?.setAttribute("open", "");
}

document.getElementById("newsreel-skip")?.addEventListener("click", () => {
	const reel = document.getElementById("newsreel");
	if (reel) reel.hidden = true;
	storeShift();
});
window.addEventListener("beforeunload", () => storeShift());

async function refreshSnapshot(): Promise<void> {
	try {
		applySnapshot(await client.snapshot());
	} catch (err) {
		lastError = String((err as Error).message ?? err);
		overlay.setStatus(`api error: ${lastError}`);
	}
}

function loadScenario(id: string): void {
	const scenario = SCENARIOS[id];
	if (!scenario) {
		overlay.setStatus(`unknown scenario: ${id}`);
		return;
	}
	scenarioState = { id, tick: 0 };
	rng = seededRandom(scenario.seed);
	if (TEST_MODE) Math.random = () => rng();
	// Scenario mode: deterministic local world fixture — never contact the API.
	setWorld(scenarioWorld(scenario.seed, 0), true);
	applySnapshot(scenario.snapshotAt(0));
}

function advanceToTick(n: number): void {
	if (!scenarioState) return;
	const scenario = SCENARIOS[scenarioState.id];
	if (!scenario) return;
	const target = Math.min(Math.max(0, Math.floor(n)), scenario.totalTicks);
	while (scenarioState.tick < target) {
		scenarioState.tick += 1;
		setWorld(scenarioWorld(scenario.seed, scenarioState.tick), true);
		applySnapshot(scenario.snapshotAt(scenarioState.tick));
		tick(1 / scenario.ticksPerSecond);
	}
}

function setTheme(next: YardTheme): void {
	theme = next;
	document.body.dataset.theme = next;
}

function currentEntities(): readonly YardTestEntity[] {
	const entities: YardTestEntity[] = [
		{
			id: "bo",
			animationId: currentBoAnim(),
			x: Math.round(engine.boPos.x),
			y: Math.round(engine.boPos.y),
		},
	];
	const visual = engine.visual;
	if (visual?.connections.some((c) => c.visual === "authorized")) {
		const bay = zoneAnchor("connectionBay");
		entities.push({
			id: "guest-swe-claude",
			animationId: "guest.swe-claude.work",
			x: bay.x,
			y: bay.y,
		});
	}
	for (const ch of worldView?.characters ?? []) {
		entities.push({
			id: ch.id,
			animationId: ch.animationId,
			x: ch.x,
			y: ch.y,
		});
	}
	return entities;
}

function currentWorldSummary(): YardTestWorld | null {
	if (!worldView) return null;
	return {
		campCount: worldView.camps.length,
		characterCount: worldView.characters.length,
		demo: worldDemo || SCENARIO_MODE,
	};
}

function currentZone(): ZoneId {
	return engine.visual?.bo.zone ?? "platformRest";
}

function currentBoAnim(): string {
	const projectionAnim = engine.visual?.bo.animationId ?? "bo.idle";
	return resolveBoTransitAnim(
		engine.boPos,
		zoneAnchor(currentZone()),
		projectionAnim,
	);
}

function selectZone(zone: ZoneId): void {
	if (snap) {
		selectZoneWithSnapshot(engine, zone, snap);
	} else {
		engine.selectZone(zone);
	}
	setSpeech(YARD_LAYOUT.zones[zone].label, TEST_MODE ? 0 : 1.5);
	// The gate is the game: a zone with a live waybill opens that waybill;
	// otherwise the legacy inspect/generative sheet.
	const waybill = waybillForZone(zone, waybills);
	overlay.openSheet(
		waybill ? displaySheetForWaybill(waybill) : displaySheetForZone(zone, snap),
		dockForZone(zone),
	);
	document.body.dataset.lastClickZone = zone;
}

function tick(dtSec: number): void {
	engine.tick(dtSec);
	if (speechRemaining > 0) speechRemaining -= dtSec;
	if (successRemaining > 0) {
		successRemaining -= dtSec;
		// Jump window over: fall through to the steady-state projection clip.
		if (successRemaining <= 0 && snap) engine.applySnapshot(snap);
	}
}

function renderModel(): RenderModel {
	return presentYard({
		visual: engine.visual,
		boPos: engine.boPos,
		boAnimationId: currentBoAnim(),
		zone: currentZone(),
		selectedZone: engine.selectedZone,
		hoveredZone,
		speech: speechRemaining > 0 && speech ? speech : null,
		particles: engine.particles,
		testMode: TEST_MODE,
		ready: assetsReady,
		hasImage: (key) => loadedImageKeys.has(key),
		world: worldView,
		scenarioMode: SCENARIO_MODE,
		waybills,
		trains,
		highball,
	});
}

const testHost: YardTestHost = {
	getBo: () => ({
		x: Math.round(engine.boPos.x),
		y: Math.round(engine.boPos.y),
		animationId: currentBoAnim(),
		facing: engine.visual?.bo.facing ?? "east",
	}),
	getZone: () => currentZone(),
	getSnap: () => snap,
	getVisual: () => engine.visual,
	isSheetOpen: () => overlay.sheetOpen(),
	sheetKind: () => overlay.sheetKind(),
	selectZone: (zone) => selectZone(zone),
	hoverZone: (zone) => setHoveredZone(zone),
	getHoveredZone: () => hoveredZone,
	dismissSheet: () => {
		overlay.closeSheet();
		engine.dismissSheet();
		if (snap) engine.applySnapshot(snap);
	},
	runAction: async (action) => {
		try {
			const message = await client.runAction(
				action as Parameters<typeof client.runAction>[0],
			);
			setSpeech(message, 2.5);
		} catch (err) {
			const message = String((err as Error).message ?? err);
			setSpeech(message, 3);
			overlay.setStatus(message);
		}
		await refreshSnapshot();
	},
	reset: () => {
		setHoveredZone(null);
		engine.boPos = {
			x: YARD_LAYOUT.zones.platformRest.anchorX,
			y: YARD_LAYOUT.zones.platformRest.anchorY,
		};
		engine.dismissSheet();
		overlay.closeSheet();
		speech = "";
		speechRemaining = 0;
		if (snap) engine.applySnapshot(snap);
		rng = seededRandom(TEST_SEED);
		if (TEST_MODE) Math.random = () => rng();
	},
	advanceFrame: (dtMs) => {
		tick(dtMs / 1000);
	},
	setSeed: (n) => {
		rng = seededRandom(n);
		if (TEST_MODE) Math.random = () => rng();
	},
	loadScenario: (id) => loadScenario(id),
	advanceToTick: (n) => advanceToTick(n),
	setTheme: (next) => setTheme(next),
	getTheme: () => theme,
	getWaybillCount: () => waybills.length,
	getHighball: () => highball,
	getScenario: () => scenarioState?.id ?? null,
	getTick: () => scenarioState?.tick ?? 0,
	getEntities: () => currentEntities(),
	getRecentFx: () => [...recentFx],
	getWorldSummary: () => currentWorldSummary(),
};

const seam = createTestSeam(testHost);
seam.seed = TEST_MODE ? TEST_SEED : null;
(window as unknown as { __TEST__: typeof seam }).__TEST__ = seam;

/** Mute toggle lives in the dev drawer beside the other chrome. */
function wireMuteControl(): void {
	const btn = document.getElementById("mute-toggle");
	if (!(btn instanceof HTMLButtonElement)) return;
	const paint = () => {
		const muted = audio?.muted() ?? true;
		btn.textContent = muted ? "sound off" : "sound on";
		btn.setAttribute("aria-pressed", muted ? "false" : "true");
	};
	paint();
	btn.addEventListener("click", () => {
		if (!audio) return;
		audio.unlock();
		audio.setMuted(!audio.muted());
		paint();
	});
}

async function boot(): Promise<void> {
	const res = await fetch(`${ASSET_BASE}/assets_index.json`);
	const index = (await res.json()) as AssetIndex;
	const manifest = describeYardSceneLoad(index, ASSET_BASE);
	loadedImageKeys = new Set(manifest.images.map((i) => i.key));
	// Evidence and scenario runs stay silent so captures are deterministic.
	audio = createYardAudio({
		index,
		assetBaseUrl: ASSET_BASE,
		enabled: !TEST_MODE,
	});
	// Autoplay policy + courtesy: nothing sounds until a real gesture.
	for (const ev of ["pointerdown", "keydown"] as const) {
		window.addEventListener(ev, () => audio?.unlock(), { once: true });
	}
	wireMuteControl();

	const host: YardHost = {
		manifest,
		getRenderModel: renderModel,
		onUpdate: (dtMs) => {
			if (!TEST_MODE) tick(Math.min(0.05, dtMs / 1000));
		},
		onZoneClick: (zone) => selectZone(zone),
		onPointerMove: (x, y) => setHoveredZone(zoneAt(x, y)),
		onSceneReady: () => {
			assetsReady = true;
			document.body.dataset.assetsReady = "1";
			if (SCENARIO_MODE && SCENARIO_PARAM) {
				loadScenario(SCENARIO_PARAM);
				overlay.setStatus(`scenario: ${SCENARIO_PARAM}`);
			} else {
				overlay.setStatus("assets ready · contacting API…");
			}
		},
		onFrame: () => {
			seam.frameCount += 1;
			const b = document.body.dataset;
			b.boX = String(Math.round(engine.boPos.x));
			b.boY = String(Math.round(engine.boPos.y));
			b.boAnim = currentBoAnim();
			b.zone = currentZone();
			if (!seam.ready && assetsReady && snap && seam.frameCount >= 2) {
				seam.ready = true;
				b.testReady = "1";
			}
		},
	};

	const config = {
		...yardPhaserConfig({
			parent: "yard",
			testMode: TEST_MODE,
			backgroundColor: "#ffffff",
		}),
		type: Phaser.AUTO,
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
			parent: "yard",
			width: YARD_LAYOUT.width,
			height: YARD_LAYOUT.height,
		},
		scene: [new PreloadScene(host), new YardScene(host)],
	} as Phaser.Types.Core.GameConfig;

	new Phaser.Game(config);

	overlay.setStatus("booting…");
	if (SCENARIO_MODE) {
		// Scenario snapshots are the data source — never contact the API.
		return;
	}
	await refreshSnapshot();
	if (!TEST_MODE && (lastError || !snap)) {
		try {
			await client.runAction("init");
			await client.runAction("up");
			await refreshSnapshot();
		} catch {
			/* station may already exist */
		}
	}
	client.subscribe(
		(next) => applySnapshot(next),
		(message) => {
			lastError = message;
			overlay.setStatus(`api error: ${message}`);
		},
		{ pollMs: TEST_MODE ? 2000 : 800 },
	);
	// Train traffic: the deployment saga on the rail. Polled rather than
	// streamed — sagas move on deploy timescales, not frame timescales.
	let wasDerailed = false;
	const refreshTrains = () => {
		void client.deployments().then((view) => {
			trains = Object.freeze(deriveTrains(view));
			document.body.dataset.trains = String(trains.length);
			// A derail is the loudest event; sound it once per occurrence.
			const derailed = anyDerailed(trains);
			if (derailed && !wasDerailed) recordFx("derail");
			wasDerailed = derailed;
		});
	};
	refreshTrains();
	setInterval(refreshTrains, TEST_MODE ? 5000 : 3000);

	// World model (camps + bindlebug NPCs) — control-api /v1/world stream.
	const worldClient = createWorldClient({ apiBase: API });
	worldClient.subscribe(
		(world, demo) => setWorld(world, demo),
		() => {
			/* world stream is optional — the yard renders without it */
		},
		{ pollMs: TEST_MODE ? 2000 : 1000 },
	);
}

void boot().catch((err) => {
	overlay.setStatus(`boot failed: ${(err as Error).message ?? err}`);
	console.error(err);
});
