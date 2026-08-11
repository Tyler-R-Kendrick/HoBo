import type { SessionControlServer } from "../../../../src/session-control-server.ts";

export type CommandResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

export type BrowserJourney = {
	server: SessionControlServer;
	headers: Record<string, string>;
	html: string;
	commands: string[];
};

export type OptimizexpWorld = {
	featureId: string;
	personaId: string | null;
	scenarioName: string;
	command: CommandResult | null;
	browser: BrowserJourney | null;
	temporaryPaths: string[];
};

export function createWorld(
	featureId = "hobo-code-herdr-mux",
): OptimizexpWorld {
	return {
		featureId,
		personaId: null,
		scenarioName: "",
		command: null,
		browser: null,
		temporaryPaths: [],
	};
}
