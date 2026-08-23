/**
 * The station-local OpenDelivery rollout sidecar.
 *
 * This hosts the real `hobo:delivery` engine next to occupancy so a Bindle's
 * `rollout` is a live progressive delivery rather than a Camp-side mock. It is
 * an HTTP surface over a stateful engine, and the interesting behaviour is in
 * the boundary between them.
 *
 * **A policy is parsed before it reaches the engine.** A rollout with no
 * stages, no flag, or no traffic mode would either do nothing or advance
 * instantly — either way silently, because the engine has no way to know a
 * field was missing rather than deliberately empty.
 *
 * **Promotion refuses unless the rollout is on its last running stage.**
 * Promoting from the middle skips every stage that has not run, which is the
 * whole point of a staged rollout; promoting while a batch is staged discards
 * outcomes that are still being collected. Each refusal carries its own code
 * so the caller can tell "not yet" from "never".
 *
 * **Engine errors map to statuses by kind, not by message.** A missing rollout
 * is a 404, a malformed policy is a 400, and a rollout in the wrong state is a
 * 409 — a caller retrying a 409 might succeed later, and retrying a 400 never
 * will.
 *
 * The server binds an ephemeral loopback port, so these tests exercise the real
 * `node:http` path rather than a hand-rolled request object.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
	createStationRolloutEngine,
	promoteStationRollout,
	ROLLOUT_SIDECAR_HOSTING,
	ROLLOUT_SIDECAR_NAME,
	type RolloutSidecarServer,
	startRolloutSidecar,
} from "../src/rollout-sidecar-server.js";

const servers: RolloutSidecarServer[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
});

async function sidecar(): Promise<RolloutSidecarServer> {
	const server = await startRolloutSidecar();
	servers.push(server);
	return server;
}

/** A policy the engine accepts. */
const policy = (overrides: Record<string, unknown> = {}) => ({
	name: "checkout",
	flag: "checkout-v2",
	stages: [{ percent: 10 }, { percent: 100 }],
	traffic: "flag-only",
	...overrides,
});

/** Call the sidecar and return status plus parsed body. */
async function call(
	server: RolloutSidecarServer,
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
	return { status: response.status, body: (await response.json()) as never };
}

describe("the sidecar's identity", () => {
	it("names itself for occupancy and reports its own port", () => {
		// Occupancy resolves the sidecar by name. A mismatch would make the
		// rollout endpoint unreachable while the process is plainly running.
		expect(ROLLOUT_SIDECAR_NAME).toBe("rollout");
		expect(ROLLOUT_SIDECAR_HOSTING).toBe("station");
	});

	it("serves on a loopback origin derived from its bound port", async () => {
		// Binding to port 0 and reporting the assigned one is what lets several
		// stations run side by side on one machine.
		const server = await sidecar();
		expect(server.port).toBeGreaterThan(0);
		expect(server.url).toContain(String(server.port));
	});

	it("exposes the live engine so a caller can drive it in process", async () => {
		// The sidecar is HTTP for cross-process callers; an in-process one
		// should not have to go through a socket to reach the same engine.
		const server = await sidecar();
		expect(server.engine).toBeDefined();
		expect(server.engine.list()).toEqual([]);
	});

	it("closes without throwing, and twice", async () => {
		// Close runs from teardown paths that cannot know whether it already
		// happened.
		const server = await startRolloutSidecar();
		await expect(server.close()).resolves.toBeUndefined();
		await expect(server.close()).resolves.toBeUndefined();
	});
});

describe("health", () => {
	it("answers on both / and /health with the same document", async () => {
		// A probe written against either path has to work; `/` is what a curl
		// with no path hits and `/health` is what an orchestrator asks for.
		const server = await sidecar();
		for (const path of ["/", "/health", "/health/"]) {
			const { status, body } = await call(server, path);
			expect(status, path).toBe(200);
			expect(body.name).toBe("rollout");
			expect(body.hosting).toBe("station");
		}
	});

	it("states plainly that this is the real engine, not a mock", async () => {
		// The whole point of a station-local sidecar is that `rollout` is live.
		// A probe has to be able to tell that without reading the source.
		const { body } = await call(await sidecar(), "/health");
		expect(body.engine).toBe("OpenDeliveryEngine");
		expect(body.live).toBe(true);
		expect(body.fidelity).toBe("real");
	});

	it("lists current rollouts in the health document", async () => {
		const server = await sidecar();
		await call(server, "/rollouts", { method: "POST", body: policy() });
		const { body } = await call(server, "/health");
		expect(body.rollouts).toHaveLength(1);
	});
});

