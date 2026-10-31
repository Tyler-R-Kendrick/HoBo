import { inspect } from "node:util";

import type { IacProgram } from "@hobo/cloud";
import { at, first } from "@hobo/core/total-access";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type JsonObject, parseJsonObject } from "../src/json.js";
import {
	createVercelClient,
	VercelApiError,
	type VercelFetch,
	type VercelFetchResponse,
} from "../src/vercel-client.js";
import { createVercelDeployProvider } from "../src/vercel-deploy-provider.js";

// The Vercel deploy path deploys first. Create Deployment names its project, and
// on an account with no project by that name Vercel refuses it:
//   404 {"error":{"code":"not_found","message":"Project not found"}}
// Only then does the provider create the project (POST /v9/projects {name}; a 409
// means someone made it meanwhile) and deploy once more. A deploy to an existing
// project is one request, with no project call, and needs no project-read scope.
// NO network: every request goes to a scripted transport.

type SentInit = Parameters<VercelFetch>[1];

interface Sent {
	readonly url: string;
	readonly init: SentInit;
}

function reply(status: number, body: JsonObject): VercelFetchResponse {
	return {
		ok: status >= 200 && status < 300,
		status,
		async text() {
			return JSON.stringify(body);
		},
		async json() {
			return body;
		},
	};
}

// An answer whose body is not JSON, as a proxy in front of the API can give.
function plainReply(status: number, text: string): VercelFetchResponse {
	return {
		ok: status >= 200 && status < 300,
		status,
		async text() {
			return text;
		},
		async json() {
			throw new SyntaxError(`not JSON: ${text}`);
		},
	};
}

const PROJECT_NOT_FOUND = reply(404, {
	error: { code: "not_found", message: "Project not found" },
});
const CONFLICT = reply(409, {
	error: {
		code: "conflict",
		message: "A project with the same name already exists.",
	},
});
const CREATED = reply(200, { id: "prj_new", name: "hobo-hello-bindle" });
const DEPLOYED = reply(200, {
	id: "dpl_1",
	url: "hobo-hello-bindle-1.vercel.app",
});

/**
 * A transport that answers each `METHOD /path` from a queue of scripted
 * answers, in order. It fails the test on a request nobody scripted, and on a
 * request that carries an empty body.
 */
function scripted(
	script: Readonly<Record<string, readonly VercelFetchResponse[]>>,
) {
	const sent: Sent[] = [];
	const left = new Map(
		Object.entries(script).map(([route, answers]) => [route, [...answers]]),
	);
	const fetch: VercelFetch = async (url, init) => {
		sent.push({ url, init });
		const route = `${init.method} ${new URL(url).pathname}`;
		if (init.body === "") throw new Error(`empty body: ${route}`);
		const next = left.get(route)?.shift();
		if (next === undefined) throw new Error(`unscripted request: ${route}`);
		return next;
	};
	const routes = () =>
		sent.map(({ url, init }) => `${init.method} ${new URL(url).pathname}`);
	return { fetch, sent, routes };
}

function programFor(deploymentId: string): IacProgram {
	return {
		programId: `prog-${deploymentId}`,
		deploymentId,
		resourceId: "service",
		provider: "vercel",
		driver: "vercel",
		action: "apply",
		stackName: `stack-${deploymentId}`,
	};
}

const DEPLOY = "POST /v13/deployments";
const CREATE = "POST /v9/projects";

