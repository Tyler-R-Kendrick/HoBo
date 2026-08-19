/**
 * OptimizeXP World for feature `hobo-code-tui-craft`.
 * Shared mutable state for Cucumber steps — no live external services.
 */
export type OptimizexpWorld = {
	featureId: string;
	personaId: string | null;
	lastExitCode: number | null;
	lastStdout: string;
	lastStderr: string;
	lastCommand: string | null;
	notes: string[];
	statusClear: boolean;
	nextActionObvious: boolean;
	errorActionable: boolean;
	evidencePath: string | null;
};

export function createWorld(featureId: string): OptimizexpWorld {
	return {
		featureId,
		personaId: null,
		lastExitCode: null,
		lastStdout: "",
		lastStderr: "",
		lastCommand: null,
		notes: [],
		statusClear: false,
		nextActionObvious: false,
		errorActionable: false,
		evidencePath: null,
	};
}
