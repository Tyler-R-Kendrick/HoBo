/**
 * The Depot BuildService client and the published capability manifest.
 *
 * The property this client exists to hold is **no static tokens**. Every RPC
 * asks the brokered provider for a token at call time rather than capturing one
 * at construction, so a token that expires mid-session is re-minted on the next
 * call instead of producing a run of 401s that look like a permissions problem.
 * The env-fallback provider throws a *typed* gate when `DEPOT_PROJECT_TOKEN` is
 * absent, for the same reason: limping into a 401 tells an operator the wrong
 * story about what is wrong.
 *
 * The other thing worth pinning is that `createBuild` refuses a 200 response
 * that is missing its identifiers. A build handle with an empty id and token
 * would be handed to the BuildKit executor, which would authenticate as nobody
 * against a build that does not exist — and the failure would surface far from
 * the response that caused it.
 */
import { describe, expect, it } from "vitest";
import { createDepotCatalogEntry } from "../src/catalog-entry.js";
import {
	createDepotClient,
	DepotApiError,
	DepotCredentialsMissingError,
	envDepotTokenProvider,
} from "../src/depot-client.js";

function response(
	body: unknown,
	init: { ok?: boolean; status?: number; text?: string } = {},
) {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		json: async () => body,
		text: async () => init.text ?? JSON.stringify(body),
	};
}

/** A client whose transport records every call and answers with `body`. */
function clientRecording(body: unknown, init?: Parameters<typeof response>[1]) {
	const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
	const client = createDepotClient({
		projectId: "proj-1",
		token: async () => "brokered-token",
		fetch: async (url, requestInit) => {
			calls.push({ url, init: requestInit as Record<string, unknown> });
			return response(body, init);
		},
	});
	return { client, calls };
}

describe("envDepotTokenProvider", () => {
	it("returns the token from the injected environment", async () => {
		const provider = envDepotTokenProvider({
			DEPOT_PROJECT_TOKEN: "from-env",
		});
		expect(await provider()).toBe("from-env");
	});

	it("throws a typed gate when the token is absent", async () => {
		// Typed, not a bare Error. Absence of a credential and rejection of one
		// demand different responses — wire the broker versus fix the token — and
		// limping into a 401 would report the second when it is the first.
		await expect(envDepotTokenProvider({})()).rejects.toBeInstanceOf(
			DepotCredentialsMissingError,
		);
	});

	it("treats an empty token as absent", async () => {
		// `!token`, so an exported-but-empty variable is the same as unset. An
		// empty bearer would be sent and rejected by the API.
		await expect(
			envDepotTokenProvider({ DEPOT_PROJECT_TOKEN: "" })(),
		).rejects.toBeInstanceOf(DepotCredentialsMissingError);
	});

	it("names the broker and the live-lane variable in its message", async () => {
		// Both remedies, because which one applies depends on whether the caller
		// is in the brokered path or the credential-gated live lane.
		try {
			await envDepotTokenProvider({})();
			expect.unreachable("a missing token must be refused");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain("Yard broker");
			expect(message).toContain("DEPOT_PROJECT_TOKEN");
			expect((error as { code?: string }).code).toBeDefined();
		}
	});

	it("reads process.env when no environment is injected", async () => {
		// The production path. Constructing with no argument must work rather
		// than throwing on an undefined lookup.
		const saved = process.env.DEPOT_PROJECT_TOKEN;
		process.env.DEPOT_PROJECT_TOKEN = "ambient";
		try {
			expect(await envDepotTokenProvider()()).toBe("ambient");
		} finally {
			if (saved === undefined) delete process.env.DEPOT_PROJECT_TOKEN;
			else process.env.DEPOT_PROJECT_TOKEN = saved;
		}
	});

	it("re-reads the environment on every call", async () => {
		// Not captured at construction. A broker that rotates the variable
		// mid-process must be picked up by the next call rather than requiring a
		// new provider.
		const env: Record<string, string | undefined> = {
			DEPOT_PROJECT_TOKEN: "first",
		};
		const provider = envDepotTokenProvider(env);
		expect(await provider()).toBe("first");
		env.DEPOT_PROJECT_TOKEN = "second";
		expect(await provider()).toBe("second");
	});
});

