/** Browser-safe yard deploy source types + helpers (no Node fs). */

export type YardDeploySource = {
	readonly targetId: string;
	readonly sourcePath: string;
	readonly source: string;
};

export function yardDeployByTarget(
	sources: readonly YardDeploySource[],
): ReadonlyMap<string, YardDeploySource> {
	return new Map(sources.map((entry) => [entry.targetId, entry]));
}
