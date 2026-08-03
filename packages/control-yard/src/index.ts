export {
	type AnimationDef,
	type AssetIndex,
	allAssetPaths,
	animationFrameList,
	assetsRoot,
	expectedSheetPixelSize,
	frameCount,
	type ImageDef,
	loadAssetIndex,
	phaserSpritesheetConfigs,
	resolveAnimation,
	type SpritesheetDef,
	sheetAbsolutePath,
} from "./assets-index.js";
export {
	type DisplaySheet,
	displaySheetForZone,
} from "./dom-overlay.js";
export {
	type BoAnimState,
	type ConnectionVisualState,
	deriveYardVisualState,
	type GuestVisualState,
	type RailVisualState,
	stepToward,
	type YardVisualState,
} from "./entity-state.js";
export {
	type Layout,
	YARD_HEIGHT,
	YARD_LAYOUT,
	YARD_WIDTH,
	type ZoneId,
	type ZoneLayout,
	zoneAnchor,
	zoneAt,
} from "./layout.js";
export {
	type ConfirmOp,
	createYardClient,
	type YardAction,
	type YardClient,
} from "./net/yard-client.js";
export {
	confirmSheet,
	type GenerativeSheet,
	type SheetConfirmHandlers,
	type SheetKind,
	sheetForConnectionAuthorize,
	sheetForConnectionCreate,
	sheetForCostBooth,
	sheetForDoctor,
	sheetForRailLifecycle,
	streamSheet,
} from "./openui/sheets.js";
export {
	type BootSceneDeps,
	buildBootLoadPlan,
} from "./phaser/boot-scene.js";
export {
	type YardGameConfigOptions,
	yardPhaserConfig,
} from "./phaser/game-config.js";
export {
	type PresenterInput,
	presentYard,
	type RenderItem,
	type RenderModel,
	resolveBoTransitAnim,
	type TextStyleId,
} from "./phaser/yard-presenter.js";
export {
	type BeatRegion,
	baseSnapshot,
	costMeterRegion,
	type ExpectedBeat,
	makeActivity,
	makeConnection,
	makeOccupancy,
	makeRail,
	SCENARIOS,
	type SnapshotPatch,
	type YardScenario,
	zoneRegion,
} from "./scenarios/index.js";
export {
	applyLoadManifest,
	assertSheetFitsFrames,
	boAnimationForVisual,
	describeYardSceneLoad,
	registerAnimations,
	type YardLoadManifest,
	yardSceneHud,
} from "./scenes/yard-scene.js";
export {
	createTestSeam,
	isTestMode,
	seededRandom,
	type YardTestCommands,
	type YardTestEntity,
	type YardTestFx,
	type YardTestHost,
	type YardTestSeam,
	type YardTestState,
	type YardTheme,
} from "./test-seam.js";
export {
	createYardEngine,
	type Particle,
	selectZoneWithSnapshot,
	sheetForZone,
	type YardEngine,
} from "./yard-engine.js";

// public-contract
export const HOBO_CONTROL_YARD_PACKAGE = "@hobo/control-yard";
