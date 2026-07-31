export {
	CODE_EVIDENCE_SCHEMA,
	CODE_ISOLATION_SCHEMA,
	HOBO_CODE_PACKAGE,
	type AgentPaneState,
	type AgentSemanticState,
	type EvidenceTriple,
	type HandbackReport,
	type InferenceBudgetSnapshot,
	type IsolationBackend,
	type IsolationContext,
	type IsolationKind,
	type IsolationStatus,
	type LockedVisualArtifact,
	type PlatformMatrixRow,
	type PromotionRequest,
	type PromotionResult,
	type ScaffoldResult,
} from "./types.js";

export {
	ISOLATION_PLATFORM_MATRIX,
	matrixForPlatform,
} from "./platform-matrix.js";

export {
	cleanupIsolation,
	createIsolationContext,
	getOpenIsolation,
	listSandboxOrphans,
	readHandback,
	resetIsolationRegistry,
	type CleanupResult,
	type CreateIsolationOptions,
} from "./isolation.js";

export {
	assertMediatedOnly,
	assertNoVendoredTokenTools,
	EXTERNAL_TOKEN_TOOLS,
	promoteIsolation,
	runPromotionGates,
	type PromoteOptions,
	type PromotionGate,
} from "./sandbox-promote.js";

export {
	createHarnessCore,
	demonstrateDurability,
	runRhaiSubset,
	type CreateHarnessOptions,
	type DurableWorldState,
	type HarnessCore,
	type LoadedSkill,
	type RhaiWorkflowResult,
	type SkillName,
} from "./harness.js";

export {
	HIGH_VALUE_TEMPLATE_ID,
	TEMPLATES_ROOT,
	measureTemplateSuccessRate,
	scaffoldHighValueTemplate,
	tsAutocodeConventions,
	type ScaffoldOptions,
	type SuccessRateSample,
} from "./scaffolding.js";

export {
	assertEvidenceTripleComplete,
	emitEvidenceTriple,
	linkGherkinToOpenFeature,
	type EmitEvidenceInput,
} from "./evidence.js";

export {
	applyInContextEdit,
	createOpenUiSession,
	lockVisualArtifact,
	renderOpenUiHtml,
	validateLockedVisual,
	type OpenUiSession,
} from "./visual.js";
export {
	buildMultiplexerStatus,
	copyOnHighlight,
	createPane,
	herdrMuxCapabilities,
	renderHerdrCapabilityFooter,
	renderStatusChip,
	renderStatusSurface,
	renderStatusText,
	setPaneState,
	type HerdrMuxCapabilities,
	type MultiplexerStatus,
	type StatusRenderOptions,
} from "./tui.js";

export {
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
	routeProvider,
	sponsoredWaitState,
	type BudgetPolicy,
	type SpendEvent,
} from "./finops.js";

export {
	describeDevTerminalAttach,
	registerCodeNamedEndpoint,
	shortNamedHost,
	type CodeRemoteMode,
	type CodeRemoteRegistration,
	type DevTerminalAttach,
	type DevTerminalAttachSurface,
	type DevTerminalCompare,
} from "./remote.js";

export {
	buildTasksSurface,
	grokBuildParity,
	renderGrokBuildFooter,
	renderTasksBoardText,
	type GrokBuildCompare,
	type GrokBuildParity,
	type TaskBoardRow,
	type TasksSurface,
} from "./grok-build-parity.js";

export {
	claudeCodeGuide,
	renderClaudeCodeGuideText,
	type ClaudeCodeFeatureMapRow,
	type ClaudeCodeGuide,
} from "./claude-code-guide.js";

export {
	cursorGuide,
	renderCursorGuideText,
	type CursorFeatureMapRow,
	type CursorGuide,
} from "./cursor-guide.js";

export {
	codeImprovementTrails,
	cqReflectHook,
	dogfoodStationOccupancy,
	dogfoodSummary,
	type CodeTrailRef,
	type CqReflectHook,
	type StationOccupancyRef,
} from "./dogfood.js";

export {
	startCodeSession,
	type CodeSession,
	type CodeSessionOptions,
} from "./session.js";

export {
	parseEvidenceTriple,
	parseIsolationContext,
	parsePromotionRequest,
} from "./parse.js";

export {
	applyDenseChrome,
	formatHoboCodeResult,
	HOBO_CODE_VERBS,
	looksLikeUnknownVerbAttempt,
	runHoboCodeCli,
	suggestVerbTypo,
	type FormatHoboCodeOptions,
	type HoboCodeCliDeps,
	type HoboCodeCliResult,
	type HoboCodeVerb,
} from "./cli.js";

export {
	HERMETIC_ENV_SCHEMA,
	hermeticEnvSummary,
	inspectHermeticEnv,
	type HermeticEnvReport,
	type HermeticMarker,
} from "./hermetic-env.js";

export {
	BO_CELL_HEIGHT,
	BO_CELL_WIDTH,
	BO_IDLE_BLINK,
	BO_IDLE_FRAME_COUNT,
	BO_IDLE_FRAMES,
	BO_IDLE_REST,
	BO_IDLE_SPRITE_SOURCE,
	BO_IDLE_TICK_MS,
	boIdleClipName,
	dumpLoadingAnimation,
	HOBO_LOGO_CONSOLE,
	HOBO_MARK_CONSOLE,
	iterateLoadingFrames,
	LOADING_CANVAS_HEIGHT,
	LOADING_CANVAS_WIDTH,
	measureLoadingSurface,
	padLine,
	paintCell,
	renderBoIdleFrame,
	renderDefaultLoadingScreen,
	selectBoIdleFrame,
	type BoIdleClip,
	type LoadingScreenOptions,
} from "./splash.js";

