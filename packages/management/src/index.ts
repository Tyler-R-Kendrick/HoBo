export {
	createManagementContext,
	resolveDefaultStationId,
	type ManagementContext,
} from "./context.js";
export {
	errResult,
	okResult,
	type ManagementResult,
} from "./result.js";
export {
	stationInit,
	stationStatus,
	stationUp,
	stationDown,
	stationRailsList,
	stationRailsPublish,
	stationRailsApprove,
	stationRailsActivate,
	type StationInitInput,
} from "./station-ops.js";
export {
	connectionCreate,
	connectionAuthorize,
	connectionList,
	connectionGet,
	connectionRevoke,
	connectionRotate,
} from "./connection-ops.js";
export {
	projectYardSnapshot,
	brokerStatus,
	doctorSnapshot,
} from "./projections.js";
export type {
	ManagementActor,
	ManagementHome,
	PublicConnectionView,
	RailPublicView,
	MeteringView,
	ConnectorActivityView,
	DoctorView,
	YardProjectionSnapshot,
	BrokerStatusView,
} from "./types.js";
export { toPublicConnection, toRailPublicView } from "./types.js";

// public-contract: the package id consumers assert against.
export const HOBO_MANAGEMENT_PACKAGE = "@hobo/management";
