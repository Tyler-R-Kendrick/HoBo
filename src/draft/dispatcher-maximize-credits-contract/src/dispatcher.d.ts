export type DispatcherObjective = "maximize-credits";

export type DispatchCategory = "runner" | "build-machine";

export interface CreditLedgerAccount {
  providerId: string;
  dimension: string;
  currency?: string;
  listUnitCost?: number;
  freeHeadroom?: number;
  rateHeadroom?: number;
  concurrencyHeadroom?: number;
  budgetCap?: number;
  spendToDate?: number;
  credits?: Array<{
    creditId: string;
    freeHeadroom: number;
    expiresAt?: string;
    windowEnd?: string;
  }>;
}

export interface CreditLedgerView {
  view: "CreditLedgerView";
  seq: number;
  digest?: string;
  balanceHash?: string;
  accounts: CreditLedgerAccount[];
}

export interface DispatchProviderCandidate {
  id: string;
  providerId?: string;
  category: DispatchCategory;
  registered?: boolean;
  dimension?: string;
  listUnitCost?: number;
  switchingCost?: number;
}

export interface PlacementCandidate {
  id?: string;
  definitionId: string;
  providerId?: string;
  registered?: boolean;
  resourceType: string;
  dimension: string;
  listUnitCost?: number;
  specificity?: number;
  priority?: number;
  region?: string;
  switchingCost?: number;
}

export interface DispatcherRegistry {
  schema: string;
  records: DispatchProviderCandidate[];
  byCategory: Map<DispatchCategory, DispatchProviderCandidate[]>;
}

export interface DispatchDecisionRequest {
  registry: DispatcherRegistry | DispatchProviderCandidate[];
  category: DispatchCategory;
  dispatchId: string;
  objective?: DispatcherObjective;
  units?: number;
  incumbentProviderId?: string;
  ledgerView: CreditLedgerView;
}

export interface PlacementDecisionRequest {
  resourceId: string;
  resourceType: string;
  candidates: PlacementCandidate[];
  objective?: DispatcherObjective;
  units?: number;
  incumbentProviderId?: string;
  catalogContentHash?: string;
  ledgerView: CreditLedgerView;
}

export interface RankedDispatchCandidate {
  providerId: string;
  category: DispatchCategory;
  rank: number;
  effectiveMarginalCost: number;
  totalCost: number;
  freeUnits: number;
  paidUnits: number;
  switchingCost: number;
  budgetExceeded: boolean;
  creditFacts: string;
  nextCreditExpiresAt: string | null;
  rationale: string;
}

export interface DispatchDecision {
  ok: boolean;
  schema: string;
  objective: DispatcherObjective;
  selectedProvider?: string;
  reason?: string;
  ranking: RankedDispatchCandidate[];
  dispatchEvent?: Record<string, unknown>;
  replayInput?: Record<string, unknown>;
}

export interface PlacementDecision {
  ok: boolean;
  schema: string;
  objective: DispatcherObjective;
  winner?: string;
  selectedProvider?: string;
  reason?: string;
  ranking: Array<{
    definitionId: string;
    region?: string;
    specificity: number;
    priority: number;
    objectiveScore: number;
    rank: number;
    rationale: string;
  }>;
  rejectedCandidates: Array<{ definitionId: string; reason: string }>;
  tiedDefinitionIds?: string[];
  matchEvent?: Record<string, unknown>;
}

export declare const DISPATCHER_MAXIMIZE_CREDITS_VERSION: "hobo.dispatcher-maximize-credits/v1";
export declare function createDispatcherRegistry(providers?: DispatchProviderCandidate[]): DispatcherRegistry;
export declare function decideDispatch(request: DispatchDecisionRequest): DispatchDecision;
export declare function replayDispatchDecision(replayInput: Record<string, unknown>): DispatchDecision;
export declare function decidePlacement(request: PlacementDecisionRequest): PlacementDecision;
