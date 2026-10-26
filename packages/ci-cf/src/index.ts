import { create, fromJsonString } from "@bufbuild/protobuf";
import { type Readiness, ReadinessSchema } from "./_generated/readiness_pb.js";

/** HoBo CI Cf targets Cloudflare's CI SDK; execution remains deferred. */
// public-contract: readiness consumers must observe planned until execution gates pass.
export const INTEGRATION_STATUS = "planned";
export const EXECUTION_AVAILABLE = false;
// public-contract: identifies the upstream SDK this planned adapter targets.
export const TARGET_SDK = "@cloudflare/ci";
// public-contract: canonical upstream documentation for the planned integration.
export const TARGET_DOCUMENTATION = "https://github.com/cloudflare/ci";

/** These gates must be evidenced before registering an execution provider. */
export const PENDING_GATES = Object.freeze([
	"Pin and verify the Cloudflare CI SDK version and supported runtime.",
	"Define protobuf execution commands, events, and CUE constraints.",
	"Bind Workflows and isolated sandboxes to the customer's Cloudflare account.",
	"Authorize execution through HoBo account-scoped budget reservations.",
	"Prove checkpoint replay, cancellation, artifact integrity, and usage settlement.",
	"Verify Cloudflare CI and Workflows PACT contracts with executable fixtures.",
]);

/** A refinement of the generated message; no parallel handwritten wire DTO. */
export type PlannedReadiness = Readonly<
	Omit<Readiness, "status" | "executionAvailable" | "pendingGates">
> & {
	readonly status: "planned";
	readonly executionAvailable: false;
	readonly pendingGates: readonly string[];
};

function planned(message: Readiness): PlannedReadiness {
	if (
		message.integration !== "cf" ||
		message.status !== INTEGRATION_STATUS ||
		message.executionAvailable !== EXECUTION_AVAILABLE ||
		message.targetSdk !== TARGET_SDK ||
		message.targetDocumentation !== TARGET_DOCUMENTATION ||
		message.pendingGates.length === 0 ||
		message.pendingGates.some((gate) => gate.trim().length === 0)
	)
		throw new Error("invalid planned Cloudflare CI readiness");
	return Object.freeze({
		...message,
		status: INTEGRATION_STATUS,
		executionAvailable: EXECUTION_AVAILABLE,
		pendingGates: Object.freeze([...message.pendingGates]),
	});
}

/** Parse the protobuf JSON boundary once, then return the constrained view. */
export function parseReadiness(json: string): PlannedReadiness {
	return planned(fromJsonString(ReadinessSchema, json));
}

/** Readiness discovery performs no Cloudflare, network, or execution side effects. */
export function getReadiness(): PlannedReadiness {
	return planned(
		create(ReadinessSchema, {
			integration: "cf",
			status: INTEGRATION_STATUS,
			executionAvailable: EXECUTION_AVAILABLE,
			targetSdk: TARGET_SDK,
			targetDocumentation: TARGET_DOCUMENTATION,
			pendingGates: [...PENDING_GATES],
		}),
	);
}
