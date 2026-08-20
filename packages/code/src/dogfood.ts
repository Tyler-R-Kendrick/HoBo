/**
 * Dogfooding surface: stations for isolation boundaries, trails/training/cq
 * for continuous improvement of the codegen harness itself.
 */

export interface StationOccupancyRef {
	readonly stationId: string;
	readonly railHash?: string;
	readonly isolationBoundary: "station";
}

export interface CodeTrailRef {
	readonly trailId: "code.templates.improve" | "code.autocode.heuristics";
	readonly kind: "trail";
	readonly improves: "templates" | "autocode";
}

export interface CqReflectHook {
	readonly command: "/cq:reflect";
	readonly localMcpMandatory: true;
	readonly remotePreferred: true;
	readonly proposesKnowledgeUnits: true;
}

export function dogfoodStationOccupancy(
	stationId: string,
): StationOccupancyRef {
	return {
		stationId,
		isolationBoundary: "station",
	};
}

export function codeImprovementTrails(): readonly CodeTrailRef[] {
	return [
		{
			trailId: "code.templates.improve",
			kind: "trail",
			improves: "templates",
		},
		{
			trailId: "code.autocode.heuristics",
			kind: "trail",
			improves: "autocode",
		},
	];
}

export function cqReflectHook(): CqReflectHook {
	return {
		command: "/cq:reflect",
		localMcpMandatory: true,
		remotePreferred: true,
		proposesKnowledgeUnits: true,
	};
}

export function dogfoodSummary(stationId: string) {
	return {
		stations: dogfoodStationOccupancy(stationId),
		trails: codeImprovementTrails(),
		cq: cqReflectHook(),
		finops: true,
		openFeature: true,
		harness: true,
		connectivity: true,
	};
}
