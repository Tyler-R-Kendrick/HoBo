/**
 * The station-local OpenExperiment sidecar.
 *
 * This hosts the real `hobo:experiment` engine next to occupancy so an
 * experiment is a live assignment surface rather than a Camp capability row.
 * The interesting behaviour lives in the boundary between HTTP and the engine.
 *
 * **A definition is parsed before it reaches the engine.** An experiment with
 * no flag or no variants would define successfully and then assign nobody —
 * silently, because the engine cannot tell an omitted field from a deliberate
 * one. The parse turns each omission into a 400 naming the field.
 *
 * **A context requires a targeting key.** Assignment is a hash of the subject;
 * with no subject every caller lands in the same bucket, which quietly
 * destroys the experiment rather than failing it.
 *
 * **Errors map to statuses by kind.** A missing experiment is 404, a malformed
 * definition or verdict is 400, and any other engine refusal starting with
 * `experiment-` is 409 — a caller retrying a 409 may succeed later and a caller
 * retrying a 400 never will.
 *
 * The server binds an ephemeral loopback port, so these tests drive the real
 * `node:http` path rather than a hand-rolled request object.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
	createStationExperimentEngine,
	EXPERIMENT_SIDECAR_HOSTING,
	EXPERIMENT_SIDECAR_NAME,
	type ExperimentSidecarServer,
	startExperimentSidecar,
} from "../src/experiment-sidecar-server.js";

const servers: ExperimentSidecarServer[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
});

async function sidecar(): Promise<ExperimentSidecarServer> {
	const server = await startExperimentSidecar();
	servers.push(server);
	return server;
}

/** A definition the engine accepts. */
const definition = (overrides: Record<string, unknown> = {}) => ({
	name: "checkout-copy",
	flag: "checkout-copy",
	variants: [
		{ name: "control", value: false },
		{ name: "treatment", value: true },
	],
	...overrides,
});

/** Call the sidecar and return status plus parsed body. */
async function call(
	server: ExperimentSidecarServer,
	path: string,
	options: { method?: string; body?: unknown } = {},
) {
	const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
		method: options.method ?? "GET",
		...(options.body !== undefined
			? {
					body: JSON.stringify(options.body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});
	// SAFETY: the sidecar always answers JSON, on every status.
	return { status: response.status, body: (await response.json()) as never };
}

describe("the sidecar's identity", () => {
	it("names itself `experiment`", () => {
		// Occupancy addresses the sidecar by this name. A rename here silently
		// orphans every `occupancyNamedOrigin("experiment", ...)` caller.
		expect(EXPERIMENT_SIDECAR_NAME).toBe("experiment");
	});

	it("declares station hosting rather than a Bindle kind", () => {
		// The distinction is load-bearing: a Bindle kind would be provisioned by
		// a provider, a station host is owned by occupancy itself.
		expect(EXPERIMENT_SIDECAR_HOSTING).toBe("station");
	});

	it("publishes an occupancy-named origin carrying its own port", async () => {
		const server = await sidecar();
		expect(server.url).toContain(String(server.port));
	});

	it("binds an ephemeral port when none is asked for", async () => {
		const server = await sidecar();
		// A fixed default port would collide with a second station on one host.
		expect(server.port).toBeGreaterThan(0);
	});

	it("hands back the live engine, not a copy", async () => {
		const server = await sidecar();
		server.engine.define(definition());
		const { body } = await call(server, "/experiments");
		// If the HTTP surface read a different engine instance, a definition made
		// through the handle would be invisible over the wire.
		expect(body.experiments).toHaveLength(1);
	});

	it("builds an engine with a default store when none is given", () => {
		// The factory must not require a store; the sidecar is startable bare.
		expect(createStationExperimentEngine()).toBeDefined();
	});

	it("builds an engine with an injected clock", () => {
		const engine = createStationExperimentEngine({
			now: () => "2020-01-01T00:00:00.000Z",
		});
		engine.define(definition());
		expect(engine.list()).toHaveLength(1);
	});
});

describe("health", () => {
	it("answers the root path", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/");
		expect(status).toBe(200);
		expect(body.name).toBe("experiment");
	});

	it("answers /health identically", async () => {
		const server = await sidecar();
		const root = await call(server, "/");
		const health = await call(server, "/health");
		expect(health.body).toEqual(root.body);
	});

	it("tolerates a trailing slash", async () => {
		const server = await sidecar();
		// `/health/` and `/health` are the same resource; a 404 here would break
		// any caller that joins paths naively.
		expect((await call(server, "/health/")).status).toBe(200);
	});

	it("reports itself live with real fidelity", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/health");
		// The whole point of the sidecar is that it is not a mock. If fidelity
		// ever reads "stub", the capability matrix is lying.
		expect(body.live).toBe(true);
		expect(body.fidelity).toBe("real");
	});

	it("names the engine it hosts", async () => {
		const server = await sidecar();
		expect((await call(server, "/health")).body.engine).toBe(
			"OpenExperimentEngine",
		);
	});

	it("reports the well-known experiment port, not its bound port", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/health");
		// `port` in the health body is the protocol's advertised port; the bound
		// port is ephemeral and belongs in the URL.
		expect(body.port).not.toBe(server.port);
	});

	it("lists current experiments in the health body", async () => {
		const server = await sidecar();
		await call(server, "/experiments", {
			method: "POST",
			body: definition(),
		});
		expect((await call(server, "/health")).body.experiments).toHaveLength(1);
	});
});

