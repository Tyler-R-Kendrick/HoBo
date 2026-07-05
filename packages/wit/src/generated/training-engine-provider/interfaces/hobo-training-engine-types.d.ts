/** @module Interface hobo:training-engine/types@0.1.0 **/
export interface GeneratedRegionRef {
  regionId: string,
  artifactRef: string,
  startOffset: bigint,
  endOffset: bigint,
  owner: string,
}
export interface AgentRef {
  id: string,
  principalRef: string,
}
export interface RunRef {
  id: string,
  tenantId: string,
  bindle: string,
  agent: AgentRef,
}
export interface Span {
  id: string,
  parentId?: string,
  name: string,
  attributesJson: string,
  inputsJson: string,
  outputsJson: string,
}
export interface Reward {
  source: string,
  rubricRef: string,
  score: number,
}
export interface Trajectory {
  schema: string,
  id: string,
  traceparent: string,
  run: RunRef,
  method: string,
  contractRef: string,
  generatedRegion: GeneratedRegionRef,
  spans: Array<Span>,
  payloadsJson: string,
  reward: Reward,
}
export interface Rubric {
  id: string,
  objective: string,
}
export interface ContractRef {
  ref: string,
  method: string,
  allowedRegionId: string,
}
export interface OptimizeRequest {
  schema: string,
  requestId: string,
  generatedRegion: GeneratedRegionRef,
  trajectories: Array<Trajectory>,
  rubric: Rubric,
  contract: ContractRef,
}
export interface CandidateEdit {
  startOffset: bigint,
  endOffset: bigint,
  replacement: string,
}
export interface CandidatePatch {
  schema: string,
  id: string,
  engineId: string,
  region: GeneratedRegionRef,
  edits: Array<CandidateEdit>,
  provenanceJson: string,
}
/**
 * ADR-0125: the serialized-optimized-program candidate form, applied at
 * component instantiation. program-json is engine-defined and opaque,
 * pinned by engine id + version.
 */
export interface TrainingArtifact {
  schema: string,
  id: string,
  engineId: string,
  engineVersion: string,
  methodRef: string,
  programJson: string,
  provenanceJson: string,
}
export type Candidate = CandidatePatch | CandidateArtifact;
export interface CandidatePatch {
  tag: 'patch',
  val: CandidatePatch,
}
export interface CandidateArtifact {
  tag: 'artifact',
  val: TrainingArtifact,
}
export interface TrainingError {
  code: string,
  message: string,
}
