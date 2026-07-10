export { promotionEventNames } from "./events.js";
export type {
	ChampionChallenger,
	EvalResult,
	LensFlags,
	PromotionDecision,
	PromotionGateInput,
	PromotionThresholds,
} from "./gate.js";
export {
	evaluatePromotionGate,
	PromotionGateParseError,
	PromotionOutcome,
	parseEvalResult,
	parsePromotionThresholds,
} from "./gate.js";
