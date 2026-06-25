import type { MatchContext, ResourceDefinition } from "../../resource-definition-driver-contract/src/resource-definition-driver-contract.d.ts";

export type MatchObjective = "cost" | "latency" | "single-provider" | "carbon" | "maximize-credits";

export type RankedDefinition = {
  definitionId: string;
  specificity: number;
  priority: number;
  objectiveScore: 0;
  rank: number;
};

export type RejectedCandidate = {
  definitionId: string;
  reason: string;
};

export type SuccessfulMatchingDecision = {
  ok: true;
  schema: "hobo.matching-engine/v1";
  context: MatchContext & { resourceType: string };
  objective: MatchObjective;
  catalogContentHash: `sha256:${string}`;
  winner: ResourceDefinition;
  ranking: RankedDefinition[];
  rejectedCandidates: RejectedCandidate[];
  tie: boolean;
  tiedDefinitionIds: string[];
  planWarnings: string[];
};

export type FailedMatchingDecision = {
  ok: false;
  schema: "hobo.matching-engine/v1";
  context: MatchContext & { resourceType: string };
  objective: MatchObjective;
  catalogContentHash: `sha256:${string}`;
  reason: string;
  ranking: [];
  rejectedCandidates: RejectedCandidate[];
  tie: false;
  tiedDefinitionIds: [];
  planWarnings: [];
};

export type MatchingDecision = SuccessfulMatchingDecision | FailedMatchingDecision;

export declare function decideResourceDefinition(input: {
  catalog: { snapshot(): { definitions: ResourceDefinition[]; contentHash: string } } | { definitions: ResourceDefinition[]; contentHash: string };
  context: MatchContext & { resourceType: string };
  objective?: MatchObjective;
}): MatchingDecision;

export declare function matchingDecisionToEvent(
  decision: SuccessfulMatchingDecision,
  overrides?: Record<string, unknown>
): Record<string, unknown>;

export declare function rankingSummary(decision: MatchingDecision): string[];
