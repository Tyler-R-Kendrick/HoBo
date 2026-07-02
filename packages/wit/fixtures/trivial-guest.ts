import type * as HoboSdk from "../generated/sdk.js";
import type * as Workflow from "../generated/interfaces/hobo-sdk-workflow.js";
import type * as Subscription from "../generated/interfaces/hobo-sdk-subscription.js";

export type GeneratedSdkWorld = typeof HoboSdk;
export type GeneratedWorkflowImport = typeof Workflow;
export type GeneratedSubscriptionImport = typeof Subscription;

export const importedInterfaces = [
	"workflow",
	"actor",
	"saga",
	"agent",
	"command",
	"subscription",
	"capability",
	"data",
] as const;

export function buildTrivialGuest(world: GeneratedSdkWorld): "guest-builds" {
	void world;
	return "guest-builds";
}
