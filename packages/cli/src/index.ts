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
export {
	scaffoldHoboProject,
	validateScaffoldProject,
} from "./commands/new.js";
export { createStubCommand } from "./commands/stub.js";
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