describe("createVercelDeployProvider deploys first (scripted transport, no network)", () => {
	it("deploys to an existing project in one request, with no project call", async () => {
		const { fetch, sent, routes } = scripted({ [DEPLOY]: [DEPLOYED] });
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([DEPLOY]);
		expect(outputs.url).toBe("https://hobo-hello-bindle-1.vercel.app");
		expect(outputs).toMatchObject({
			projectCreated: "false",
			scope: "personal",
		});
		const deploy = parseJsonObject(first(sent).init.body ?? "");
		expect(deploy.project).toBe("hobo-hello-bindle");
	});

	it("on a missing project: deploy 404, create the project, deploy again", async () => {
		const { fetch, sent, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND, DEPLOYED],
			[CREATE]: [CREATED],
		});
		const provider = createVercelDeployProvider({
			token: "tok",
			fetch,
			teamId: "team_7",
		});

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
		expect(outputs.url).toBe("https://hobo-hello-bindle-1.vercel.app");
		expect(outputs.deploymentId).toBe("dpl_1");
		expect(outputs).toMatchObject({ projectCreated: "true", scope: "team_7" });
		for (const { url } of sent) {
			expect(new URL(url).search).toBe("?teamId=team_7");
		}
		expect(at(sent, 1).init).toEqual({
			method: "POST",
			headers: {
				Authorization: "Bearer tok",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: "hobo-hello-bindle" }),
		});
		// The second deployment is the first one sent again.
		expect(at(sent, 2).init).toEqual(at(sent, 0).init);
	});

	it("deploys again when the create is answered 409 (made meanwhile)", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND, DEPLOYED],
			[CREATE]: [CONFLICT],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
		expect(outputs.url).toBe("https://hobo-hello-bindle-1.vercel.app");
		expect(outputs).toMatchObject({
			projectCreated: "false",
			scope: "personal",
		});
	});

	// The project lives in team_acme, but the provider was given no teamId, so
	// Vercel looks for it in the token's own scope, answers "Project not found",
	// and the create makes a second project of that name there. That does not
	// fail; the outputs say it happened, and where.
	it("with no teamId, creates the project in the personal scope and says so", async () => {
		const { fetch, sent, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND, DEPLOYED],
			[CREATE]: [CREATED],
		});
		const provider = createVercelDeployProvider({
			token: "tok",
			fetch,
			projectName: "acme-site",
		});

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
		for (const { url } of sent) expect(new URL(url).search).toBe("");
		expect(outputs).toMatchObject({
			projectCreated: "true",
			scope: "personal",
		});
	});

	it("retries a Project not found in any letter case", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [
				reply(404, {
					error: { code: "not_found", message: "project not found" },
				}),
				DEPLOYED,
			],
			[CREATE]: [CREATED],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
		expect(outputs.deploymentId).toBe("dpl_1");
	});

	it.each([
		[
			"a 404 with another code",
			reply(404, {
				error: {
					code: "deployment_not_found",
					message: "Deployment not found",
				},
			}),
			404,
			"deployment_not_found",
		],
		[
			"a 404 for something other than the project",
			reply(404, { error: { code: "not_found", message: "Team not found" } }),
			404,
			"not_found",
		],
		[
			"a 404 that says Project not found under another code",
			reply(404, {
				error: { code: "forbidden", message: "Project not found" },
			}),
			404,
			"forbidden",
		],
		[
			"a status other than 404 that says not_found, Project not found",
			reply(400, {
				error: { code: "not_found", message: "Project not found" },
			}),
			400,
			"not_found",
		],
		[
			"a 404 whose body is not JSON",
			plainReply(404, "Not Found"),
			404,
			undefined,
		],
	])("does not retry %s", async (_case, refusal, status, code) => {
		const { fetch, routes } = scripted({ [DEPLOY]: [refusal] });
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({ status, code });
		expect(routes()).toEqual([DEPLOY]);
	});

	it("propagates a second 404 after the create, and deploys no more", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND, PROJECT_NOT_FOUND],
			[CREATE]: [CREATED],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			status: 404,
			code: "not_found",
			apiMessage: "Project not found",
			message: expect.stringMatching(/HTTP 404.*not_found/u),
		});
		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
	});

	it.each([
		[400, "bad_request", "Invalid request: `files` should be array."],
		[403, "forbidden", "Not authorized"],
		[409, "conflict", "The deployment is already in progress."],
		[429, "rate_limited", "Rate limit exceeded"],
		[500, "internal_server_error", "An unexpected error happened."],
	])("propagates a deploy answered %i as a VercelApiError with its status, code and message", async (status, code, message) => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [reply(status, { error: { code, message } })],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			name: "VercelApiError",
			status,
			code,
			apiMessage: message,
			message: expect.stringContaining(
				`create deployment failed (HTTP ${status})`,
			),
		});
		expect(routes()).toEqual([DEPLOY]);
	});

	it("propagates a create answered 409 with another code, and deploys no more", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND],
			[CREATE]: [
				reply(409, {
					error: {
						code: "project_transfer_in_progress",
						message: "The project is being transferred.",
					},
				}),
			],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			status: 409,
			code: "project_transfer_in_progress",
		});
		expect(routes()).toEqual([DEPLOY, CREATE]);
	});

	it("names the 409's reason when the deployment after a 409 conflict is refused", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND, PROJECT_NOT_FOUND],
			[CREATE]: [CONFLICT],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			status: 404,
			code: "not_found",
			apiMessage: "Project not found",
			message: expect.stringMatching(
				/^vercel-client: create deployment failed \(HTTP 404\): .*not_found.* \(after create project was answered HTTP 409 conflict: A project with the same name already exists\.\)$/u,
			),
		});
		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY]);
	});

	it("propagates a refused create as a VercelApiError, and deploys no more", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [PROJECT_NOT_FOUND],
			[CREATE]: [
				reply(403, { error: { code: "forbidden", message: "Not authorized" } }),
			],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const pending = provider.apply(programFor("dep-1"));

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			status: 403,
			code: "forbidden",
			apiMessage: "Not authorized",
			message: expect.stringContaining("create project failed (HTTP 403)"),
		});
		expect(routes()).toEqual([DEPLOY, CREATE]);
	});

	it("deploys a later deployment in one request once the project exists", async () => {
		const { fetch, routes } = scripted({
			[DEPLOY]: [
				PROJECT_NOT_FOUND,
				DEPLOYED,
				reply(200, { id: "dpl_2", url: "two.vercel.app" }),
			],
			[CREATE]: [CREATED],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const earlier = await provider.apply(programFor("dep-1"));
		const again = await provider.apply(programFor("dep-1"));
		const later = await provider.apply(programFor("dep-2"));

		expect(routes()).toEqual([DEPLOY, CREATE, DEPLOY, DEPLOY]);
		expect(again).toEqual(earlier);
		expect(earlier.projectCreated).toBe("true");
		expect(later.url).toBe("https://two.vercel.app");
		expect(later.projectCreated).toBe("false");
	});

	it("preview still makes no request", async () => {
		const { fetch, sent } = scripted({});
		const provider = createVercelDeployProvider({ token: "tok", fetch });
		await provider.preview(programFor("dep-1"));
		expect(sent).toEqual([]);
	});
});

