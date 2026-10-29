import { fromJsonString } from "@bufbuild/protobuf";
import { parseRelativePath } from "@hobo/ci/execution";
import { type AdoProject, AdoProjectSchema } from "./_generated/project_pb.js";

declare const parsedProject: unique symbol;
export type ParsedAdoProject = AdoProject & { readonly [parsedProject]: true };

export function parseAdoProject(json: string): ParsedAdoProject {
	const project = fromJsonString(AdoProjectSchema, json);
	if (
		project.schemaVersion !== "hobo.ci.ado/v1" ||
		!/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,99}$/.test(project.pool) ||
		project.pool.toLowerCase() === "azure pipelines" ||
		project.pool !== project.pool.trim() ||
		!/^[A-Za-z0-9_-]{1,64}$/.test(project.artifactPrefix) ||
		project.demands.length > 16 ||
		new Set(project.demands).size !== project.demands.length ||
		project.demands.some(
			(demand) =>
				/^Agent[.]OS($| )/i.test(demand) && demand !== "Agent.OS -equals Linux",
		) ||
		project.demands.some(
			(demand) =>
				!/^[A-Za-z][A-Za-z0-9_.-]*( -equals [A-Za-z0-9_.-]+)?$/.test(demand),
		)
	)
		throw new Error(
			"invalid Azure Pipelines self-hosted project configuration",
		);
	parseProjectPath(project.pipelinePath);
	Object.freeze(project.demands);
	// SAFETY: strict protobuf parsing, dependent constraints and frozen nested fields refine the generated record.
	return Object.freeze(project) as ParsedAdoProject;
}

/** Paths interpolated by Azure must be literal workspace paths, never expressions. */
export function parseProjectPath(path: string): string {
	parseRelativePath(path);
	if (!/^[A-Za-z0-9_.-][A-Za-z0-9_./-]{0,499}$/.test(path))
		throw new Error("ADO paths must be literal workspace-relative paths");
	return path;
}
