import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
	CIWorkflow,
	type CiContext,
	type CiParams,
	type CloudflareArtifacts,
} from "@cloudflare/ci";
import { type CiBindings, CiSandbox } from "@cloudflare/ci/worker";
import { executePipeline, parsePipeline } from "@hobo/ci/execution";
import { createCloudflareBackend } from "../../src/backend.js";
import {
	assertLocalPreparation,
	localBackupOptions,
	localSourceAdapter,
} from "../../src/local-source.js";

type Bindings = CiBindings & {
	HOBO_PIPELINE_JSON: string;
	HOBO_SOURCE_SHA: string;
	HOBO_PREPARATION_ID: string;
};

export class LocalCiSandbox extends CiSandbox {
	override createBackup(
		options: Parameters<CiSandbox["createBackup"]>[0],
	): ReturnType<CiSandbox["createBackup"]> {
		return super.createBackup(localBackupOptions(options));
	}
}

/** Local Workflows and Docker execute the same native CI context as the cloud. */
export class HoBoLocalCI extends CIWorkflow<CloudflareArtifacts, Bindings> {
	static override getProvider() {
		return localSourceAdapter();
	}

	protected async pipeline(
		event: WorkflowEvent<CiParams<CloudflareArtifacts>>,
		_step: WorkflowStep,
		ci: CiContext,
	): Promise<void> {
		assertLocalPreparation(
			event.payload,
			this.env.HOBO_SOURCE_SHA,
			this.env.HOBO_PREPARATION_ID,
		);
		const backend = createCloudflareBackend({
			context: ci,
			terminate: async () => {
				const instance = await this.env.CI_WORKFLOW.get(event.instanceId);
				await instance.terminate();
			},
		});
		const result = await executePipeline(
			backend,
			parsePipeline(this.env.HOBO_PIPELINE_JSON),
		);
		console.log(JSON.stringify(result));
		if (result.status !== "succeeded")
			throw new Error(`HoBo local CI finished with ${result.status}`);
	}
}

// Trigger/status/termination use Wrangler's existing local Workflow API.
export default {
	fetch: () => new Response("HoBo CI local runtime"),
} satisfies ExportedHandler<Bindings>;