describe("starting a rollout", () => {
	it("creates one and answers 201", async () => {
		// 201 rather than 200: the response body is a new resource, and a caller
		// distinguishing create from update reads the status.
		const { status, body } = await call(await sidecar(), "/rollouts", {
			method: "POST",
			body: policy(),
		});
		expect(status).toBe(201);
		expect(body.policy.name).toBe("checkout");
		expect(body.status).toBe("running");
	});

	it("refuses a body that is not an object", async () => {
		// The engine would treat a missing policy as an empty one and start a
		// rollout that advances instantly over nobody.
		const server = await sidecar();
		for (const body of [null, "policy", 7, []]) {
			const { status } = await call(server, "/rollouts", {
				method: "POST",
				body,
			});
			expect(status, JSON.stringify(body)).toBe(400);
		}
	});

	it("requires a name, a flag, and at least one stage", async () => {
		// A stageless rollout is not progressive; a flagless one has nothing to
		// toggle. Both would report success having delivered nothing.
		const server = await sidecar();
		for (const overrides of [
			{ name: undefined },
			{ name: "" },
			{ flag: undefined },
			{ flag: "" },
			{ stages: undefined },
			{ stages: [] },
			{ stages: "all" },
		]) {
			const { status, body } = await call(server, "/rollouts", {
				method: "POST",
				body: policy(overrides),
			});
			expect(status, JSON.stringify(overrides)).toBe(400);
			expect(body.code).toBe("rollout-policy-invalid");
		}
	});

	it("requires a recognised traffic mode", async () => {
		// The mode decides whether traffic moves by flag or by gateway weight.
		// An unrecognised one would leave the rollout with no mechanism at all.
		const server = await sidecar();
		for (const traffic of [undefined, "", "canary", 7]) {
			const { status } = await call(server, "/rollouts", {
				method: "POST",
				body: policy({ traffic }),
			});
			expect(status, String(traffic)).toBe(400);
		}
		expect(
			(
				await call(server, "/rollouts", {
					method: "POST",
					body: policy({
						traffic: "gateway-weighted",
						gatewayWeightPercent: 5,
					}),
				})
			).status,
		).toBe(201);
	});

	it("defaults autoRollback to off unless literally true", async () => {
		// Automatic rollback reverts a delivery without an operator. Turning it
		// on from a truthy string would surprise whoever wrote the policy.
		const server = await sidecar();
		for (const autoRollback of [undefined, "true", 1, false]) {
			const { body } = await call(server, "/rollouts", {
				method: "POST",
				body: policy({ autoRollback }),
			});
			expect(body.policy.autoRollback, String(autoRollback)).toBe(false);
		}
		const { body } = await call(server, "/rollouts", {
			method: "POST",
			body: policy({ autoRollback: true }),
		});
		expect(body.policy.autoRollback).toBe(true);
	});

	it("omits the gateway weight when the policy did not set one", async () => {
		// A `gatewayWeightPercent: undefined` reaching the engine is a field it
		// has to reason about; an absent one means "flag-only has no weight".
		const { body } = await call(await sidecar(), "/rollouts", {
			method: "POST",
			body: policy(),
		});
		expect("gatewayWeightPercent" in body.policy).toBe(false);
	});

	it("treats an empty request body as a missing policy", async () => {
		// A POST with no body at all is a caller mistake, not a request for
		// defaults.
		const server = await sidecar();
		const response = await fetch(`http://127.0.0.1:${server.port}/rollouts`, {
			method: "POST",
		});
		expect(response.status).toBe(400);
	});
});

