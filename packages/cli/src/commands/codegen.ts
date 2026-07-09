import { isCodegenError, runCodegen } from "../codegen/run-codegen.js";
import type { CommandModule } from "../shell/registry.js";

export type { CodegenRequest } from "../codegen/run-codegen.js";
export { isCodegenError, runCodegen } from "../codegen/run-codegen.js";

export function createCodegenCommand(): CommandModule {
	return {
		run: async ({ context, flags }) => {
			const projectRoot = context.projectDir ?? context.cwd;
			try {
				const result = await runCodegen({ projectRoot, check: flags.check });
				const count = flags.check
					? result.checked.length
					: result.written.length;
				return {
					ok: true,
					status: "ok",
					code: "HOBO_OK",
					message: flags.check
						? `hobo codegen ok (${count} generated files up to date)`
						: `hobo codegen ok (${count} generated files written)`,
					data: {
						command: "codegen",
						mode: result.mode,
						written: result.written,
						checked: result.checked,
					},
				};
			} catch (error) {
				if (isCodegenError(error)) {
					const detail = (error as { detail?: unknown }).detail;
					return {
						ok: false,
						status: "error",
						code: error.code,
						message: error.message,
						remediation: [
							"Run `hobo codegen` to rewrite the checked-in src/_generated/ tree from your project sources.",
						],
						data: { command: "codegen", detail },
					};
				}
				throw error;
			}
		},
	};
}
