import { create, fromJsonString } from "@bufbuild/protobuf";
import { type Readiness, ReadinessSchema } from "./_generated/readiness_pb.js";

/** HoBo CI Dagger remains a planning surface until its execution gates pass. */
// public-contract: readiness consumers must observe planned until execution gates pass.
export const INTEGRATION_STATUS = "planned";
export const EXECUTION_AVAILABLE = false;
// public-contract: identifies the upstream SDK this planned adapter targets.
export const TARGET_SDK = "@dagger.io/dagger";
// public-contract: canonical upstream documentation for the planned integration.
export const TARGET_DOCUMENTATION = "https://docs.dagger.io/";

/** These are implementation prerequisites, not runtime capability claims. */
export const PENDING_GATES = Object.freeze([
	"Pin and verify the Dagger SDK and engine versions.",
	"Define protobuf execution commands, events, and CUE constraints.",
	"Authorize execution through HoBo account-scoped budget reservations.",
	"Execute a digest-pinned module on an isolated engine host.",
	"Prove cancellation, retries, artifact integrity, and usage settlement.",
	"Verify SDK and engine PACT contracts with executable fixtures.",
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
		message.integration !== "dagger" ||
		message.status !== INTEGRATION_STATUS ||
		message.executionAvailable !== EXECUTION_AVAILABLE ||
		message.targetSdk !== TARGET_SDK ||
		message.targetDocumentation !== TARGET_DOCUMENTATION ||
		message.pendingGates.length === 0 ||
		message.pendingGates.some((gate) => gate.trim().length === 0)
	)
		throw new Error("invalid planned Dagger readiness");
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

/** Readiness discovery performs no engine, network, or execution side effects. */
export function getReadiness(): PlannedReadiness {
	return planned(
		create(ReadinessSchema, {
			integration: "dagger",
			status: INTEGRATION_STATUS,
			executionAvailable: EXECUTION_AVAILABLE,
			targetSdk: TARGET_SDK,
			targetDocumentation: TARGET_DOCUMENTATION,
			pendingGates: [...PENDING_GATES],
		}),
	);
}