export {
	PRODUCT_NOT_PI,
	DEFAULT_SLASH_ITEMS,
	appendAssistant,
	appendProduct,
	createInitialShellState,
	reduceShellKey,
	renderShellFrame,
	runInteractiveShell,
	shellFrameIdentity,
	type InteractiveShellState,
	type ShellFocus,
	type ShellHost,
	type ShellMessage,
	type ShellSlashItem,
} from "./interactive-shell.js";

export { createDefaultShellHost } from "./shell-host.js";

export {
	decodeGrayAlphaPng,
	extractSpriteFrame,
	measureTuiSprite,
	renderBraille,
	renderHalfBlocks,
	sampleInkBitmap,
	spriteFrameToTui,
	spriteStripMeta,
	spriteStripToTuiFrames,
	type GrayAlphaImage,
	type SampledBitmap,
	type SpriteSheetMeta,
	type SpriteToTuiOptions,
	type TuiSpriteMode,
} from "./sprite-tui.js";

export {
	defaultHoboCodeEveAgents,
	defineEveAgent,
	defineEveSubagent,
	describeEveSubagentSurface,
	eveAgentRootPath,
	EVE_AGENT_SCHEMA,
	type DefineEveAgentInput,
	type EveAgentDefinition,
	type EveAgentKind,
} from "./eve.js";

export {
	describeSecureSandboxStack,
	planSecureSandbox,
	SECURE_SANDBOX_STACK_SCHEMA,
	tierForEveSandboxClass,
	type SecureSandboxPlan,
	type SecureSandboxStackDescriptor,
	type SecureSandboxTier,
} from "./sandbox-stack.js";

export {
	CODE_WORLD_SCHEMA,
	describeCodeWorlds,
	localWorld,
	planDurableWorkflowRun,
	vercelWorkflowWorld,
	type CodeWorldCapabilities,
	type CodeWorldDescriptor,
	type CodeWorldKind,
	type DurableWorkflowRun,
	type DurableWorkflowStep,
} from "./worlds.js";

export {
	bindCodeStation,
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	composeCodePlatform,
	createMemoryFeaturePort,
	selectSweProvider,
	SWE_PROVIDER_CATALOG,
	type CodeFeaturePort,
	type CodePlatformSnapshot,
	type CodeStationBinding,
	type SweProviderDescriptor,
	type SweProviderId,
} from "./platform.js";

export {
	COMPUTE_ISOLATION_CLASSES,
	COMPUTE_NODE_SCHEMA,
	COMPUTE_POOL_SCHEMA,
	COMPUTE_TASK_SCHEMA,
	describeDistributedCompute,
	dispatchComputeTask,
	openComputePool,
	registerComputeNode,
	type ComputeNode,
	type ComputeNodeClass,
	type ComputeNodeStatus,
	type ComputePool,
	type ComputeTask,
	type ComputeTaskStatus,
	type DispatchComputeTaskInput,
	type DispatchComputeTaskResult,
	type OpenComputePoolOptions,
} from "./distributed.js";

export {
	BYOK_ENV_NAMES,
	CODE_MODELS_SCHEMA,
	inspectModels,
	modelsHumanSummary,
	type ByokEnvPresence,
	type ModelsStatus,
} from "./models.js";

export {
	CODE_COST_SCHEMA,
	costHumanSummary,
	inspectCost,
	type CostSavingsEstimate,
	type CostStatus,
	type FreeLocalEndpoint,
	type TokenTool,
} from "./cost.js";

export {
	CODE_HARNESS_SURFACE_SCHEMA,
	harnessHumanSummary,
	inspectHarnessSurface,
	type HarnessBrainNote,
	type HarnessSkillRoot,
	type HarnessSurfaceStatus,
} from "./harness-surface.js";

export {
	CODE_EDITOR_BRIDGE_SCHEMA,
	editorBridgeHumanSummary,
	editorBridgeOpenScript,
	inspectEditorBridge,
	type BridgeMode,
	type EditorBridgeStatus,
	type EditorKind,
	type PaneLayout,
} from "./editor-bridge.js";

export {
	CODE_CONFIG_SCHEMA,
	CONFIG_STACK_IDS,
	configHumanSummary,
	inspectConfigSurface,
	isConfigStackId,
	type ConfigKnob,
	type ConfigStackId,
	type ConfigSurfaceStatus,
} from "./config-surface.js";

export {
	CODE_AGENT_SCHEMA,
	agentHumanSummary,
	inspectAgentSurface,
	type AgentAuthModeCard,
	type AgentProtocolCard,
	type AgentSurfaceStatus,
} from "./agent-surface.js";

export {
	CODE_AUTH_SESSION_SCHEMA,
	authLogin,
	authStatus,
	authSessionPath,
	clearAuthSession,
	confirmRemoteLogin,
	readAuthSession,
	resolveAuthenticatedStationId,
	resolveStationTarget,
	type AuthLoginInput,
	type AuthLoginResult,
	type CodeAuthMode,
	type CodeAuthSession,
} from "./auth.js";