describe("createBuild", () => {
	it("returns the build id and per-build token", async () => {
		const { client } = clientRecording({
			build_id: "b-1",
			build_token: "t-1",
		});
		expect(await client.createBuild()).toEqual({
			buildId: "b-1",
			buildToken: "t-1",
		});
	});

	it("posts to the BuildService CreateBuild method", async () => {
		const { client, calls } = clientRecording({
			build_id: "b-1",
			build_token: "t-1",
		});
		await client.createBuild();
		expect(calls[0]?.url).toBe(
			"https://api.depot.dev/depot.build.v1.BuildService/CreateBuild",
		);
		expect(calls[0]?.init.method).toBe("POST");
	});

	it("sends the project id in the body", async () => {
		const { client, calls } = clientRecording({
			build_id: "b-1",
			build_token: "t-1",
		});
		await client.createBuild();
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			project_id: "proj-1",
		});
	});

	it("carries the brokered token as a bearer", async () => {
		const { client, calls } = clientRecording({
			build_id: "b-1",
			build_token: "t-1",
		});
		await client.createBuild();
		expect(
			(calls[0]?.init.headers as Record<string, string>).authorization,
		).toBe("Bearer brokered-token");
	});

	it("asks the token provider on every call, never caching", async () => {
		// The no-static-tokens property. A captured token would keep being sent
		// after it expired, and every call would fail with a 401 that looks like
		// a permissions problem rather than an expiry.
		let issued = 0;
		const client = createDepotClient({
			projectId: "proj-1",
			token: async () => `token-${++issued}`,
			fetch: async () => response({ build_id: "b", build_token: "t" }),
		});
		await client.createBuild();
		await client.createBuild();
		expect(issued).toBe(2);
	});

	it("refuses a 200 response missing the build id or token", async () => {
		// The consequential refusal. A handle with an empty id and token would be
		// handed to the BuildKit executor, which would authenticate as nobody
		// against a build that does not exist.
		for (const body of [
			{},
			{ build_id: "b-1" },
			{ build_token: "t-1" },
			{ build_id: "", build_token: "t-1" },
		]) {
			const { client } = clientRecording(body);
			await expect(client.createBuild()).rejects.toBeInstanceOf(DepotApiError);
		}
	});

	it("reports that refusal as a 200, because the transport succeeded", async () => {
		// The status is the transport's, not an invented one. Reporting a 500
		// would send an operator looking at Depot's availability when the request
		// in fact returned successfully with an unusable body.
		const { client } = clientRecording({});
		try {
			await client.createBuild();
			expect.unreachable("a missing build id must be refused");
		} catch (error) {
			expect((error as DepotApiError).status).toBe(200);
			expect((error as Error).message).toContain(
				"missing build_id/build_token",
			);
		}
	});
});

describe("getBuild", () => {
	it("returns the reported id and status", async () => {
		const { client } = clientRecording({ build_id: "b-1", status: "running" });
		expect(await client.getBuild("b-1")).toEqual({
			buildId: "b-1",
			status: "running",
		});
	});

	it("posts to the GetBuild method with the build id", async () => {
		const { client, calls } = clientRecording({ status: "ok" });
		await client.getBuild("b-7");
		expect(calls[0]?.url).toContain("/GetBuild");
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			build_id: "b-7",
		});
	});

	it("falls back to the requested id when the response omits one", async () => {
		// The caller asked about a specific build; echoing their id back is more
		// useful than an empty string they cannot correlate on.
		const { client } = clientRecording({ status: "running" });
		expect((await client.getBuild("b-9")).buildId).toBe("b-9");
	});

	it("reports an unknown status rather than an empty one", async () => {
		// `?? "unknown"`. An empty status would compare unequal to every known
		// state and read to a poller as a build that is in no state at all.
		const { client } = clientRecording({ build_id: "b-1" });
		expect((await client.getBuild("b-1")).status).toBe("unknown");
	});
});

