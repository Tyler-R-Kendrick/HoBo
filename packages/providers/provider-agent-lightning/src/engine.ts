import { create, toJson } from "@bufbuild/protobuf";
import {
	hashTrajectory,
	type OptimizeRequest,
	parseOptimizeRequest,
	parseTrainingCandidate,
	serializeTrainingArtifactProgram,
	type TrainingCandidate,
	type TrainingEngineId,
	type TrainingEnginePort,
} from "@hobo/core";
import { AgentLightningPayloadSchema } from "./_generated/agent_lightning_payload_pb.js";

// The Microsoft Agent Lightning adapter (ADR-0025 optional provider). Agent
// Lightning is an out-of-process RL trainer: it runs the agent as an
// environment, collects rollouts, and returns an optimized policy. This
// adapter is the thin, port-conformant boundary — it lowers an
// hobo:training-engine OptimizeRequest to a rollout submission, delegates the
// actual training to an injected transport (the RL server client), and lifts
// the returned policy back into a platform TrainingArtifact. Selected behind
// the WIT port per tenant/Camp; never exported through the SDK surface.
// Record shapes come from @hobo/core's generated proto types; the only local
// record is the engine-payload proto in this package's data-models.

const AGENT_LIGHTNING_ENGINE_ID = "hobo.training-engine/agent-lightning@0.1.0";

// The adapter-protocol version pinned onto the artifact's engine_version so a
// promoted policy records which adapter produced it.
const ADAPTER_VERSION = "0.1.0";

/** One optimized rollout returned by an Agent Lightning training run. */
export interface AgentLightningRollout {
	readonly rolloutId: string;
	/** The tuned system/instruction prompt Agent Lightning converged on. */
	readonly instructions: string;
	/** The engine-internal serialized policy, opaque to the platform. */
	readonly serializedPolicyJson: string;
	/** High-reward demonstrations to carry as the deterministic floor. */
	readonly demos?: readonly {
		readonly input: unknown;
		readonly output: unknown;
	}[];
}

/**
 * The out-of-process Agent Lightning trainer, injected so the adapter stays a
 * pure boundary: a Camp wires the real RL-server client, conformance runs wire
 * a deterministic stub. The adapter has no ambient endpoint or credentials by
 * design (secretless-first).
 */
export interface AgentLightningTransport {
	submit(request: OptimizeRequest): Promise<AgentLightningRollout>;
}

export interface AgentLightningEngineOptions {
	readonly transport: AgentLightningTransport;
	readonly engineId?: string;
}

export function createAgentLightningTrainingEngine(
	options: AgentLightningEngineOptions,
): TrainingEnginePort {
	const engineId = (options.engineId ??
		AGENT_LIGHTNING_ENGINE_ID) as TrainingEngineId;

	return {
		engineId,
		async optimize(request: OptimizeRequest): Promise<TrainingCandidate> {
			// Parse, don't validate: the boundary re-parses even trusted callers.
			const parsed = parseOptimizeRequest(request);
			const rollout = await options.transport.submit(parsed);

			// The engine-internal payload rides the platform artifact's
			// engine_payload_json (core owns the outer program serializer, so the
			// TrainingArtifactProgram proto shape is never hand-built here).
			const enginePayloadJson = JSON.stringify(
				toJson(
					AgentLightningPayloadSchema,
					create(AgentLightningPayloadSchema, {
						rolloutId: rollout.rolloutId,
						serializedPolicyJson: rollout.serializedPolicyJson,
					}),
				),
			);
			const programJson = serializeTrainingArtifactProgram({
				instructions: rollout.instructions || (parsed.rubric?.objective ?? ""),
				demos: rollout.demos ?? [],
				enginePayloadJson,
			});

			// Return through the port's own parser so an adapter or transport bug
			// can never emit an out-of-contract candidate.
			return parseTrainingCandidate({
				id: `candidate-${parsed.requestId}`,
				engineId,
				provenance: {
					trajectoryHashes: parsed.trajectories.map((trajectory) =>
						hashTrajectory(trajectory),
					),
					rubricRef: parsed.rubric?.id ?? "",
					contractRef: parsed.contract?.ref ?? "",
				},
				artifact: {
					engineId,
					engineVersion: ADAPTER_VERSION,
					methodRef: parsed.contract?.method ?? "",
					programJson,
				},
			});
		},
	};
}
