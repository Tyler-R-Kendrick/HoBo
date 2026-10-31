import type { IacProgram } from "@hobo/cloud";
import { afterEach, describe, expect, it } from "vitest";

import type { JsonObject } from "../src/json.js";
import {
	createVercelClient,
	type VercelFetch,
	type VercelFetchResponse,
} from "../src/vercel-client.js";
import { createVercelDeployProvider } from "../src/vercel-deploy-provider.js";

// The Vercel deploy path makes sure its project exists before it deploys. A
// deployment names its project (`project`), and on an account with no project by
// that name Create Deployment is refused (404 from the mirror.cloud emulator's
// Vercel API), so the first `hobo up` from a fresh account failed.
// `ensureProject` follows Vercel's REST API:
//   GET  /v9/projects/{idOrName}  answers the project, or 404 when there is none
//     (vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name)
//   POST /v9/projects {name}      creates it, or answers 409 when the name is taken
//     (vercel.com/docs/rest-api/reference/endpoints/projects/create-a-new-project)
// NO network: every request goes to a scripted transport.

interface Call {
	readonly method: string;
	readonly url: string;
	readonly headers: Record<string, string>;
	readonly body: string;
}

interface Answer {
	readonly status: number;
	readonly body: JsonObject;
}

function answer(status: number, body: JsonObject): VercelFetchResponse {
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

const NOT_FOUND: Answer = {
	status: 404,
	body: { error: { code: "not_found", message: "Project not found" } },
};
const CONFLICT: Answer = {
	status: 409,
	body: {
		error: {
			code: "conflict",
			message: "A project with the same name already exists.",
		},
	},
};
const DEPLOYED: Answer = {
	status: 200,
	body: { id: "dpl_1", url: "hobo-hello-bindle-1.vercel.app" },
};

function project(name: string, id = "prj_1"): Answer {
	return { status: 200, body: { id, name } };
}

/**
 * A transport that answers each `METHOD /path` from a queue of scripted
 * answers, in order, and fails the test on a request nobody scripted.
 */
function scripted(script: Record<string, readonly Answer[]>) {
	const calls: Call[] = [];
	const left = new Map(
		Object.entries(script).map(([route, answers]) => [route, [...answers]]),
	);
	const fetch: VercelFetch = async (url, init) => {
		calls.push({
			method: init.method,
			url,
			headers: init.headers,
			body: init.body,
		});
		const route = `${init.method} ${new URL(url).pathname}`;
		const next = left.get(route)?.shift();
		if (next === undefined) throw new Error(`unscripted request: ${route}`);
		return answer(next.status, next.body);
	};
	const routes = () =>
		calls.map((call) => `${call.method} ${new URL(call.url).pathname}`);
	return { fetch, calls, routes };
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

describe("createVercelClient.ensureProject (scripted transport, no network)", () => {
	it("looks the project up by name and leaves one that exists alone", async () => {
		const { fetch, calls, routes } = scripted({
			"GET /v9/projects/hobo-hello-bindle": [
				project("hobo-hello-bindle", "prj_found"),
			],
		});
		const client = createVercelClient({ token: "tok", fetch });

		const result = await client.ensureProject("hobo-hello-bindle");

		expect(result).toEqual({
			id: "prj_found",
			name: "hobo-hello-bindle",
			created: false,
		});
		expect(routes()).toEqual(["GET /v9/projects/hobo-hello-bindle"]);
		const [lookup] = calls;
		expect(lookup?.headers).toEqual({ Authorization: "Bearer tok" });
		expect(lookup?.body).toBe("");
	});

	it("creates the project when the lookup answers 404, scoped to the team", async () => {
		const { fetch, calls, routes } = scripted({
			"GET /v9/projects/fresh": [NOT_FOUND],
			"POST /v9/projects": [project("fresh", "prj_new")],
		});
		const client = createVercelClient({
			token: "tok",
			fetch,
			teamId: "team_7",
		});

		const result = await client.ensureProject("fresh");

		expect(result).toEqual({ id: "prj_new", name: "fresh", created: true });
		expect(routes()).toEqual(["GET /v9/projects/fresh", "POST /v9/projects"]);
		for (const call of calls)
			expect(new URL(call.url).search).toBe("?teamId=team_7");
		const create = calls[1];
		expect(create?.headers).toEqual({
			Authorization: "Bearer tok",
			"Content-Type": "application/json",
		});
		expect(JSON.parse(create?.body ?? "")).toEqual({ name: "fresh" });
	});

	it("treats a create answered 409 as made meanwhile, and reads it", async () => {
		const { fetch, routes } = scripted({
			"GET /v9/projects/raced": [NOT_FOUND, project("raced", "prj_raced")],
			"POST /v9/projects": [CONFLICT],
		});
		const client = createVercelClient({ token: "tok", fetch });

		const result = await client.ensureProject("raced");

		expect(result).toEqual({ id: "prj_raced", name: "raced", created: false });
		expect(routes()).toEqual([
			"GET /v9/projects/raced",
			"POST /v9/projects",
			"GET /v9/projects/raced",
		]);
	});

	it("does not create anything when the lookup fails for another reason", async () => {
		const { fetch, routes } = scripted({
			"GET /v9/projects/hobo-hello-bindle": [
				{ status: 403, body: { error: { code: "forbidden" } } },
			],
		});
		const client = createVercelClient({ token: "tok", fetch });

		await expect(client.ensureProject("hobo-hello-bindle")).rejects.toThrow(
			/look up project failed \(HTTP 403\)/,
		);
		expect(routes()).toEqual(["GET /v9/projects/hobo-hello-bindle"]);
	});

	it("reports a refused create", async () => {
		const { fetch } = scripted({
			"GET /v9/projects/bad": [NOT_FOUND],
			"POST /v9/projects": [
				{ status: 400, body: { error: { code: "bad_request" } } },
			],
		});
		const client = createVercelClient({ token: "tok", fetch });

		await expect(client.ensureProject("bad")).rejects.toThrow(
			/create project failed \(HTTP 400\)/,
		);
	});

	it("escapes the name into the path", async () => {
		const { fetch, calls } = scripted({
			"GET /v9/projects/a%2Fb": [project("a/b")],
		});
		await createVercelClient({ token: "tok", fetch }).ensureProject("a/b");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v9/projects/a%2Fb");
	});
});

interface Sent {
	readonly method: string | undefined;
	readonly hasBody: boolean;
}

describe("the default transport", () => {
	const saved = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = saved;
	});

	it("sends the lookup as a GET with no body, which fetch requires", async () => {
		const seen: Sent[] = [];
		globalThis.fetch = async (_input, init) => {
			seen.push({
				method: init?.method,
				hasBody: init !== undefined && "body" in init,
			});
			return new Response(JSON.stringify({ id: "prj_1", name: "p" }), {
				status: 200,
			});
		};
		await createVercelClient({ token: "tok" }).ensureProject("p");
		expect(seen).toEqual([{ method: "GET", hasBody: false }]);
	});
});

