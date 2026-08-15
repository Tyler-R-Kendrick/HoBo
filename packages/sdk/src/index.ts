// @hobo/sdk — the operator SDK (ADR-0072 naming: this package is the
// operator/self-host authoring surface; the WIT contract stays `hobo:sdk`).
// Thin factories over existing engines plus frozen, parse-validated
// greenfield declarations (docs/plans/0017 F23).

export {
	type ChaosDeclaration,
	type ChaosInjection,
	type ChaosSpec,
	chaos,
} from "./chaos.js";
export {
	type DispatcherDeclaration,
	type DispatcherObjective,
	type DispatcherOptions,
	dispatcher,
	type RunnerDeclaration,
	type RunnerKind,
	type RunnerOptions,
	runner,
	type SelfHostedRunnerOptions,
} from "./dispatcher.js";
export { SdkDeclarationError } from "./errors.js";
export {
	GENERATE_PROVIDER_PIPELINE,
	type GenerateProviderRequest,
	generateProvider,
} from "./generate-provider.js";
export {
	assertPluginExports,
	type DefinePluginSpec,
	definePlugin,
	type SdkPluginDeclaration,
} from "./plugin.js";
export {
	policyPack,
	rule,
	type SdkPolicyPack,
	type SdkPolicyPackOptions,
	type SdkPolicyRule,
	type SdkRuleSpec,
	type WhenClauseValue,
} from "./policy.js";
export {
	type DefineResourceSpec,
	defineResource,
	type ResourceRealization,
	type SdkResourceDefinition,
} from "./resource.js";
export {
	type RunbookDeclaration,
	type RunbookFixSpec,
	type RunbookFixStep,
	type RunbookSpec,
	type RunbookTrigger,
	runbook,
} from "./runbook.js";
export {
	CHAOS_SCHEMA,
	DISPATCHER_DECLARATION_SCHEMA,
	GENERATE_PROVIDER_SCHEMA,
	PLUGIN_DECLARATION_SCHEMA,
	POLICY_PACK_SCHEMA,
	RESOURCE_DEFINITION_SCHEMA,
	RUNBOOK_SCHEMA,
	RUNNER_SCHEMA,
	SDK_SCHEMA_VERSION,
	WAIVER_SCHEMA,
} from "./schema.js";
export { type WaiverDeclaration, type WaiverSpec, waiver } from "./waiver.js";

// public-contract: package id consumers assert against.
export const HOBO_SDK_PACKAGE = "@hobo/sdk";
