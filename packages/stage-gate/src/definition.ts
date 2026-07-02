import type { StageGateDefinition, StageGateCheck } from "./types.js";

const NODE = process.execPath;
const TSX_IMPORT = "--import";
const TSX = "tsx";

function nodeTsxScript(scriptPath: string): readonly string[] {
	return [NODE, TSX_IMPORT, TSX, scriptPath];
}

export function defineStageGateS0(): StageGateDefinition {
	const scriptsRoot = "packages/stage-gate/scripts";
	const checks: StageGateCheck[] = [
		{
			checkId: "boundary-lint",
			kind: "lint",
			command: ["pnpm", "run", "lint:boundaries"],
		},
		{
			checkId: "architecture-guard",
			kind: "guard",
			command: ["pnpm", "run", "architecture:guard"],
		},
		{
			checkId: "schema-drift",
			kind: "schema",
			command: ["pnpm", "run", "test:schema"],
		},
		{
			checkId: "contract-consumer",
			kind: "contract",
			command: ["pnpm", "run", "test:contract:consumer"],
		},
		{
			checkId: "contract-provider",
			kind: "contract",
			command: ["pnpm", "run", "test:contract:provider"],
		},
		{
			checkId: "conformance-self-test",
			kind: "conformance",
			command: ["pnpm", "--filter", "@hobo/conformance", "test"],
		},
		{
			checkId: "hello-bindle-determinism",
			kind: "build",
			command: nodeTsxScript(`${scriptsRoot}/check-hello-bindle-determinism.mts`),
		},
		{
			checkId: "hello-bindle-health",
			kind: "build",
			command: nodeTsxScript(`${scriptsRoot}/check-hello-bindle-health.mts`),
		},
		{
			checkId: "sign-provenance-verify",
			kind: "sign",
			command: nodeTsxScript(`${scriptsRoot}/check-sign-verify.mts`),
		},
		{
			checkId: "tampered-artifact-refused",
			kind: "verify",
			command: nodeTsxScript(`${scriptsRoot}/check-tamper-refuse.mts`),
		},
	];

	return {
		gateId: "s0",
		checks,
	};
}
