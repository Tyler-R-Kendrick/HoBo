/**
 * playwright-testing seam: readiness + serializable state + commands.
 * Never expose raw engine objects.
 */
import type { YardProjectionSnapshot } from "@hobo/management";
import type { YardVisualState } from "./entity-state.js";
import type { ZoneId } from "./layout.js";

export type YardTheme = "day" | "night";

export type YardTestEntity = Readonly<{
	id: string;
	/** Semantic sprite id (`operator.<state>` / `villager.<state>`). */
	sprite: string;
	x: number;
	y: number;
}>;

export type YardTestFx = Readonly<{
	fx: string;
	atFrame: number;
}>;

export type YardTestWorld = Readonly<{
	campCount: number;
	characterCount: number;
	demo: boolean;
}>;

export type YardTestState = Readonly<{
	scene: string;
	ready: boolean;
	seed: number | null;
	frameCount: number;
	zone: ZoneId | null;
	/** Zone under the lantern (pointer hover); null when nothing is inspected. */
	hoveredZone: ZoneId | null;
	/** The Operator: attention position + semantic state (no clip ids). */
	bo: { x: number; y: number; state: string; facing: string };
	occupyMode: string | null;
	connCount: number;
	trafficRate: number;
	bootstrapActive: boolean;
	sheetOpen: boolean;
	sheetKind: string | null;
	seq: number | null;
	hazards: readonly string[];
	waybillCount: number;
	highball: boolean;
	theme: YardTheme;
	/** True when the OS asks for reduced motion — the yard stills itself. */
	reducedMotion: boolean;
	scenario: string | null;
	tick: number;
	entities: readonly YardTestEntity[];
	recentFx: readonly YardTestFx[];
	world: YardTestWorld | null;
}>;

export type YardTestCommands = Readonly<{
	reset: () => void;
	seed: (n: number) => void;
	selectZone: (zone: ZoneId) => void;
	/** Raise/lower the lantern truth card without a real pointer. */
	hoverZone: (zone: ZoneId | null) => void;
	dismissSheet: () => void;
	runAction: (action: string) => Promise<void>;
	advanceFrame: (dtMs?: number) => void;
	loadScenario: (id: string) => void;
	advanceToTick: (n: number) => void;
	setTheme: (theme: YardTheme) => void;
}>;

export type YardTestSeam = {
	/** Ids of everything currently rendered — lets tests assert that a
	 *  mechanic's art is actually reachable rather than merely shipped. */
	renderIds: () => readonly string[];
	ready: boolean;
	seed: number | null;
	sceneKey: string;
	frameCount: number;
	state: () => YardTestState;
	commands: YardTestCommands;
};

export type YardTestHost = {
	getBo: () => { x: number; y: number; state: string; facing: string };
	getZone: () => ZoneId | null;
	getSnap: () => YardProjectionSnapshot | null;
	getVisual: () => YardVisualState | null;
	isSheetOpen: () => boolean;
	sheetKind: () => string | null;
	selectZone: (zone: ZoneId) => void;
	hoverZone: (zone: ZoneId | null) => void;
	getHoveredZone: () => ZoneId | null;
	dismissSheet: () => void;
	runAction: (action: string) => Promise<void>;
	reset: () => void;
	advanceFrame: (dtMs: number) => void;
	setSeed: (n: number) => void;
	loadScenario: (id: string) => void;
	advanceToTick: (n: number) => void;
	setTheme: (theme: YardTheme) => void;
	getTheme: () => YardTheme;
	getReducedMotion: () => boolean;
	getRenderIds: () => readonly string[];
	getWaybillCount: () => number;
	getHighball: () => boolean;
	getScenario: () => string | null;
	getTick: () => number;
	getEntities: () => readonly YardTestEntity[];
	getRecentFx: () => readonly YardTestFx[];
	getWorldSummary: () => YardTestWorld | null;
};

export function createTestSeam(host: YardTestHost): YardTestSeam {
	const seam: YardTestSeam = {
		ready: false,
		seed: null,
		sceneKey: "Yard",
		frameCount: 0,
		renderIds: () => host.getRenderIds(),
		state: () => {
			const snap = host.getSnap();
			const bo = host.getBo();
			return Object.freeze({
				scene: seam.sceneKey,
				ready: seam.ready,
				seed: seam.seed,
				frameCount: seam.frameCount,
				zone: host.getZone(),
				hoveredZone: host.getHoveredZone(),
				bo: Object.freeze({ ...bo }),
				occupyMode: snap?.occupyMode ?? null,
				connCount: snap?.connections.length ?? 0,
				trafficRate: snap?.metering.trafficRate ?? 0,
				bootstrapActive: snap?.occupancy.bootstrapActive ?? false,
				sheetOpen: host.isSheetOpen(),
				sheetKind: host.sheetKind(),
				seq: snap?.seq ?? null,
				hazards: Object.freeze([...(snap?.doctor.hazards ?? [])]),
				waybillCount: host.getWaybillCount(),
				highball: host.getHighball(),
				theme: host.getTheme(),
				reducedMotion: host.getReducedMotion(),
				scenario: host.getScenario(),
				tick: host.getTick(),
				entities: Object.freeze(
					host.getEntities().map((e) => Object.freeze({ ...e })),
				),
				recentFx: Object.freeze(
					host.getRecentFx().map((f) => Object.freeze({ ...f })),
				),
				world: ((w) => (w ? Object.freeze({ ...w }) : null))(
					host.getWorldSummary(),
				),
			});
		},
		commands: {
			reset: () => host.reset(),
			seed: (n: number) => {
				host.setSeed(n);
				seam.seed = n;
			},
			selectZone: (zone) => host.selectZone(zone),
			hoverZone: (zone) => host.hoverZone(zone),
			dismissSheet: () => host.dismissSheet(),
			runAction: (action) => host.runAction(action),
			advanceFrame: (dtMs = 16.67) => {
				host.advanceFrame(dtMs);
				seam.frameCount += 1;
			},
			loadScenario: (id) => host.loadScenario(id),
			advanceToTick: (n) => host.advanceToTick(n),
			setTheme: (theme) => host.setTheme(theme),
		},
	};
	return seam;
}

/** Mulberry32 seeded RNG for deterministic particle placement. */
export function seededRandom(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

type TestMode = {
	testMode: boolean;
	seed: number;
	scenario: string | null;
};

export function isTestMode(search = ""): TestMode {
	const params = new URLSearchParams(
		search.startsWith("?") ? search.slice(1) : search,
	);
	const testMode = params.has("test") || params.get("test") === "1";
	const seed = Number(params.get("seed") || "42");
	const scenario = params.get("scenario");
	return {
		testMode,
		seed: Number.isFinite(seed) ? seed : 42,
		scenario: scenario && scenario.length > 0 ? scenario : null,
	};
}