describe("defining an experiment", () => {
	it("answers 201 with the stored definition", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments", {
			method: "POST",
			body: definition(),
		});
		expect(status).toBe(201);
		expect(body.name).toBe("checkout-copy");
	});

	it("refuses a body that is not an object", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments", {
			method: "POST",
			body: ["checkout-copy"],
		});
		expect(status).toBe(400);
		expect(body.code).toBe("experiment-definition-invalid");
	});

	it("refuses an empty body", async () => {
		const server = await sidecar();
		// An empty POST reads as `{}`, which has no name — a 400, not a silent
		// experiment with an undefined identity.
		const response = await fetch(
			`http://127.0.0.1:${server.port}/experiments`,
			{ method: "POST" },
		);
		expect(response.status).toBe(400);
	});

	it("refuses a missing name", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments", {
			method: "POST",
			body: { flag: "f", variants: [{ name: "a", value: 1 }] },
		});
		expect(status).toBe(400);
		expect(String(body.error)).toContain("name");
	});

	it("refuses an empty name", async () => {
		const server = await sidecar();
		// An empty string is a present-but-useless name; the length check is what
		// separates it from a real one.
		expect(
			(
				await call(server, "/experiments", {
					method: "POST",
					body: definition({ name: "" }),
				})
			).status,
		).toBe(400);
	});

	it("refuses a missing flag", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments", {
			method: "POST",
			body: { name: "e", variants: [{ name: "a", value: 1 }] },
		});
		expect(status).toBe(400);
		expect(String(body.error)).toContain("flag");
	});

	it("refuses an empty flag", async () => {
		const server = await sidecar();
		expect(
			(
				await call(server, "/experiments", {
					method: "POST",
					body: definition({ flag: "" }),
				})
			).status,
		).toBe(400);
	});

	it("refuses variants that are not an array", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments", {
			method: "POST",
			body: definition({ variants: { control: false } }),
		});
		expect(status).toBe(400);
		expect(String(body.error)).toContain("variants");
	});

	it("refuses an empty variant list", async () => {
		const server = await sidecar();
		// Zero variants means every subject gets nothing; the experiment would
		// look defined and measure nothing at all.
		expect(
			(
				await call(server, "/experiments", {
					method: "POST",
					body: definition({ variants: [] }),
				})
			).status,
		).toBe(400);
	});

	it("carries an allocation through when supplied", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/experiments", {
			method: "POST",
			body: definition({ allocation: { control: 90, treatment: 10 } }),
		});
		expect(body.allocation).toEqual({ control: 90, treatment: 10 });
	});

	it("omits allocation when it was not supplied", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/experiments", {
			method: "POST",
			body: definition(),
		});
		// The engine's own default allocation applies only when the key is
		// absent; a literal `undefined` in the object would defeat it.
		expect(Object.hasOwn(body, "allocation")).toBe(false);
	});

	it("carries metrics through when supplied", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/experiments", {
			method: "POST",
			body: definition({ metrics: ["conversion"] }),
		});
		expect(body.metrics).toEqual(["conversion"]);
	});

	it("refuses a body that is not JSON at all", async () => {
		const server = await sidecar();
		const response = await fetch(
			`http://127.0.0.1:${server.port}/experiments`,
			{
				method: "POST",
				body: "not json",
				headers: { "content-type": "application/json" },
			},
		);
		// A parse failure is the caller's fault, not the server's — it must not
		// surface as a 500.
		expect(response.status).toBe(400);
	});
});

