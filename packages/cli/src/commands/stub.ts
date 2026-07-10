import { resolve } from "node:path";

import { loadSourceModel } from "../codegen/engine.js";
import { runCodegen } from "../codegen/run-codegen.js";
import { buildTrainables } from "../codegen/trainables.js";
import {
	type CodegenEngine,
	CodegenError,
	defaultCodegenLayout,
} from "../codegen/types.js";
import type { CommandModule } from "../shell/registry.js";

export interface StubCommandOptions {
	readonly engine?: CodegenEngine;
}

/**
 * `hobo stub` materializes the contract-backed trainable stubs codegen emits
 * for the project's bindle steps (src/_generated/trainables.ts) and reports
 * their descriptors; `--check` validates the generated tree without writing.
 */
export function createStubCommand(
	options: StubCommandOptions = {},
): CommandModule {
	return {
		run: async ({ context, flags }) => {
			const projectRoot = resolve(context.projectDir ?? context.cwd);
			try {
				const result = await runCodegen(
					{ projectRoot, check: flags.check },
					options,
				);
				const model = await loadSourceModel(
					projectRoot,
					(options.engine?.layout ?? defaultCodegenLayout()).sources,
				);
				const stubs = buildTrainables(model).stubs;
				return {
					ok: true,
					status: "ok",
					code: "HOBO_OK",
					message: `hobo stub ok (${stubs.length} contract-backed trainable stubs)`,
					data: {
						command: "stub",
						mode: result.mode,
						trainables: stubs,
						written: result.written,
						checked: result.checked,
					},
				};
			} catch (error) {
				if (error instanceof CodegenError) {
					return {
						ok: false,
						status: "error",
						code: error.code,
						message: error.message,
						remediation: [
							"Run `hobo stub` (or `hobo codegen`) to rewrite the checked-in src/_generated/ tree, including the trainable stubs.",
						],
						data: { command: "stub", detail: error.detail },
					};
				}
				throw error;
			}
		},
	};
}