describe("a refusal's text (scripted transport, no network)", () => {
	const TOKEN = "tok_SECRET_0123456789abcdef";
	const OTHER_KEY = "sk_live_0123456789abcdef";

	async function refusedBy(
		answer: (init: SentInit) => VercelFetchResponse,
	): Promise<VercelApiError> {
		const fetch: VercelFetch = async (_url, init) => answer(init);
		const provider = createVercelDeployProvider({ token: TOKEN, fetch });
		try {
			await provider.apply(programFor("dep-1"));
		} catch (error) {
			if (error instanceof VercelApiError) return error;
			throw error;
		}
		throw new Error("expected the deploy to be refused");
	}

	it("carries neither the token nor credential-shaped text, however it is printed", async () => {
		// A body that echoes the request: the Authorization header, the bare
		// token, and another credential in the message.
		const error = await refusedBy((init) =>
			reply(404, {
				error: {
					code: "not_found",
					message: `No such route; you sent ${String(init.headers.Authorization)}, token ${TOKEN} and api_key=${OTHER_KEY}`,
				},
				echo: { headers: init.headers, token: TOKEN },
			}),
		);

		const printed = [
			String(error),
			JSON.stringify(error),
			inspect(error, { depth: 10, showHidden: true }),
			error.stack ?? "",
			error.message,
			error.apiMessage ?? "",
		];
		for (const text of printed) {
			expect(text).not.toContain(TOKEN);
			expect(text).not.toContain(OTHER_KEY);
		}
		expect(error.message).toMatch(/create deployment failed \(HTTP 404\)/u);
		expect(error.message).toContain("[redacted]");
		expect(error.apiMessage).toBe(
			"No such route; you sent [redacted] token [redacted] and [redacted]",
		);
		expect(error).toMatchObject({ status: 404, code: "not_found" });
	});

	it("is cut at 500 characters, message and apiMessage each", async () => {
		const error = await refusedBy(() =>
			reply(500, {
				error: { code: "internal_server_error", message: "x".repeat(5000) },
			}),
		);

		expect(error.message).toHaveLength(501);
		expect(error.message.endsWith("…")).toBe(true);
		expect(error.message).toMatch(
			/^vercel-client: create deployment failed \(HTTP 500\)/u,
		);
		expect(error.apiMessage).toBe(`${"x".repeat(500)}…`);
	});

	it("keeps a short refusal whole", async () => {
		const error = await refusedBy(() =>
			reply(403, { error: { code: "forbidden", message: "Not authorized" } }),
		);

		expect(error.message).toBe(
			'vercel-client: create deployment failed (HTTP 403): {"error":{"code":"forbidden","message":"Not authorized"}}',
		);
		expect(error.apiMessage).toBe("Not authorized");
	});
});

