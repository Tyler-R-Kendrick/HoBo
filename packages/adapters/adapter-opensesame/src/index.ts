export type {
	CredentialBinding,
	CredentialBindings,
	ProxiedRunOutcome,
	SurrogateEvidence,
} from "./_generated/adapter_opensesame_pb.js";
export {
	HTTP_METHODS,
	type HttpMethod,
	isParsedCredentialBinding,
	type ParsedCredentialBinding,
	parseCredentialBindings,
} from "./binding.js";
export { createOpenSesameCredentialResolver } from "./credential-resolver.js";
export {
	ADAPTER_ERROR_CODES,
	OpenSesameAdapterError,
	type OpenSesameAdapterErrorCode,
} from "./errors.js";
export { surrogateEvidence } from "./evidence.js";
export {
	buildLaunch,
	CHILD_MARKER,
	type Launch,
	type LaunchInput,
	type RunInput,
	runProxied,
} from "./launch.js";
export {
	exitCodeOf,
	OUTCOME_KINDS,
	type OutcomeKind,
	outcomeError,
	parseOutcome,
} from "./outcome.js";
export {
	createOpenSesameSecretsPort,
	type OpenSesamePortOptions,
	SURROGATE_PATTERN,
} from "./port.js";
export { renderEnvSchema } from "./schema.js";
