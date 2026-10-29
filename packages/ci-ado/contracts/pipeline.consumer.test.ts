import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	loadAdoProject,
	parseAdoProject,
	renderAzurePipeline,
} from "../src/index.js";
import pact from "./pipeline.pact.json" with { type: "json" };

// Hand-authored consumer expectation. This does not verify a live ADO agent or service.
describe("Azure Pipelines YAML consumer contract", () => {
	it("selects the named pool and uses the official Pipeline Artifact task", async () => {
		const interaction = pact.interactions[0];
		if (!interaction) throw new Error("missing Pact interaction");
		const expected = interaction.response[0]?.contents;
		if (!expected) throw new Error("missing Pact response");
		const { pipeline } = await loadAdoProject(
			resolve(import.meta.dirname, "../../.."),
			"packages/ci-ado/examples/ci.json",
		);
		const project = parseAdoProject(
			JSON.stringify(interaction.request.contents),
		);
		const yaml = parse(
			renderAzurePipeline(
				project,
				pipeline,
				"packages/ci-ado/examples/ci.json",
			),
		);
		expect(yaml.jobs[0].pool).toEqual(expected.pool);
		expect(yaml.jobs[0].steps.at(-1)).toMatchObject({
			task: expected.task,
			inputs: expected.inputs,
		});
	});
});
