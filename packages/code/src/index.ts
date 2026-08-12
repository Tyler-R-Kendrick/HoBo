export {
	type AgentAuthModeCard,
	type AgentProtocolCard,
	type AgentSurfaceStatus,
	agentHumanSummary,
	CODE_AGENT_SCHEMA,
	inspectAgentSurface,
} from "./agent-surface.js";
export {
	type AuthLoginInput,
	type AuthLoginResult,
	authLogin,
	authSessionPath,
	authStatus,
	CODE_AUTH_SESSION_SCHEMA,
	type CodeAuthMode,
	type CodeAuthSession,
	clearAuthSession,
	confirmRemoteLogin,
	readAuthSession,
	resolveAuthenticatedStationId,
	resolveStationTarget,
} from "./auth.js";
export {
	type ClaudeCodeFeatureMapRow,
	type ClaudeCodeGuide,
	claudeCodeGuide,
	renderClaudeCodeGuideText,
} from "./claude-code-guide.js";
export {
	applyDenseChrome,
	type FormatHoboCodeOptions,
	formatHoboCodeResult,
	HOBO_CODE_VERBS,
	type HoboCodeCliDeps,
	type HoboCodeCliResult,
	type HoboCodeVerb,
	looksLikeUnknownVerbAttempt,
	runHoboCodeCli,
	suggestVerbTypo,
} from "./cli.js";
export {
	CODE_CONFIG_SCHEMA,
	CONFIG_STACK_IDS,
	type ConfigKnob,
	type ConfigStackId,
	type ConfigSurfaceStatus,
	configHumanSummary,
	inspectConfigSurface,
	isConfigStackId,
} from "./config-surface.js";
export {
	CODE_COST_SCHEMA,
	type CostSavingsEstimate,
	type CostStatus,
	costHumanSummary,
	type FreeLocalEndpoint,
	inspectCost,
	type TokenTool,
} from "./cost.js";
export {
	type CursorFeatureMapRow,
	type CursorGuide,
	cursorGuide,
	renderCursorGuideText,
} from "./cursor-guide.js";
export {
	COMPUTE_ISOLATION_CLASSES,
	COMPUTE_NODE_SCHEMA,
	COMPUTE_POOL_SCHEMA,
	COMPUTE_TASK_SCHEMA,
	type ComputeNode,
	type ComputeNodeClass,
	type ComputeNodeStatus,
	type ComputePool,
	type ComputeTask,
	type ComputeTaskStatus,
	type DispatchComputeTaskInput,
	type DispatchComputeTaskResult,
	describeDistributedCompute,
	dispatchComputeTask,
	type OpenComputePoolOptions,
	openComputePool,
	registerComputeNode,
} from "./distributed.js";
export {
	type CodeTrailRef,
	type CqReflectHook,
	codeImprovementTrails,
	cqReflectHook,
	dogfoodStationOccupancy,
	dogfoodSummary,
	type StationOccupancyRef,
} from "./dogfood.js";
export {
	type BridgeMode,
	CODE_EDITOR_BRIDGE_SCHEMA,
	type EditorBridgeStatus,
	type EditorKind,
	editorBridgeHumanSummary,
	editorBridgeOpenScript,
	inspectEditorBridge,
	type PaneLayout,
} from "./editor-bridge.js";
export {
	type DefineEveAgentInput,
	defaultHoboCodeEveAgents,
	defineEveAgent,
	defineEveSubagent,
	describeEveSubagentSurface,
	EVE_AGENT_SCHEMA,
	type EveAgentDefinition,
	type EveAgentKind,
	eveAgentRootPath,
} from "./eve.js";
export {
	assertEvidenceTripleComplete,
	type EmitEvidenceInput,
	emitEvidenceTriple,
	linkGherkinToOpenFeature,
} from "./evidence.js";
export {
	type EvidenceOverlayBridgeOptions,
	type EvidenceOverlayControlsOptions,
	type EvidenceOverlayMessage,
	type EvidenceOverlayMessageEvent,
	type EvidenceOverlayWrapperOptions,
	parseEvidenceOverlayMessage,
	renderEvidenceOverlayBridge,
	renderEvidenceOverlayControls,
	renderEvidenceOverlayWrapper,
} from "./evidence-overlay.js";
export {
	createEvidencePort,
	type EvidenceArtifactRef,
	type StoredEvidenceArtifact,
	type StoredEvidenceRecord,
} from "./evidence-port.js";
export {
	appendSignedEvidenceNote,
	EVIDENCE_REPORT_SCHEMA,
	EVIDENCE_REPORT_SECTIONS,
	type EvidenceArtifact,
	type EvidenceFact,
	type EvidenceReport,
	type EvidenceReportHtmlOptions,
	type EvidenceReportInput,
	type EvidenceReportSection,
	type EvidenceReportSectionId,
	type EvidenceState,
	type PortableEvidenceReportExport,
	projectEvidenceReport,
	renderEvidenceReportExport,
	renderEvidenceReportHtml,
	type SignedEvidenceNote,
} from "./evidence-report.js";
export {
	type BudgetPolicy,
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
	routeProvider,
	type SpendEvent,
	sponsoredWaitState,
} from "./finops.js";
export {
	type GitTerminalPaneState,
	INITIAL_GIT_TERMINAL_STATE,
	moveGitTerminalSelection,
	renderGitTerminalPane,
	runGitTerminalPane,
} from "./git-terminal-pane.js";
export {
	buildTasksSurface,
	type GrokBuildCompare,
	type GrokBuildParity,
	grokBuildParity,
	renderGrokBuildFooter,
	renderTasksBoardText,
	type TaskBoardRow,
	type TasksSurface,
} from "./grok-build-parity.js";
export {
	type CreateHarnessOptions,
	createHarnessCore,
	type DurableWorldState,
	demonstrateDurability,
	type HarnessCore,
	type LoadedSkill,
	type RhaiWorkflowResult,
	runRhaiSubset,
	type SkillName,
} from "./harness.js";
export {
	CODE_HARNESS_SURFACE_SCHEMA,
	type HarnessBrainNote,
	type HarnessSkillRoot,
	type HarnessSurfaceStatus,
	harnessHumanSummary,
	inspectHarnessSurface,
} from "./harness-surface.js";
export {
	HERMETIC_ENV_SCHEMA,
	type HermeticEnvReport,
	type HermeticMarker,
	hermeticEnvSummary,
	inspectHermeticEnv,
} from "./hermetic-env.js";
export {
	appendAssistant,
	appendProduct,
	createInitialShellState,
	DEFAULT_SLASH_ITEMS,
	type InteractiveShellState,
	PRODUCT_NOT_PI,
	reduceShellKey,
	renderShellFrame,
	runInteractiveShell,
	type ShellFocus,
	type ShellHost,
	type ShellMessage,
	type ShellSlashItem,
	shellFrameIdentity,
} from "./interactive-shell.js";
export {
	type CleanupResult,
	type CreateIsolationOptions,
	cleanupIsolation,
	createIsolationContext,
	getOpenIsolation,
	listSandboxOrphans,
	readHandback,
	resetIsolationRegistry,
} from "./isolation.js";
export {
	createLocalSessionControl,
	type LocalSessionControl,
	type LocalSessionControlOptions,
	sessionCommandEnvelope,
} from "./local-session-control.js";
export {
	BYOK_ENV_NAMES,
	type ByokEnvPresence,
	CODE_MODELS_SCHEMA,
	inspectModels,
	type ModelsStatus,
	modelsHumanSummary,
} from "./models.js";

