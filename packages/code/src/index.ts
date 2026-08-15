export {
	type HarnessSpec,
	loadHarnessCatalog,
	registerHarness,
	resetRegisteredHarnesses,
} from "./agent-harness-catalog.js";
export {
	AGENTS_INIT_SCHEMA,
	AGENTS_REGISTRY_SCHEMA,
	type AgentsInitPlan,
	agentsRegistryPath,
	applyAgentsInit,
	discoverEveAgentTrees,
	formatAgentsInitPlan,
	planAgentsInit,
	resolveAgentsDestination,
	runAgentsCli,
} from "./agent-harness-init.js";
export {
	type AgentAuthModeCard,
	type AgentProtocolCard,
	type AgentSurfaceStatus,
	agentHumanSummary,
	CODE_AGENT_SCHEMA,
	inspectAgentSurface,
} from "./agent-surface.js";
export {
	type AgentWorkBoard,
	CLAIMED_WORK_DELIVERY,
	claimedWorkDeliveryPlan,
	claimTaskForAgent,
	groupTasksUnderAgents,
	listWorkClaims,
	type WorkClaim,
	workspaceForAgent,
} from "./agent-work.js";
export {
	ATOM_EMBEDDER_DIM,
	ATOM_EMBEDDER_HASH,
	ATOM_EMBEDDER_ID,
	ATOM_HIGH_SCORE,
	ATOM_RRF_K,
	ATOMS_ROOT,
	composeAtoms,
	defaultAtomIndexPath,
	type EmissionDecision,
	type EmitFromAtomsResult,
	embedAtomText,
	emitFromAtoms,
	hashedTrigramEmbedder,
	loadAtomCorpus,
	loadClosedIntents,
	matchClosedIntent,
	materializeAtomFiles,
	mergeAtomFiles,
	type RankedHit,
	type RebuildAtomIndexResult,
	type RetrieveAtomsResult,
	rankAtoms,
	readPersistedIndexMeta,
	rebuildAtomIndex,
	renderAtomCatalogInstructions,
	resetAtomIndexCache,
	retrieveAtoms,
} from "./atom-index.js";
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
	inspectBindleProject,
	inspectBindleSource,
	localBindleCapabilities,
} from "./bindle-inspect.js";
export {
	BROWSER_RECORDING_SCHEMA,
	type BrowserRecordingAction,
	type BrowserRecordingCheckpoint,
	type BrowserRecordingTarget,
	type CompletedBrowserRecording,
	parseBrowserRecording,
} from "./browser-recording.js";
export {
	answerBtw,
	type BtwSession,
	type BtwSnapshot,
	captureBtwSnapshot,
	matchBtwInput,
} from "./btw.js";
export {
	type ChatSessionRecord,
	formatShellCloseout,
	listChatSessions,
	loadChatSession,
	resolveChatSession,
	saveChatSession,
} from "./chat-sessions.js";
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
	type CommandSensitivity,
	classifyCommand,
	redactCommand,
} from "./command-redaction.js";
export {
	compactTranscript,
	estimateTokens,
} from "./compact.js";
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
	dashboardListenUrl,
	dashboardNamedUrl,
	isDashboardOpenableUrl,
} from "./dashboard-links.js";
export { resolveHoboBin, resolveHoboSpawn } from "./dev-browser.js";
export {
	CODE_DEV_SCENARIOS,
	type CodeDevScenario,
	codeDevStation,
	DEFAULT_LOCALHOST_CAPABILITIES,
	isCodeDevScenario,
	stationInitArgsFromDeclaration,
} from "./dev-stations.js";
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
	type CampEvalSidecar,
	campEvalSidecar,
	EVAL_SIDECAR_HOSTING,
	EVAL_SIDECAR_NAME,
	inspectProjectEvalTests,
	inspectTrainableRegions,
	type ProjectEvalTests,
	type TrainableRegion,
} from "./eval-sidecar.js";
export {
	assembleCampEvalSidecar,
	type EvalSidecarRun,
	type EvalSidecarServer,
	runEvalSidecarSuite,
	startEvalSidecar,
} from "./eval-sidecar-server.js";
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
	EVIDENCE_AUTOMATION_SCHEMA,
	type EvidenceAutomationArtifact,
	type EvidenceRecordingAutomationExport,
	exportEvidenceRecordingAutomation,
} from "./evidence-automation.js";
export {
	debugViewUrl,
	EVIDENCE_OVERLAY_BO_PATH,
	EVIDENCE_OVERLAY_DEBUG_PARAM,
	type EvidenceOverlayBridgeOptions,
	type EvidenceOverlayControlsOptions,
	type EvidenceOverlayMessage,
	type EvidenceOverlayMessageEvent,
	type EvidenceOverlayWrapperOptions,
	evidenceOverlayBoIdleResponse,
	parseEvidenceOverlayMessage,
	renderEvidenceOverlayBridge,
	renderEvidenceOverlayControls,
	renderEvidenceOverlayWrapper,
} from "./evidence-overlay.js";
export {
	asHoboEvidenceHost,
	createEvidencePort,
	type EvidenceArtifactRef,
	type ReadEvidenceArtifact,
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
	type PortableEvidenceAsset,
	type PortableEvidenceReportExport,
	projectEvidenceReport,
	renderEvidenceJournalEventHtml,
	renderEvidenceJournalHtml,
	renderEvidenceReportExport,
	renderEvidenceReportHtml,
	type SignedEvidenceNote,
} from "./evidence-report.js";
export {
	EXAMPLES_ROOT,
	type ExampleCatalogEntry,
	loadExampleCatalog,
	type MaterializeExampleResult,
	matchExampleRequest,
	materializeExample,
	renderExampleCatalogInstructions,
} from "./example-catalog.js";
export {
	createStationExperimentEngine,
	EXPERIMENT_SIDECAR_HOSTING,
	EXPERIMENT_SIDECAR_NAME,
	type ExperimentSidecarServer,
	startExperimentSidecar,
} from "./experiment-sidecar-server.js";
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
	HISTORY_SIDECAR_HOSTING,
	HISTORY_SIDECAR_NAME,
	type HistorySidecarServer,
	startHistorySidecar,
} from "./history-sidecar-server.js";
export {
	classifyWindowName,
	cycleInSessionWindow,
	emptyInSessionPanes,
	ensureInSessionPanes,
	IN_SESSION_MUX,
	type InSessionPanes,
	type InSessionWindow,
	isProductPrompt,
	pickCodingWindow,
	pickSendWindow,
	refreshInSessionPanes,
	sendToInSessionPane,
} from "./in-session-panes.js";
export {
	appendAssistant,
	appendProduct,
	applyBtwPrompt,
	applyCompact,
	buildShellTree,
	createInitialShellState,
	cycleFocus,
	DEFAULT_SLASH_ITEMS,
	hasAgentWork,
	type InteractiveShellState,
	openAgentsSurface,
	PRODUCT_NOT_PI,
	reduceShellKey,
	renderShellFrame,
	resolveSlashArgv,
	runInteractiveShell,
	SHELL_FOCUS_ORDER,
	type ShellFocus,
	type ShellHost,
	type ShellMessage,
	type ShellSlashItem,
	shellFrameIdentity,
	slashItemForInput,
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
	KMS_CRYPTO_PORT,
	KMS_SECRETS_PORT,
	KMS_SIDECAR_HOSTING,
	KMS_SIDECAR_NAME,
	type KmsSidecarServer,
	STATION_KMS_KEY,
	StationKms,
	startKmsSidecar,
} from "./kms-sidecar-server.js";
export {
	createLocalSessionControl,
	type LocalSessionControl,
	type LocalSessionControlOptions,
	sessionCommandEnvelope,
} from "./local-session-control.js";
export {
	defaultMachineProbes,
	discoverMachine,
	MACHINE_DISCOVERY_SCHEMA,
	type MachineDiscoveryProbes,
	type MachineDiscoveryReport,
	MIN_NODE_MAJOR,
	type ModelServerProbeResult,
	machineDiscoveryPath,
	matchMachineToStation,
	observationsFromMachineReport,
	persistMachineDiscoveryReport,
} from "./machine-discovery.js";
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
export { runReviewCommand } from "./review/review-command.js";
export {
	parseReviewCommand,
	parseReviewSnapshot,
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
} from "./review/review-contract.js";
export { createReviewRuntime } from "./review/review-runtime.js";
export { renderReviewPane } from "./review/review-terminal.js";
export {
	createStationRolloutEngine,
	promoteStationRollout,
	ROLLOUT_SIDECAR_HOSTING,
	ROLLOUT_SIDECAR_NAME,
	type RolloutSidecarServer,
	startRolloutSidecar,
} from "./rollout-sidecar-server.js";
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
	type AtomScaffoldResult,
	HIGH_VALUE_TEMPLATE_ID,
	measureTemplateSuccessRate,
	type ScaffoldFromAtomsOptions,
	type ScaffoldFromIntentOptions,
	type ScaffoldOptions,
	type SuccessRateSample,
	scaffoldFromAtoms,
	scaffoldFromIntent,
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
export { startLocalDashboard } from "./session-dashboard.js";
export {
	createResourceLifecycle,
	type LifecycleSnapshot,
} from "./session-lifecycle.js";
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
export {
	createOtelSink,
	fleetView,
	projectOccupancyTelemetry,
} from "./session-otel.js";
export {
	controlsBindleProcess,
	createOccupancyController,
	occupancyRunIsLive,
	persistOccupancyRun,
} from "./session-resource-control.js";
export {
	assembleSessionResources,
	bindleMeshUrl,
	CODE_BINDLE_ID,
	CODE_CAMP_ID,
	formatSessionResources,
	looksLikeSecretMaterial,
	type OccupancyBindleManifest,
	type OccupancyCampConfig,
	type OccupancyManagedResource,
	recordDevDeployment,
	recordSessionResources,
	SESSION_RESOURCES_SCHEMA,
	type SessionResourceInventory,
	userCampId,
} from "./session-resources.js";
export {
	type CommandEvent,
	openSessionShellStore,
	SESSION_SHELL_SCHEMA,
	type SessionShellStore,
	sessionShellStorePath,
} from "./session-shell-store.js";
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
	type AuthedStationView,
	describeAuthedStationSession,
	formatStationStatusBlock,
	formatStationStrap,
	stationDevEnv,
} from "./station-session.js";
export {
	attachStationSidecars,
	formatSidecarStrap,
	readStationSidecars,
	STATION_SIDECARS_SCHEMA,
	sidecarsEnabled,
	startStationSidecars,
	stopStationSidecars,
} from "./station-sidecars.js";
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
	BROADCAST,
	BROADCAST_CHROME_ROWS,
	BROADCAST_INNER_INSET,
	broadcastFrame,
} from "./tui-broadcast.js";
export {
	AgentPanes,
	ApprovalDialog,
	BroadcastFrame,
	BtwAside,
	ChatTranscript,
	CommandRail,
	InkCard,
	InkTable,
	ShellChrome,
	SlashPalette,
	StatusStrap,
	TextPane,
	WelcomeSurface,
} from "./tui-components.js";
export { renderTuiTree } from "./tui-render.js";
export { TUI_TOKENS } from "./tui-tokens.js";
export {
	findDescendantById,
	getChildren,
	query,
	queryAll,
	type TuiNode,
} from "./tui-tree.js";
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
	formatLiveEndpoints,
	type LiveEndpointLines,
	liveEndpointLines,
	matchWorkspaceAction,
	resolveRunnableProject,
	retargetUrl,
	type WorkspaceAction,
} from "./workspace-actions.js";
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