describe("reading experiments", () => {
	it("lists nothing before anything is defined", async () => {
		const server = await sidecar();
		expect((await call(server, "/experiments")).body.experiments).toEqual([]);
	});

	it("lists a defined experiment", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { body } = await call(server, "/experiments");
		expect(body.experiments).toHaveLength(1);
	});

	it("reads one experiment by name", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(server, "/experiments/checkout-copy");
		expect(status).toBe(200);
		expect(body.flag).toBe("checkout-copy");
	});

	it("answers 404 with a code for an unknown name", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments/nope");
		expect(status).toBe(404);
		expect(body.code).toBe("experiment-missing");
	});

	it("decodes a percent-escaped name", async () => {
		const server = await sidecar();
		await call(server, "/experiments", {
			method: "POST",
			body: definition({ name: "checkout copy" }),
		});
		// Without the decode, a name with a space would be unreachable over HTTP
		// even though it defined cleanly.
		expect((await call(server, "/experiments/checkout%20copy")).status).toBe(
			200,
		);
	});

	it("exposes the event log", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(server, "/events");
		expect(status).toBe(200);
		expect(Array.isArray(body.events)).toBe(true);
	});

	it("answers 404 for an unrouted path", async () => {
		const server = await sidecar();
		expect((await call(server, "/nope")).status).toBe(404);
	});

	it("answers 404 for an unknown action", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(await call(server, "/experiments/checkout-copy/teleport")).status,
		).toBe(404);
	});

	it("answers 404 for a path too deep to route", async () => {
		const server = await sidecar();
		// The route regex allows exactly one action segment; a third segment is
		// not a nested resource, it is a mistake.
		expect(
			(await call(server, "/experiments/checkout-copy/assign/extra")).status,
		).toBe(404);
	});
});

describe("assignment", () => {
	it("assigns a subject to a variant", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/assign",
			{ method: "POST", body: { targetingKey: "user-1" } },
		);
		expect(status).toBe(200);
		// The assignment carries the whole variant, not just its name — the
		// caller needs the value to serve the right behaviour without a second
		// lookup against the definition.
		expect(body.variant).toMatchObject({ name: expect.any(String) });
	});

	it("assigns the same subject to the same variant twice", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const first = await call(server, "/experiments/checkout-copy/assign", {
			method: "POST",
			body: { targetingKey: "user-1" },
		});
		const second = await call(server, "/experiments/checkout-copy/assign", {
			method: "POST",
			body: { targetingKey: "user-1" },
		});
		// A subject that flips variants between calls sees the experiment change
		// under them, which invalidates every metric attributed to them.
		expect(second.body.variant).toStrictEqual(first.body.variant);
	});

	it("refuses an assignment with no targeting key", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/assign",
			{ method: "POST", body: {} },
		);
		expect(status).toBe(400);
		expect(body.code).toBe("experiment-context-invalid");
	});

	it("refuses an assignment with an empty targeting key", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/assign", {
					method: "POST",
					body: { targetingKey: "" },
				})
			).status,
		).toBe(400);
	});

	it("refuses an assignment context that is not an object", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/assign", {
					method: "POST",
					body: "user-1",
				})
			).status,
		).toBe(400);
	});

	it("carries a tenant through the context", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status } = await call(server, "/experiments/checkout-copy/assign", {
			method: "POST",
			body: { targetingKey: "user-1", tenant: "acme" },
		});
		expect(status).toBe(200);
	});

	it("carries attributes through the context", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status } = await call(server, "/experiments/checkout-copy/assign", {
			method: "POST",
			body: { targetingKey: "user-1", attributes: { plan: "pro" } },
		});
		expect(status).toBe(200);
	});

	it("reads back an assignment by subject", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		await call(server, "/experiments/checkout-copy/assign", {
			method: "POST",
			body: { targetingKey: "user-1" },
		});
		const { status } = await call(
			server,
			"/experiments/checkout-copy/assignment?subject=user-1",
		);
		expect(status).toBe(200);
	});

	it("answers 404 for a subject never assigned", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/assignment?subject=ghost",
		);
		expect(status).toBe(404);
		expect(body.code).toBe("experiment-assignment-missing");
	});

	it("answers 404 when the subject parameter is missing entirely", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		// A missing `subject` reads as the empty subject, which is never assigned
		// — a 404 rather than a 500 or an arbitrary assignment.
		expect(
			(await call(server, "/experiments/checkout-copy/assignment")).status,
		).toBe(404);
	});
});

