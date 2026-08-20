import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { JsonObject, JsonValue } from "./json.js";

import { type MuxRunner, tmuxRunner } from "./mux.js";
import {
	createResidentSessionRuntime,
	type ResidentSessionRuntime,
	residentSessionTmuxName,
} from "./resident-session-runtime.js";
import type { SessionSnapshot } from "./session-contract.js";
import {
	createSessionOrchestrator,
	type SessionDeliveryApproval,
	type SessionProcessRunner,
	sessionDeliveryApprovalDigest,
} from "./session-orchestrator.js";

export interface LocalSessionControlOptions {
	readonly hoboHome: string;
	readonly tmux?: MuxRunner;
	readonly runner?: SessionProcessRunner;
	readonly authorize?: (
		action: SessionDeliveryApproval,
		snapshot: SessionSnapshot,
	) => boolean | Promise<boolean>;
}

export interface LocalSessionControl {
	readonly runtime: ResidentSessionRuntime;
	list(): Promise<readonly SessionSnapshot[]>;
	load(sessionId: string): Promise<SessionSnapshot | undefined>;
	capturePane(
		sessionId: string,
		paneId: string,
		lines?: number,
	): Promise<string>;
	execute(
		command: JsonValue,
		approval?: boolean | string,
	): Promise<SessionSnapshot>;
	tmuxName(sessionId: string): string;
	close(): void;
}

export function createLocalSessionControl(
	options: LocalSessionControlOptions,
): LocalSessionControl {
	const dataDir = join(options.hoboHome, "durable", "code", "sessions");
	const worktreesDir = join(options.hoboHome, "worktrees", "code");
	const runtime = createResidentSessionRuntime({
		dataDir,
		tmux: options.tmux ?? tmuxRunner(),
	});
	return {
		runtime,
		list: () => runtime.list(),
		load: (sessionId) => runtime.load(sessionId),
		capturePane: (sessionId, paneId, lines) =>
			runtime.capturePane(sessionId, paneId, lines),
		execute(command, approval = false) {
			return createSessionOrchestrator({
				runtime,
				worktreesDir,
				...(options.runner ? { runner: options.runner } : undefined),
				authorize: async (action, snapshot) =>
					(approval === true ||
						approval === sessionDeliveryApprovalDigest(action)) &&
					(options.authorize === undefined ||
						(await options.authorize(action, snapshot))),
			}).execute(command);
		},
		tmuxName: residentSessionTmuxName,
		close: () => runtime.close(),
	};
}

export function sessionCommandEnvelope(
	sessionId: string,
	expectedRevision: bigint,
	actorId: string,
	command: string,
	value: JsonObject,
): JsonObject {
	return {
		schemaVersion: "hobo.code.session-command/v1",
		commandId: randomUUID(),
		actorId,
		sessionId,
		expectedRevision: expectedRevision.toString(),
		[command]: value,
	};
}
