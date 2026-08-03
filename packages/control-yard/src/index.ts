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
	type CueId,
	createYardAudio,
	cueForFx,
	type YardAudio,
} from "./audio.js";
export {
	type DisplaySheet,
	displaySheetForWaybill,
	displaySheetForZone,
	dockForZone,
	type SheetDock,
} from "./dom-overlay.js";
export {
	type BoAnimState,
	type ConnectionVisualState,
	deriveYardVisualState,
	detectRecentSuccess,
	type GuestVisualState,
	type RailVisualState,
	stepToward,
	type YardVisualState,
} from "./entity-state.js";
export {
	CAMP_GROUNDS,
	type Layout,
	type PropRegion,
	YARD_HEIGHT,
	YARD_LAYOUT,
	YARD_WIDTH,
	type ZoneId,
	type ZoneLayout,
	zoneAnchor,
	zoneAt,
} from "./layout.js";
export {
	createWorldClient,
	foldWorldDelta,
	type WorldClient,
	type WorldDelta,
	type WorldEnvelope,
} from "./net/world-client.js";
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
	derailHitStop,
	type LanternLine,
	lanternLines,
	lanternRowText,
	type PresenterInput,
	presentYard,
	type RenderItem,
	type RenderModel,
	resolveBoTransitAnim,
	stampSquash,
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
	fixtureCharacterState,
	scenarioWorld,
} from "./scenarios/world-fixture.js";
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
	type YardTestWorld,
	type YardTheme,
} from "./test-seam.js";
export {
	type BlastRadius,
	createSpikeLedger,
	deriveWaybills,
	isHighball,
	type SpikeLedger,
	type Waybill,
	type WaybillField,
	type WaybillKind,
	type WaybillOp,
	waybillForZone,
} from "./waybills.js";
export {
	type BindlebugVariant,
	bindlebugVariant,
	campRoomSlots,
	hashCharacterId,
	MAX_CAMP_ROOMS,
	toWorldView,
	type WorldCampView,
	type WorldCharacterView,
	type WorldView,
} from "./world-view.js";
export {
	createYardEngine,
	type Particle,
	selectZoneWithSnapshot,
	sheetForZone,
	type YardEngine,
} from "./yard-engine.js";

// public-contract
export const HOBO_CONTROL_YARD_PACKAGE = "@hobo/control-yard";