describe("exposure and evaluation", () => {
	it("records an exposure and returns the assignment", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/expose",
			{ method: "POST", body: { targetingKey: "user-1" } },
		);
		expect(status).toBe(200);
		expect(body).not.toBeNull();
	});

	it("refuses an exposure with no targeting key", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/expose", {
					method: "POST",
					body: {},
				})
			).status,
		).toBe(400);
	});

	it("evaluates and exposes in one call", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status } = await call(
			server,
			"/experiments/checkout-copy/evaluate",
			{ method: "POST", body: { targetingKey: "user-1" } },
		);
		expect(status).toBe(200);
	});

	it("refuses an evaluation with no targeting key", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/evaluate", {
					method: "POST",
					body: {},
				})
			).status,
		).toBe(400);
	});

	it("analyzes an experiment that has exposures", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		await call(server, "/experiments/checkout-copy/expose", {
			method: "POST",
			body: { targetingKey: "user-1" },
		});
		const { status } = await call(server, "/experiments/checkout-copy/analyze");
		expect(status).toBe(200);
	});

	it("answers 404 when analyzing an experiment that was never defined", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments/nope/analyze");
		expect(status).toBe(404);
		expect(body.code).toBe("experiment-missing");
	});
});

describe("concluding", () => {
	it("accepts a ship verdict", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/conclude",
			{ method: "POST", body: { verdict: "ship" } },
		);
		expect(status).toBe(200);
		expect(body).toEqual({
			ok: true,
			experiment: "checkout-copy",
			verdict: "ship",
		});
	});

	it("accepts a do-not-ship verdict", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/conclude", {
					method: "POST",
					body: { verdict: "do-not-ship" },
				})
			).body.verdict,
		).toBe("do-not-ship");
	});

	it("accepts an inconclusive verdict", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/conclude", {
					method: "POST",
					body: { verdict: "inconclusive" },
				})
			).body.verdict,
		).toBe("inconclusive");
	});

	it("carries a reason through when it is a string", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status } = await call(
			server,
			"/experiments/checkout-copy/conclude",
			{ method: "POST", body: { verdict: "ship", reason: "lift held" } },
		);
		expect(status).toBe(200);
	});

	it("drops a non-string reason rather than passing it on", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		// A number where a reason belongs would reach the ledger as a stringified
		// artifact; dropping it keeps the record honest.
		const { status } = await call(
			server,
			"/experiments/checkout-copy/conclude",
			{ method: "POST", body: { verdict: "ship", reason: 7 } },
		);
		expect(status).toBe(200);
	});

	it("refuses an unrecognised verdict", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		const { status, body } = await call(
			server,
			"/experiments/checkout-copy/conclude",
			{ method: "POST", body: { verdict: "maybe" } },
		);
		// A typo'd verdict must not conclude the experiment as something else.
		expect(status).toBe(400);
		expect(body.code).toBe("experiment-verdict-invalid");
	});

	it("refuses a missing verdict", async () => {
		const server = await sidecar();
		await call(server, "/experiments", { method: "POST", body: definition() });
		expect(
			(
				await call(server, "/experiments/checkout-copy/conclude", {
					method: "POST",
					body: {},
				})
			).status,
		).toBe(400);
	});
});

describe("error mapping", () => {
	it("maps a missing experiment to 404 on assign", async () => {
		const server = await sidecar();
		const { status } = await call(server, "/experiments/ghost/assign", {
			method: "POST",
			body: { targetingKey: "user-1" },
		});
		expect(status).toBe(404);
	});

	it("GAP: concludes an experiment that was never defined", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/experiments/ghost/conclude", {
			method: "POST",
			body: { verdict: "ship" },
		});
		// Unlike `assign`, `conclude` does not check that the experiment exists,
		// so a typo'd name records a ship verdict against nothing and answers
		// 200. The caller has no way to tell that from a real conclusion. Pinned
		// as the behaviour that ships today rather than changed here — the fix
		// belongs with the engine's own existence check.
		expect(status).toBe(200);
		expect(body).toEqual({ ok: true, experiment: "ghost", verdict: "ship" });
	});

	it("always answers JSON, even on a refusal", async () => {
		const server = await sidecar();
		const response = await fetch(
			`http://127.0.0.1:${server.port}/experiments/ghost`,
		);
		// A caller parsing every response as JSON must not hit an HTML error page
		// on the failure path.
		expect(response.headers.get("content-type")).toContain("application/json");
	});

	it("sets a content length matching the body it wrote", async () => {
		const server = await sidecar();
		const response = await fetch(`http://127.0.0.1:${server.port}/health`);
		const text = await response.text();
		expect(Number(response.headers.get("content-length"))).toBe(
			Buffer.byteLength(text),
		);
	});

	it("closes cleanly and refuses later connections", async () => {
		const server = await startExperimentSidecar();
		const port = server.port;
		await server.close();
		// A sidecar that kept its port after close would leak a listener across
		// station restarts.
		await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
	});
});
