export {
	YARD_LAYOUT,
	YARD_WIDTH,
	YARD_HEIGHT,
	zoneAt,
	zoneAnchor,
	type ZoneId,
	type ZoneLayout,
	type Layout,
} from "./layout.js";
export {
	loadAssetIndex,
	resolveAnimation,
	sheetAbsolutePath,
	assetsRoot,
	expectedSheetPixelSize,
	frameCount,
	animationFrameList,
	phaserSpritesheetConfigs,
	allAssetPaths,
	type AssetIndex,
	type SpritesheetDef,
	type AnimationDef,
	type ImageDef,
} from "./assets-index.js";
export {
	buildBootLoadPlan,
	type BootSceneDeps,
} from "./phaser/boot-scene.js";
export {
	yardPhaserConfig,
	type YardGameConfigOptions,
} from "./phaser/game-config.js";
export {
	createTestSeam,
	seededRandom,
	isTestMode,
	type YardTestSeam,
	type YardTestState,
	type YardTestCommands,
	type YardTestHost,
} from "./test-seam.js";
export {
	deriveYardVisualState,
	stepToward,
	type YardVisualState,
	type BoAnimState,
	type RailVisualState,
	type ConnectionVisualState,
	type GuestVisualState,
} from "./entity-state.js";
export {
	createYardEngine,
	selectZoneWithSnapshot,
	sheetForZone,
	type YardEngine,
	type Particle,
} from "./yard-engine.js";
export {
	sheetForConnectionCreate,
	sheetForConnectionAuthorize,
	sheetForRailLifecycle,
	sheetForCostBooth,
	sheetForDoctor,
	streamSheet,
	confirmSheet,
	type GenerativeSheet,
	type SheetKind,
	type SheetConfirmHandlers,
} from "./openui/sheets.js";
export {
	describeYardSceneLoad,
	applyLoadManifest,
	registerAnimations,
	yardSceneHud,
	boAnimationForVisual,
	assertSheetFitsFrames,
	type YardLoadManifest,
} from "./scenes/yard-scene.js";

// public-contract
export const HOBO_CONTROL_YARD_PACKAGE = "@hobo/control-yard";