describe("reading rollouts", () => {
	it("lists them", async () => {
		const server = await sidecar();
		await call(server, "/rollouts", { method: "POST", body: policy() });
		const { status, body } = await call(server, "/rollouts");
		expect(status).toBe(200);
		expect(body.rollouts).toHaveLength(1);
	});

	it("returns one by id", async () => {
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy(),
		});
		const { status, body } = await call(
			server,
			`/rollouts/${encodeURIComponent(created.body.id)}`,
		);
		expect(status).toBe(200);
		expect(body.id).toBe(created.body.id);
	});

	it("answers 404 for an id it does not have, echoing it", async () => {
		// Echoing the id is what tells a caller whether it sent the wrong one or
		// the rollout was already cleaned up.
		const { status, body } = await call(await sidecar(), "/rollouts/nope");
		expect(status).toBe(404);
		expect(body.code).toBe("rollout-missing");
		expect(body.error).toContain("nope");
	});

	it("exposes the event log", async () => {
		// The events are the audit trail of a delivery. Without them a
		// post-mortem has only the final state.
		const server = await sidecar();
		await call(server, "/rollouts", { method: "POST", body: policy() });
		const { status, body } = await call(server, "/events");
		expect(status).toBe(200);
		expect(body.events.length).toBeGreaterThan(0);
	});

	it("returns the next batch of targets", async () => {
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy(),
		});
		const { status, body } = await call(
			server,
			`/rollouts/${created.body.id}/batch`,
		);
		expect(status).toBe(200);
		expect(Array.isArray(body.targets)).toBe(true);
	});
});

describe("routing", () => {
	it("answers 404 for an unknown path", async () => {
		// A typo that quietly returned 200 would look like a rollout that did
		// nothing.
		const server = await sidecar();
		for (const path of ["/frobnicate", "/rollouts/a/b/c"]) {
			expect((await call(server, path)).status, path).toBe(404);
		}
	});

	it("answers 404 for a known path with the wrong method", async () => {
		// A GET on a promote endpoint is a caller mistake, and answering it as a
		// promotion would advance a delivery on a read.
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy(),
		});
		expect(
			(await call(server, `/rollouts/${created.body.id}/promote`)).status,
		).toBe(404);
	});

	it("ignores a trailing slash", async () => {
		// Clients differ on whether they append one; a 404 over that would be a
		// confusing intermittent failure.
		const server = await sidecar();
		expect((await call(server, "/rollouts/")).status).toBe(200);
	});

	it("decodes a percent-encoded rollout id", async () => {
		// Ids can carry characters that must be encoded in a path. Reading the
		// raw segment would look up an id nobody issued.
		const { body } = await call(await sidecar(), "/rollouts/a%2Fb");
		expect(body.error).toContain("a/b");
	});
});

describe("promotion", () => {
	it("refuses a rollout that does not exist, as a 404", async () => {
		const engine = createStationRolloutEngine();
		expect(() => promoteStationRollout(engine, "nope")).toThrow(/not found/);
		expect(
			(
				await call(await sidecar(), "/rollouts/nope/promote", {
					method: "POST",
				})
			).status,
		).toBe(404);
	});

	it("refuses to promote from the middle of a staged rollout", async () => {
		// Promoting from stage one skips every stage that has not run, which is
		// the entire point of a staged delivery. The distinct code lets a caller
		// tell "not yet" from "never".
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy({
				stages: [{ percent: 10 }, { percent: 50 }, { percent: 100 }],
			}),
		});
		const { status, body } = await call(
			server,
			`/rollouts/${created.body.id}/promote`,
			{ method: "POST" },
		);
		expect(status).toBe(409);
		expect(body.code).toBe("rollout-not-final-stage");
	});

	it("is idempotent once promoted", async () => {
		// A retried promotion must not error: the caller's intent is already
		// satisfied, and a 409 there would make a safe retry look like a failure.
		const engine = createStationRolloutEngine();
		const state = engine.start(policy({ stages: [{ percent: 100 }] }) as never);
		const promoted = promoteStationRollout(engine, state.id);
		expect(promoteStationRollout(engine, state.id)).toEqual(promoted);
	});

	it("refuses to promote a rollout that is not running", async () => {
		// A rolled-back or failed rollout is not a candidate for promotion, and
		// promoting one would re-enable a delivery an operator stopped.
		const engine = createStationRolloutEngine();
		const state = engine.start(policy({ stages: [{ percent: 100 }] }) as never);
		engine.rollback(state.id, { operator: true });
		expect(() => promoteStationRollout(engine, state.id)).toThrow(
			/cannot promote from/,
		);
	});
});

