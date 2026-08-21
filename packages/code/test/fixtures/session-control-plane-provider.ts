import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import {
	isJsonObject,
	type JsonObject,
	type JsonValue,
} from "../../src/json.js";

import { parseGuestEvidenceSubmission } from "../../src/parse.js";

interface PactInteraction {
	readonly description: string;
	readonly request: {
		readonly method: string;
		readonly path: string;
		readonly body?: unknown;
	};
	readonly response: {
		readonly status: number;
		readonly body: JsonValue;
	};
}

interface PactDocument {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly interactions: readonly PactInteraction[];
}

interface ResidentSnapshot {
	readonly schemaVersion: string;
	readonly session: {
		readonly id: string;
		readonly lifecycleState: string;
	};
	readonly panes: readonly {
		readonly id: string;
		readonly runtimeId: string;
	}[];
	readonly attachedClientIds: readonly string[];
	readonly focusedPaneId: string;
}

function object(input: JsonValue): JsonObject {
	assert(input && isJsonObject(input) && !Array.isArray(input));
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return input as JsonObject;
}

function stringField(input: JsonValue, field: string): string {
	const value = object(input)[field];
	assert.equal(
		Object.prototype.toString.call(value),
		"[object String]",
		`${field} must be a string`,
	);
	assert.notEqual(value, "", `${field} must not be empty`);
	return value;
}

function contains(actual: JsonValue, expected: JsonValue): void {
	if (Array.isArray(expected)) {
		assert(Array.isArray(actual));
		assert.equal(actual.length, expected.length);
		for (let index = 0; index < expected.length; index += 1) {
			contains(actual[index], expected[index]);
		}
		return;
	}
	if (expected && isJsonObject(expected)) {
		const actualObject = object(actual);
		for (const [key, value] of Object.entries(expected)) {
			contains(actualObject[key], value);
		}
		return;
	}
	assert.deepEqual(actual, expected);
}

export async function verifySessionControlPlanePact(input: JsonValue): Promise<{
	readonly consumer: string;
	readonly provider: string;
	readonly verifiedDescriptions: readonly string[];
	readonly snapshot: ResidentSnapshot;
}> {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const pact = input as PactDocument;
	assert.equal(pact.consumer.name, "@hobo/code");
	assert.equal(pact.provider.name, "SessionControlPlane");
	assert(Array.isArray(pact.interactions));

	let snapshot: ResidentSnapshot | undefined;
	const server = createServer(async (request, response) => {
		const bodyChunks: Buffer[] = [];
		for await (const chunk of request) bodyChunks.push(Buffer.from(chunk));
		const body = bodyChunks.length
			? JSON.parse(Buffer.concat(bodyChunks).toString("utf8"))
			: {};
		let result: JsonValue = null;

		switch (`${request.method} ${request.url}`) {
			case "POST /code/isolation":
				result = {
					schemaVersion: "hobo.code.isolation/v1",
					status: "open",
					backend: { kind: "worktree" },
				};
				break;
			case "POST /code/isolation/cleanup":
				result = { status: "cleaned", orphans: [] };
				break;
			case "POST /code/promote":
				assert.equal(object(body).squashOnly, true);
				result = {
					ok: true,
					code: "HOBO_CODE_PROMOTED",
					cleaned: true,
				};
				break;
			case "POST /code/evidence": {
				const submission = parseGuestEvidenceSubmission(body);
				result = {
					...submission,
					verification: "claimed",
					origin: "hobo-code:control-server",
				};
				break;
			}
			case "POST /code/sessions": {
				const sessionId = stringField(body, "sessionId");
				const clientId = stringField(body, "clientId");
				snapshot = {
					schemaVersion: "hobo.code.session-snapshot/v1",
					session: {
						id: sessionId,
						lifecycleState: "SESSION_LIFECYCLE_STATE_RUNNING",
					},
					panes: [
						{ id: "pane-coordinator", runtimeId: "%1" },
						{ id: "pane-worker", runtimeId: "%2" },
					],
					attachedClientIds: [clientId],
					focusedPaneId: "pane-coordinator",
				};
				result = snapshot;
				break;
			}
			case "POST /code/sessions/session-1/detach":
				assert(snapshot, "session must exist before detach");
				snapshot = { ...snapshot, attachedClientIds: [] };
				result = snapshot;
				break;
			case "POST /code/sessions/session-1/reattach":
				assert(snapshot, "session must exist before reattach");
				snapshot = {
					...snapshot,
					attachedClientIds: [stringField(body, "clientId")],
				};
				result = snapshot;
				break;
			case "POST /code/sessions/session-1/focus": {
				assert(snapshot, "session must exist before focus");
				const paneId = stringField(body, "paneId");
				assert(snapshot.panes.some((pane) => pane.id === paneId));
				snapshot = { ...snapshot, focusedPaneId: paneId };
				result = snapshot;
				break;
			}
			case "GET /code/sessions/session-1/git?kind=file&value=README.md":
				result = {
					branch: "code/session-contract",
					ahead: 1,
					behind: 0,
					files: [
						{
							path: "README.md",
							staged: false,
							unstaged: true,
							untracked: false,
						},
					],
					branches: [],
					commits: [],
					stashes: [],
					selectedDiff: {
						path: "README.md",
						text: "+workbench\n",
						truncated: false,
					},
					truncated: {
						files: false,
						branches: false,
						commits: false,
						stashes: false,
					},
				};
				break;
			case "POST /code/sessions/session-1/git/actions":
				assert.equal(
					object(body).action,
					"GIT_WORKBENCH_ACTION_KIND_BRANCH_CREATE",
				);
				assert.equal(object(body).argument, "code/contract-branch");
				result = { ok: true };
				break;
			default:
				response.writeHead(404).end();
				return;
		}

		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify(result));
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	try {
		const address = server.address();
		assert(address && isJsonObject(address));
		for (const interaction of pact.interactions) {
			const response = await fetch(
				`http://127.0.0.1:${address.port}${interaction.request.path}`,
				{
					method: interaction.request.method,
					headers: { "content-type": "application/json" },
					body:
						interaction.request.body === undefined
							? undefined
							: JSON.stringify(interaction.request.body),
				},
			);
			assert.equal(response.status, interaction.response.status);
			contains(await response.json(), interaction.response.body);
		}
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}

	assert(snapshot, "session interactions must produce a snapshot");
	return {
		consumer: pact.consumer.name,
		provider: pact.provider.name,
		verifiedDescriptions: pact.interactions.map(
			({ description }) => description,
		),
		snapshot,
	};
}