describe("createVercelDeployProvider makes sure its project exists", () => {
	it("on a fresh account creates the project, then deploys to it", async () => {
		const { fetch, calls, routes } = scripted({
			"GET /v9/projects/hobo-hello-bindle": [NOT_FOUND],
			"POST /v9/projects": [project("hobo-hello-bindle", "prj_fresh")],
			"POST /v13/deployments": [DEPLOYED],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		const outputs = await provider.apply(programFor("dep-1"));

		expect(routes()).toEqual([
			"GET /v9/projects/hobo-hello-bindle",
			"POST /v9/projects",
			"POST /v13/deployments",
		]);
		expect(outputs.url).toBe("https://hobo-hello-bindle-1.vercel.app");
		// SAFETY: the deployment body is the JSON object the client serialised.
		const deploy = JSON.parse(calls[2]?.body ?? "") as {
			readonly project: string;
		};
		expect(deploy.project).toBe("hobo-hello-bindle");
	});

	it("makes sure once per provider, across deployments", async () => {
		const { fetch, routes } = scripted({
			"GET /v9/projects/hobo-hello-bindle": [project("hobo-hello-bindle")],
			"POST /v13/deployments": [
				DEPLOYED,
				{ status: 200, body: { id: "dpl_2", url: "two.vercel.app" } },
			],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		await provider.apply(programFor("dep-1"));
		await provider.apply(programFor("dep-1"));
		await provider.apply(programFor("dep-2"));

		expect(routes()).toEqual([
			"GET /v9/projects/hobo-hello-bindle",
			"POST /v13/deployments",
			"POST /v13/deployments",
		]);
	});

	it("deploys nothing when the project cannot be made sure of, and asks again next time", async () => {
		const { fetch, routes } = scripted({
			"GET /v9/projects/hobo-hello-bindle": [
				{ status: 500, body: { error: { code: "internal" } } },
				project("hobo-hello-bindle"),
			],
			"POST /v13/deployments": [DEPLOYED],
		});
		const provider = createVercelDeployProvider({ token: "tok", fetch });

		await expect(provider.apply(programFor("dep-1"))).rejects.toThrow(
			/HTTP 500/,
		);
		expect(routes()).toEqual(["GET /v9/projects/hobo-hello-bindle"]);

		await provider.apply(programFor("dep-1"));
		expect(routes()).toEqual([
			"GET /v9/projects/hobo-hello-bindle",
			"GET /v9/projects/hobo-hello-bindle",
			"POST /v13/deployments",
		]);
	});

	it("preview still makes no request", async () => {
		const { fetch, calls } = scripted({});
		const provider = createVercelDeployProvider({ token: "tok", fetch });
		await provider.preview(programFor("dep-1"));
		expect(calls).toEqual([]);
	});
});
