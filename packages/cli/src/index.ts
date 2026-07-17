export type { CodegenEngine } from "./codegen/types.js";
export {
	BUILD_MANIFEST_PATH,
	BuildError,
	createBuildCommand,
	parseBuildManifest,
	parseBuildRequestFromInvocation,
	parseServiceDeclaration,
	runBuild,
	writeBuildFixtureProject,
} from "./commands/build.js";
export { createCodegenCommand } from "./commands/codegen.js";
export { createDownCommand, type DownCommandDeps } from "./commands/down.js";
export { createLoginCommand, type LoginCommandDeps } from "./commands/login.js";
export {
	scaffoldHoboProject,
	validateScaffoldProject,
} from "./commands/new.js";
export { createPlanCommand, type PlanCommandDeps } from "./commands/plan.js";
export { createStubCommand } from "./commands/stub.js";
export { createUpCommand, type UpCommandDeps } from "./commands/up.js";
export {
	BINDLE_MANIFEST_FILE,
	deploymentIdFor,
	loadProjectManifest,
} from "./cloud/manifest.js";
export {
	ANONYMOUS_SUBJECT,
	createFixtureSession,
	DEFAULT_TENANT,
	loadSession,
	persistSession,
	SESSION_FILE,
} from "./cloud/session.js";
export {
	createYardClient,
	type DownResult,
	type PlanRendered,
	type UpResult,
	type YardClient,
	type YardRuntime,
	type YardSession,
} from "./cloud/yard-client.js";
export type {
	CommandInvocation,
	CreateHoboCliOptions,
	HoboCli,
} from "./shell/dispatch.js";
export { createHoboCli, dispatchCommand, runHobo } from "./shell/dispatch.js";
export { CliError, NoBindleError, UsageError } from "./shell/errors.js";
export { parseArgv } from "./shell/parse.js";
export { createCommandRegistry } from "./shell/registry.js";
export {
	CANONICAL_VERBS,
	GLOBAL_FLAGS,
	helpText,
	verbHelpText,
} from "./shell/verbs.js";
export type {
	CliContext,
	CliEnvelope,
	CommandResult,
} from "./types/envelope.js";
export { VALID_TEMPLATES } from "./types/scaffold.js";
