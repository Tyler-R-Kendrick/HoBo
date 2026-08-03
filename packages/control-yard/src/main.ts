/**
 * Browser entry — the ONLY module that instantiates Phaser.Game (ADR-0140).
 * Everything else is the headless library: engine + presenter + client + seam.
 * Bundled by esbuild to public/dist/yard.js.
 */

import type { YardProjectionSnapshot } from "@hobo/management";
import Phaser from "phaser";
import type { AssetIndex } from "./assets-index-core.js";
import { createDomOverlay, displaySheetForZone } from "./dom-overlay.js";
import { YARD_LAYOUT, type ZoneId, zoneAnchor } from "./layout.js";
import { createYardClient } from "./net/yard-client.js";
import { yardPhaserConfig } from "./phaser/game-config.js";
import { PreloadScene, type YardHost, YardScene } from "./phaser/scenes.js";
import {
	presentYard,
	type RenderModel,
	resolveBoTransitAnim,
} from "./phaser/yard-presenter.js";
import { SCENARIOS } from "./scenarios/index.js";
import { describeYardSceneLoad } from "./scenes/yard-scene.js";
import {
	createTestSeam,
	isTestMode,
	seededRandom,
	type YardTestEntity,
	type YardTestFx,
	type YardTestHost,
	type YardTheme,
} from "./test-seam.js";
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
let assetsReady = false;
let speech = "";
let speechRemaining = 0;
let lastError = "";
let loadedImageKeys = new Set<string>();
let scenarioState: { id: string; tick: number } | null = null;
let theme: YardTheme = "day";
const recentFx: YardTestFx[] = [];
const RECENT_FX_MAX = 32;

function recordFx(fx: string): void {
	recentFx.push({ fx, atFrame: seam.frameCount });
	if (recentFx.length > RECENT_FX_MAX) recentFx.shift();
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

function applySnapshot(next: YardProjectionSnapshot): void {
	snap = next;
	engine.applySnapshot(next);
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
	applySnapshot(scenario.snapshotAt(0));
}

function advanceToTick(n: number): void {
	if (!scenarioState) return;
	const scenario = SCENARIOS[scenarioState.id];
	if (!scenario) return;
	const target = Math.min(Math.max(0, Math.floor(n)), scenario.totalTicks);
	while (scenarioState.tick < target) {
		scenarioState.tick += 1;
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
	return entities;
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
	overlay.openSheet(displaySheetForZone(zone, snap));
	document.body.dataset.lastClickZone = zone;
}

function tick(dtSec: number): void {
	engine.tick(dtSec);
	if (speechRemaining > 0) speechRemaining -= dtSec;
}

function renderModel(): RenderModel {
	return presentYard({
		visual: engine.visual,
		boPos: engine.boPos,
		boAnimationId: currentBoAnim(),
		zone: currentZone(),
		selectedZone: engine.selectedZone,
		speech: speechRemaining > 0 && speech ? speech : null,
		particles: engine.particles,
		testMode: TEST_MODE,
		ready: assetsReady,
		hasImage: (key) => loadedImageKeys.has(key),
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
	getScenario: () => scenarioState?.id ?? null,
	getTick: () => scenarioState?.tick ?? 0,
	getEntities: () => currentEntities(),
	getRecentFx: () => [...recentFx],
};

const seam = createTestSeam(testHost);
seam.seed = TEST_MODE ? TEST_SEED : null;
(window as unknown as { __TEST__: typeof seam }).__TEST__ = seam;

async function boot(): Promise<void> {
	const res = await fetch(`${ASSET_BASE}/assets_index.json`);
	const index = (await res.json()) as AssetIndex;
	const manifest = describeYardSceneLoad(index, ASSET_BASE);
	loadedImageKeys = new Set(manifest.images.map((i) => i.key));

	const host: YardHost = {
		manifest,
		getRenderModel: renderModel,
		onUpdate: (dtMs) => {
			if (!TEST_MODE) tick(Math.min(0.05, dtMs / 1000));
		},
		onZoneClick: (zone) => selectZone(zone),
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
}

void boot().catch((err) => {
	overlay.setStatus(`boot failed: ${(err as Error).message ?? err}`);
	console.error(err);
});