export {
	parseEvidenceTriple,
	parseGuestEvidenceSubmission,
	parseIsolationContext,
	parsePromotionRequest,
} from "./parse.js";
export {
	bindCodeStation,
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	type CodeFeaturePort,
	type CodePlatformSnapshot,
	type CodeStationBinding,
	composeCodePlatform,
	createMemoryFeaturePort,
	SWE_PROVIDER_CATALOG,
	type SweProviderDescriptor,
	type SweProviderId,
	selectSweProvider,
} from "./platform.js";
export {
	ISOLATION_PLATFORM_MATRIX,
	matrixForPlatform,
} from "./platform-matrix.js";
export {
	type CodeRemoteMode,
	type CodeRemoteRegistration,
	type DevTerminalAttach,
	type DevTerminalAttachSurface,
	type DevTerminalCompare,
	describeDevTerminalAttach,
	registerCodeNamedEndpoint,
	shortNamedHost,
} from "./remote.js";
export {
	type CreateResidentSessionOptions,
	createResidentSessionRuntime,
	type ResidentSessionRuntime,
	type ResidentSessionRuntimeOptions,
	residentSessionTmuxName,
} from "./resident-session-runtime.js";
export {
	assertMediatedOnly,
	assertNoVendoredTokenTools,
	EXTERNAL_TOKEN_TOOLS,
	type PromoteOptions,
	type PromotionGate,
	promoteIsolation,
	runPromotionGates,
} from "./sandbox-promote.js";
export {
	describeSecureSandboxStack,
	planSecureSandbox,
	SECURE_SANDBOX_STACK_SCHEMA,
	type SecureSandboxPlan,
	type SecureSandboxStackDescriptor,
	type SecureSandboxTier,
	tierForEveSandboxClass,
} from "./sandbox-stack.js";
export {
	HIGH_VALUE_TEMPLATE_ID,
	measureTemplateSuccessRate,
	type ScaffoldOptions,
	type SuccessRateSample,
	scaffoldHighValueTemplate,
	TEMPLATES_ROOT,
	tsAutocodeConventions,
} from "./scaffolding.js";
export {
	type CodeSession,
	type CodeSessionOptions,
	startCodeSession,
} from "./session.js";
export {
	parseSessionCommand,
	parseSessionSnapshot,
	SESSION_COMMAND_SCHEMA,
	SESSION_SNAPSHOT_SCHEMA,
	type SessionCommandEnvelope,
	type SessionSnapshot,
	sessionSnapshotJson,
} from "./session-contract.js";
export {
	type SessionControlServer,
	type SessionControlServerOptions,
	startSessionControlServer,
} from "./session-control-server.js";
export {
	createSessionOrchestrator,
	type SessionDeliveryApproval,
	type SessionDeliveryOperation,
	type SessionOrchestrator,
	type SessionOrchestratorOptions,
	type SessionProcessResult,
	type SessionProcessRunner,
	sessionProcessRunner,
} from "./session-orchestrator.js";
export { createDefaultShellHost } from "./shell-host.js";
export {
	BO_CELL_HEIGHT,
	BO_CELL_WIDTH,
	BO_IDLE_BLINK,
	BO_IDLE_FRAME_COUNT,
	BO_IDLE_FRAMES,
	BO_IDLE_REST,
	BO_IDLE_SPRITE_SOURCE,
	BO_IDLE_TICK_MS,
	type BoIdleClip,
	boIdleClipName,
	dumpLoadingAnimation,
	HOBO_LOGO_CONSOLE,
	HOBO_MARK_CONSOLE,
	iterateLoadingFrames,
	LOADING_CANVAS_HEIGHT,
	LOADING_CANVAS_WIDTH,
	type LoadingScreenOptions,
	measureLoadingSurface,
	padLine,
	paintCell,
	renderBoIdleFrame,
	renderDefaultLoadingScreen,
	selectBoIdleFrame,
} from "./splash.js";
export {
	decodeGrayAlphaPng,
	extractSpriteFrame,
	type GrayAlphaImage,
	measureTuiSprite,
	renderBraille,
	renderHalfBlocks,
	type SampledBitmap,
	type SpriteSheetMeta,
	type SpriteToTuiOptions,
	sampleInkBitmap,
	spriteFrameToTui,
	spriteStripMeta,
	spriteStripToTuiFrames,
	type TuiSpriteMode,
} from "./sprite-tui.js";
export {
	buildMultiplexerStatus,
	copyOnHighlight,
	createPane,
	type HerdrMuxCapabilities,
	herdrMuxCapabilities,
	type MultiplexerStatus,
	renderHerdrCapabilityFooter,
	renderStatusChip,
	renderStatusSurface,
	renderStatusText,
	type StatusRenderOptions,
	setPaneState,
} from "./tui.js";
export {
	type AgentPaneState,
	type AgentSemanticState,
	CODE_EVIDENCE_SCHEMA,
	CODE_ISOLATION_SCHEMA,
	type EvidenceKind,
	type EvidenceTriple,
	type GuestEvidenceSubmission,
	type HandbackReport,
	HOBO_CODE_PACKAGE,
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
	applyInContextEdit,
	createOpenUiSession,
	lockVisualArtifact,
	type OpenUiSession,
	renderOpenUiHtml,
	validateLockedVisual,
} from "./visual.js";
export {
	CODE_WORLD_SCHEMA,
	type CodeWorldCapabilities,
	type CodeWorldDescriptor,
	type CodeWorldKind,
	type DurableWorkflowRun,
	type DurableWorkflowStep,
	describeCodeWorlds,
	localWorld,
	planDurableWorkflowRun,
	vercelWorkflowWorld,
} from "./worlds.js";