describe("transport failures", () => {
	it("raises a typed API error carrying the status", async () => {
		// The status is what a caller retries on. A 429 and a 403 demand opposite
		// responses, and a bare Error would make both look the same.
		for (const status of [400, 401, 403, 429, 500, 503]) {
			const { client } = clientRecording(
				{},
				{ ok: false, status, text: "denied" },
			);
			try {
				await client.createBuild();
				expect.unreachable("a failed request must be reported");
			} catch (error) {
				expect(error).toBeInstanceOf(DepotApiError);
				expect((error as DepotApiError).status).toBe(status);
			}
		}
	});

	it("includes the response body and the URL in the message", async () => {
		// The body is where Depot puts the actual reason. Dropping it would leave
		// an operator with a status code and nothing else.
		const { client } = clientRecording(
			{},
			{ ok: false, status: 403, text: "project quota exceeded" },
		);
		try {
			await client.createBuild();
			expect.unreachable("expected a failure");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain("project quota exceeded");
			expect(message).toContain("CreateBuild");
			expect(message).toContain("403");
		}
	});
});

describe("base URL", () => {
	it("defaults to the Depot API", async () => {
		const { client, calls } = clientRecording({
			build_id: "b",
			build_token: "t",
		});
		await client.createBuild();
		expect(calls[0]?.url.startsWith("https://api.depot.dev/")).toBe(true);
	});

	it("honours an override and strips a trailing slash", async () => {
		// Without the strip the URL would contain `//`, which some proxies
		// normalise and others route differently — a difference that shows up
		// only in one environment.
		const calls: string[] = [];
		const client = createDepotClient({
			projectId: "proj-1",
			token: async () => "t",
			baseUrl: "https://depot.internal/",
			fetch: async (url) => {
				calls.push(url);
				return response({ build_id: "b", build_token: "t" });
			},
		});
		await client.createBuild();
		expect(calls[0]).toBe(
			"https://depot.internal/depot.build.v1.BuildService/CreateBuild",
		);
	});
});

describe("capability manifest", () => {
	it("publishes the well-known capability and cost documents", async () => {
		// The manifest is what a cost-aware dispatcher ranks this runner on. A
		// published set missing either document would make it unrankable while
		// still appearing available.
		const entry = createDepotCatalogEntry();
		const manifest = entry.capabilityManifest();
		expect(manifest.published).toHaveProperty(
			"/.well-known/capability-manifest/capabilities.json",
		);
		expect(manifest.published).toHaveProperty(
			"/.well-known/capability-manifest/cost.json",
		);
	});

	it("parses the published documents into the manifest's own fields", async () => {
		// So a consumer reads structured data rather than re-parsing JSON that
		// the manifest already holds. The two must agree, since a disagreement
		// would let a reader draw opposite conclusions from one manifest.
		const manifest = createDepotCatalogEntry().capabilityManifest();
		expect(manifest.capabilities).toEqual(
			JSON.parse(
				manifest.published[
					"/.well-known/capability-manifest/capabilities.json"
				],
			),
		);
		expect(manifest.cost).toEqual(
			JSON.parse(
				manifest.published["/.well-known/capability-manifest/cost.json"],
			),
		);
	});

	it("names the provider", async () => {
		expect(
			createDepotCatalogEntry().capabilityManifest().providerId,
		).toBeDefined();
	});

	it("copies the published map rather than exposing the shared one", async () => {
		// `{ ...published }`. A caller that mutated the returned map could change
		// what every later manifest reports.
		const first = createDepotCatalogEntry().capabilityManifest();
		(first.published as Record<string, string>)["/injected"] = "x";
		const second = createDepotCatalogEntry().capabilityManifest();
		expect(second.published).not.toHaveProperty("/injected");
	});
});
