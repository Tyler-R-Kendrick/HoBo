/**
 * Scenario registry — deterministic scripts the browser bundle and tests
 * both load. Keyed by scenario id (the `&scenario=` URL value).
 */

import { deploySaga } from "./deploy-saga.js";
import { firstRun } from "./first-run.js";
import { incidentStorm } from "./incident-storm.js";
import { quietYard } from "./quiet-yard.js";
import { quotaExhaustion } from "./quota-exhaustion.js";
import { revokedConnection } from "./revoked-connection.js";
import type { YardScenario } from "./scenario.js";

export const SCENARIOS: Record<string, YardScenario> = Object.freeze({
	[quietYard.id]: quietYard,
	[incidentStorm.id]: incidentStorm,
	[quotaExhaustion.id]: quotaExhaustion,
	[revokedConnection.id]: revokedConnection,
	[deploySaga.id]: deploySaga,
	[firstRun.id]: firstRun,
});

export { deploySaga } from "./deploy-saga.js";
export { firstRun } from "./first-run.js";
export { incidentStorm } from "./incident-storm.js";
export { quietYard } from "./quiet-yard.js";
export { quotaExhaustion } from "./quota-exhaustion.js";
export { revokedConnection } from "./revoked-connection.js";
export {
	type BeatRegion,
	baseSnapshot,
	beat,
	costMeterRegion,
	type ExpectedBeat,
	makeActivity,
	makeConnection,
	makeOccupancy,
	makeRail,
	SCENARIO_STATION_ID,
	type SnapshotPatch,
	type YardScenario,
	zoneRegion,
} from "./scenario.js";