describe("createVercelClient.createProject (scripted transport, no network)", () => {
	it("answers the project it created", async () => {
		const { fetch } = scripted({
			[CREATE]: [reply(200, { id: "prj_fresh", name: "fresh" })],
		});
		const client = createVercelClient({ token: "tok", fetch });

		await expect(client.createProject("fresh")).resolves.toEqual({
			id: "prj_fresh",
			name: "fresh",
			created: true,
		});
	});

	it("answers created: false, with the 409's reason, when the name is taken (409 conflict)", async () => {
		const { fetch } = scripted({ [CREATE]: [CONFLICT] });
		const client = createVercelClient({ token: "tok", fetch });

		await expect(client.createProject("raced")).resolves.toEqual({
			id: "",
			name: "raced",
			created: false,
			conflictMessage: "A project with the same name already exists.",
		});
	});

	it.each([
		[
			"another code",
			reply(409, {
				error: {
					code: "project_transfer_in_progress",
					message: "The project is being transferred.",
				},
			}),
			"project_transfer_in_progress",
		],
		["a body that is not JSON", plainReply(409, "Conflict"), undefined],
	])("refuses a 409 with %s as a VercelApiError", async (_case, answer, code) => {
		const { fetch } = scripted({ [CREATE]: [answer] });
		const client = createVercelClient({ token: "tok", fetch });

		const pending = client.createProject("held");

		await expect(pending).rejects.toBeInstanceOf(VercelApiError);
		await expect(pending).rejects.toMatchObject({
			status: 409,
			code,
			message: expect.stringContaining("create project failed (HTTP 409)"),
		});
	});
});

describe("the default transport", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("hands global fetch each request exactly as the client formed it", async () => {
		const missingProject = () => ({
			[DEPLOY]: [PROJECT_NOT_FOUND, DEPLOYED],
			[CREATE]: [CREATED],
		});
		const injected = scripted(missingProject());
		await createVercelDeployProvider({
			token: "tok",
			fetch: injected.fetch,
		}).apply(programFor("dep-1"));

		const viaGlobal = scripted(missingProject());
		vi.stubGlobal("fetch", viaGlobal.fetch);
		await createVercelDeployProvider({ token: "tok" }).apply(
			programFor("dep-1"),
		);

		expect(viaGlobal.sent).toEqual(injected.sent);
		for (const { init } of viaGlobal.sent) {
			expect(Object.keys(init)).toEqual(["method", "headers", "body"]);
		}
	});
});