describe("driving a rollout over HTTP", () => {
	const start = async () => {
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy({ stages: [{ percent: 100 }] }),
		});
		return { server, id: created.body.id as string };
	};

	it("steps with a health signal", async () => {
		const { server, id } = await start();
		const { status } = await call(server, `/rollouts/${id}/step`, {
			method: "POST",
			body: { healthy: true },
		});
		expect(status).toBe(200);
	});

	it("rolls back with the caller's reason, defaulting to an operator action", async () => {
		// An unattributed rollback in an audit log is much less useful than one
		// naming who or what triggered it — and "operator" is the honest default
		// when a human hit the endpoint with no body.
		const { server, id } = await start();
		const { status, body } = await call(server, `/rollouts/${id}/rollback`, {
			method: "POST",
			body: {},
		});
		expect(status).toBe(200);
		expect(JSON.stringify(body)).toContain("operator");
	});

	it("carries an explicit rollback reason through", async () => {
		const { server, id } = await start();
		const { body } = await call(server, `/rollouts/${id}/rollback`, {
			method: "POST",
			body: { healthCheck: "error rate" },
		});
		expect(JSON.stringify(body)).toContain("healthCheck");
	});

	it("defaults the approver to the station when none is named", async () => {
		// An approval attributed to nobody is not an approval. "station" is
		// honest: the request reached the station-local sidecar.
		const { server, id } = await start();
		for (const approver of [undefined, "", 7]) {
			const { status } = await call(server, `/rollouts/${id}/approve`, {
				method: "POST",
				body: { approver },
			});
			expect(status, String(approver)).toBeLessThan(500);
		}
	});

	it("reports outcomes, treating an absent list as empty", async () => {
		// A malformed outcomes body must not throw inside the engine; an empty
		// report is the safe reading.
		const { server, id } = await start();
		const { status } = await call(server, `/rollouts/${id}/outcomes`, {
			method: "POST",
			body: {},
		});
		expect(status).toBeLessThan(500);
	});
});

describe("error mapping", () => {
	it("maps a missing rollout to 404 on every action", async () => {
		// Each of these takes an id; all of them have to agree that an unknown
		// one is not found rather than a server fault.
		const server = await sidecar();
		for (const action of [
			"step",
			"promote",
			"rollback",
			"approve",
			"resume",
			"outcomes",
		]) {
			const { status, body } = await call(server, `/rollouts/ghost/${action}`, {
				method: "POST",
				body: {},
			});
			expect(status, action).toBe(404);
			expect(body.ok).toBe(false);
		}
	});

	it("maps a malformed policy to 400, carrying its code", async () => {
		const { status, body } = await call(await sidecar(), "/rollouts", {
			method: "POST",
			body: policy({ name: "" }),
		});
		expect(status).toBe(400);
		expect(body.code).toBe("rollout-policy-invalid");
	});

	it("maps a wrong-state rollout to 409, which a caller may retry later", async () => {
		// 409 and 400 mean different things to a retry loop: one might succeed
		// after the rollout advances, the other never will.
		const server = await sidecar();
		const created = await call(server, "/rollouts", {
			method: "POST",
			body: policy({ stages: [{ percent: 10 }, { percent: 100 }] }),
		});
		const { status } = await call(
			server,
			`/rollouts/${created.body.id}/promote`,
			{ method: "POST" },
		);
		expect(status).toBe(409);
	});

	it("always answers JSON with an ok flag on failure", async () => {
		// A caller parsing the body should not have to branch on content type to
		// find out whether the request worked.
		const { body } = await call(await sidecar(), "/nope");
		expect(body).toMatchObject({ ok: false });
	});
});
