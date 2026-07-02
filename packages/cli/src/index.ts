export { CANONICAL_VERBS, GLOBAL_FLAGS, helpText, verbHelpText } from "./shell/verbs.js";
export { createHoboCli, dispatchCommand, runHobo } from "./shell/dispatch.js";
export { createCommandRegistry } from "./shell/registry.js";
export { parseArgv } from "./shell/parse.js";
export { CliError, NoBindleError, UsageError } from "./shell/errors.js";
export { scaffoldHoboProject, validateScaffoldProject } from "./commands/new.js";
export {
	createBuildCommand,
	runBuild,
	writeBuildFixtureProject,
	BUILD_MANIFEST_PATH,
	BuildError,
	parseBuildRequestFromInvocation,
	parseServiceDeclaration,
	parseBuildManifest,
} from "./commands/build.js";
export { VALID_TEMPLATES } from "./types/scaffold.js";
export type { CliEnvelope, CliContext, CommandResult } from "./types/envelope.js";
export type { CommandInvocation, CreateHoboCliOptions, HoboCli } from "./shell/dispatch.js";
