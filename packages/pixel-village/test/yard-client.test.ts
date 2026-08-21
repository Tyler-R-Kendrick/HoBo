/**
 * The browser host's control-api client.
 *
 * The property this client is built around is **degrading without going dark**.
 * Live updates come over SSE, but SSE fails in ways a browser cannot always
 * distinguish from a slow network — a proxy that buffers, a corporate gateway
 * that drops long-lived connections, an environment with no `EventSource` at
 * all. So every failure path falls back to polling rather than leaving the UI
 * frozen on a stale snapshot with no indication anything is wrong. A dashboard
 * showing month-old state confidently is worse than one that says it cannot
 * reach the control plane.
 *
 * The other rule: `deployments()` answers `{ available: false }` rather than
 * throwing. A control plane without that route is simply a yard with no trains,
 * and the rail stays honestly empty — it does not invent rows, and it does not
 * take the whole view down.
 */
import { describe, expect, it, vi } from "vitest";

import { createYardClient } from "../src/net/yard-client.js";

const SNAPSHOT = { stationId: "station:local", status: "open" };

type Reply = { ok?: boolean; status?: number; body?: unknown };

/** A fetch stand-in recording calls and answering from a per-path map. */
function fetchStub(replies: Record<string, Reply> = {}, fallback?: Reply) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	const impl = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		const path = url.replace(/^https?:\/\/[^/]+/u, "").split("?")[0] ?? "";
		const reply = replies[path] ??
			fallback ?? { ok: true, status: 200, body: { ok: true, data: SNAPSHOT } };
		return {
			ok: reply.ok ?? true,
			status: reply.status ?? 200,
			json: async () => reply.body ?? { ok: true, data: SNAPSHOT },
		};
	}) as typeof fetch;
	return { impl, calls };
}

/** A controllable EventSource stand-in. */
function eventSourceStub(options: { throwOnConstruct?: boolean } = {}) {
	const instances: Array<{
		url: string;
		listeners: Map<string, (event: MessageEvent) => void>;
		closed: boolean;
	}> = [];
	class Stub {
		readonly listeners = new Map<string, (event: MessageEvent) => void>();
		closed = false;
		constructor(readonly url: string) {
			if (options.throwOnConstruct) throw new Error("blocked");
			instances.push(this);
		}
		addEventListener(name: string, handler: (event: MessageEvent) => void) {
			this.listeners.set(name, handler);
		}
		close() {
			this.closed = true;
		}
	}
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	return { Stub: Stub as typeof EventSource, instances };
}

function client(
	replies?: Record<string, Reply>,
	eventSourceImpl: typeof EventSource | null = null,
) {
	const fetched = fetchStub(replies);
	return {
		client: createYardClient({
			apiBase: "http://control.local/",
			fetchImpl: fetched.impl,
			eventSourceImpl,
		}),
		calls: fetched.calls,
	};
}

describe("construction", () => {
	it("strips a trailing slash from the api base", () => {
		// Every path is concatenated onto this. Without the strip the URL would
		// contain `//`, which some gateways normalise and others route
		// differently — a difference that appears in one deployment only.
		expect(createYardClient({ apiBase: "http://control.local/" }).apiBase).toBe(
			"http://control.local",
		);
	});

	it("defaults the station to the local one", () => {
		// The browser host runs against a local station unless told otherwise.
		// An empty default would query a station id of "" and get nothing back.
		expect(createYardClient({ apiBase: "http://x" }).stationId).toBe(
			"station:local",
		);
	});

	it("honours an explicit station id", () => {
		expect(
			createYardClient({ apiBase: "http://x", stationId: "station:prod" })
				.stationId,
		).toBe("station:prod");
	});
});

describe("snapshot", () => {
	it("returns the projection the control plane sent", async () => {
		const { client: yard } = client();
		expect(await yard.snapshot()).toEqual(SNAPSHOT);
	});

	it("encodes the station id into the query", async () => {
		// Station ids contain a colon. Leaving it unencoded produces a URL some
		// servers parse as a port.
		const fetched = fetchStub();
		const yard = createYardClient({
			apiBase: "http://control.local",
			stationId: "station:local",
			fetchImpl: fetched.impl,
		});
		await yard.snapshot();
		expect(fetched.calls[0]?.url).toContain("stationId=station%3Alocal");
	});

	it("sends a JSON content type", async () => {
		const { client: yard, calls } = client();
		await yard.snapshot();
		const firstCall = calls[0];
		if (!firstCall) throw new Error("fetch stub was not called");
		expect(
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			// SAFETY: fetchStub records headers as a string dictionary.
			(firstCall.init.headers as Record<string, string>)["content-type"],
		).toBe("application/json");
	});

	it("refuses an envelope that reports failure", async () => {
		const { client: yard } = client({
			"/v1/yard/snapshot": { body: { ok: false, message: "no station" } },
		});
		await expect(yard.snapshot()).rejects.toThrow(/no station/u);
	});

	it("refuses a successful envelope carrying no data", async () => {
		// `ok: true` with nothing in it would otherwise return undefined and be
		// rendered as an empty yard — indistinguishable from a real one.
		const { client: yard } = client({
			"/v1/yard/snapshot": { body: { ok: true } },
		});
		await expect(yard.snapshot()).rejects.toThrow(/no snapshot/u);
	});

	it("raises the server's message on a 4xx", async () => {
		const { client: yard } = client({
			"/v1/yard/snapshot": {
				ok: false,
				status: 403,
				body: { ok: false, message: "forbidden" },
			},
		});
		await expect(yard.snapshot()).rejects.toThrow(/forbidden/u);
	});

	it("falls back to the status when the server sent no message", async () => {
		const { client: yard } = client({
			"/v1/yard/snapshot": { ok: false, status: 500, body: { ok: false } },
		});
		await expect(yard.snapshot()).rejects.toThrow(/API 500/u);
	});

	it("does not throw on a failure envelope with a 2xx status", async () => {
		// `!body.ok && res.status >= 400`. A 200 carrying `ok: false` is the
		// control plane declining in-band, and the caller's own check handles it —
		// which is what gives `snapshot()` its more specific "no snapshot" error.
		const { client: yard } = client({
			"/v1/yard/snapshot": { status: 200, body: { ok: false } },
		});
		await expect(yard.snapshot()).rejects.toThrow(/no snapshot/u);
	});
});

describe("subscribe", () => {
	it("opens an SSE stream when an EventSource is available", () => {
		const { Stub, instances } = eventSourceStub();
		const { client: yard } = client(undefined, Stub);
		const stop = yard.subscribe(() => {});
		expect(instances).toHaveLength(1);
		expect(instances[0]?.url).toContain("/v1/yard/stream");
		stop();
	});

	it("delivers a snapshot from a yard event", () => {
		const { Stub, instances } = eventSourceStub();
		const { client: yard } = client(undefined, Stub);
		const seen: unknown[] = [];
		const stop = yard.subscribe((snap) => seen.push(snap));
		instances[0]?.listeners.get("yard")?.({
			data: JSON.stringify(SNAPSHOT),
		});
		expect(seen).toEqual([SNAPSHOT]);
		stop();
	});

	it("reports a malformed event rather than crashing the stream", () => {
		// A truncated SSE frame is a normal consequence of a dropped connection.
		// Letting the parse error escape would tear down the listener and stop
		// every later update.
		const { Stub, instances } = eventSourceStub();
		const { client: yard } = client(undefined, Stub);
		const errors: string[] = [];
		const stop = yard.subscribe(
			() => {},
			(message) => errors.push(message),
		);
		expect(() =>
			instances[0]?.listeners.get("yard")?.({ data: "{not json" }),
		).not.toThrow();
		expect(errors).toHaveLength(1);
		stop();
	});

	it("starts polling when the stream errors, and keeps the stream open", () => {
		// The degradation rule. SSE errors are often transient, so the stream is
		// left retrying while polling covers the gap — dropping it would give up
		// on live updates for the rest of the session.
		vi.useFakeTimers();
		try {
			const { Stub, instances } = eventSourceStub();
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: Stub,
			});
			const stop = yard.subscribe(() => {});
			expect(fetched.calls).toHaveLength(0);
			instances[0]?.listeners.get("error")?.({});
			expect(fetched.calls.length).toBeGreaterThan(0);
			expect(instances[0]?.closed).toBe(false);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("polls immediately rather than waiting a full interval", () => {
		// The first tick is synchronous. Waiting 800ms before the first snapshot
		// would leave the dashboard blank on load for no reason.
		vi.useFakeTimers();
		try {
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: null,
			});
			const stop = yard.subscribe(() => {});
			expect(fetched.calls).toHaveLength(1);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("polls on an interval thereafter", () => {
		vi.useFakeTimers();
		try {
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: null,
			});
			const stop = yard.subscribe(() => {}, undefined, { pollMs: 100 });
			vi.advanceTimersByTime(350);
			expect(fetched.calls.length).toBeGreaterThan(2);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("polls when the environment has no EventSource at all", () => {
		// The oldest browser and the server-side render both land here. Requiring
		// SSE would make the dashboard show nothing rather than something slower.
		vi.useFakeTimers();
		try {
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: null,
			});
			const stop = yard.subscribe(() => {});
			expect(fetched.calls.length).toBeGreaterThan(0);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("polls when constructing the EventSource throws", () => {
		// A blocked or unsupported stream URL throws synchronously in some
		// browsers. Letting it escape would break `subscribe` entirely rather
		// than degrading it.
		vi.useFakeTimers();
		try {
			const { Stub } = eventSourceStub({ throwOnConstruct: true });
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: Stub,
			});
			expect(() => yard.subscribe(() => {})()).not.toThrow();
			expect(fetched.calls.length).toBeGreaterThan(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reports a failing poll through the error callback", async () => {
		// Real timers here: the poll's rejection travels through several
		// microtasks before reaching the callback, and faking timers does not
		// advance those.
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		// SAFETY: The assertion is constrained by the typed boundary or deterministic test fixture.
		// SAFETY: The test stub implements the fetch contract used by the client.
		const impl = (async () => {
			throw new Error("network down");
			// SAFETY: The test stub implements the fetch contract used by the client.
		}) /* SAFETY: The test stub implements the fetch contract. */ as typeof fetch;
		const yard = createYardClient({
			apiBase: "http://control.local",
			fetchImpl: impl,
			eventSourceImpl: null,
		});
		const errors: string[] = [];
		const stop = yard.subscribe(
			() => {},
			(message) => errors.push(message),
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		stop();
		expect(errors.join(" ")).toContain("network down");
	});

	it("stops polling and closes the stream on unsubscribe", () => {
		// A dashboard that navigated away must not keep polling forever — that is
		// a leak that survives the component and eventually the page.
		vi.useFakeTimers();
		try {
			const { Stub, instances } = eventSourceStub();
			const fetched = fetchStub();
			const yard = createYardClient({
				apiBase: "http://control.local",
				fetchImpl: fetched.impl,
				eventSourceImpl: Stub,
			});
			const stop = yard.subscribe(() => {}, undefined, { pollMs: 50 });
			instances[0]?.listeners.get("error")?.({});
			const before = fetched.calls.length;
			stop();
			vi.advanceTimersByTime(500);
			expect(fetched.calls.length).toBe(before);
			expect(instances[0]?.closed).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("delivers no snapshot after unsubscribe", async () => {
		// The `stopped` guard. A poll already in flight when the caller stopped
		// must not deliver into a component that has been torn down.
		const fetched = fetchStub();
		const yard = createYardClient({
			apiBase: "http://control.local",
			fetchImpl: fetched.impl,
			eventSourceImpl: null,
		});
		const seen: unknown[] = [];
		yard.subscribe((snap) => seen.push(snap))();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(seen).toEqual([]);
	});
});

describe("runAction", () => {
	it("posts each lifecycle action to its own endpoint", async () => {
		for (const [action, path] of [
			["init", "/v1/station/init"],
			["up", "/v1/station/up"],
			["down", "/v1/station/down"],
			["publish-rail", "/v1/station/rails/publish"],
		] as const) {
			const { client: yard, calls } = client();
			const message = await yard.runAction(action);
			expect(calls[0]?.url).toContain(path);
			expect(calls[0]?.init.method).toBe("POST");
			expect(message.length).toBeGreaterThan(0);
		}
	});

	it("carries the station id on the actions that scope to one", async () => {
		// `init` creates a station and so cannot name one; the rest act on an
		// existing station and must say which, or the control plane would apply
		// them to whichever it considered current.
		for (const action of ["up", "down", "publish-rail"] as const) {
			const { client: yard, calls } = client();
			await yard.runAction(action);
			expect(String(calls[0]?.init.body)).toContain("station:local");
		}
	});

	it("activates the first non-bootstrap rail", async () => {
		// The bootstrap rail is the scaffold the station starts with. Activating
		// it would roll the station back to its initial state rather than
		// forward to what was published.
		const { client: yard, calls } = client({
			"/v1/station/rails": {
				body: {
					ok: true,
					data: {
						rails: [
							{ contentHash: "boot", isBootstrap: true },
							{ contentHash: "real" },
						],
					},
				},
			},
		});
		await yard.runAction("activate-rail");
		expect(calls.map((call) => String(call.init.body)).join(" ")).toContain(
			"real",
		);
	});

	it("falls back to the only rail when every rail is a bootstrap", async () => {
		// `|| rails[0]`. A station with nothing but its bootstrap can still be
		// activated — refusing would make the action impossible on a fresh
		// station, which is exactly when someone reaches for it.
		const { client: yard, calls } = client({
			"/v1/station/rails": {
				body: {
					ok: true,
					data: { rails: [{ contentHash: "boot", isBootstrap: true }] },
				},
			},
		});
		await yard.runAction("activate-rail");
		expect(calls.map((call) => String(call.init.body)).join(" ")).toContain(
			"boot",
		);
	});

	it("refuses to activate when there are no rails at all", async () => {
		// Nothing to activate. Posting an empty hash would ask the control plane
		// to activate a rail named "", and the error would come back from there.
		const { client: yard } = client({
			"/v1/station/rails": { body: { ok: true, data: { rails: [] } } },
		});
		await expect(yard.runAction("activate-rail")).rejects.toThrow(/no rail/u);
	});

	it("treats a missing rails field as no rails", async () => {
		// `list.data?.rails || []`. A control plane answering without the field
		// must not produce a crash on an undefined `.find`.
		const { client: yard } = client({
			"/v1/station/rails": { body: { ok: true, data: {} } },
		});
		await expect(yard.runAction("activate-rail")).rejects.toThrow(/no rail/u);
	});

	it("routes the connection actions through confirm", async () => {
		// So the two paths that create or authorize a Connection share one
		// implementation — a divergence there would let the button and the
		// confirm dialog send different payloads.
		const { client: yard, calls } = client();
		await yard.runAction("create-conn");
		expect(calls[0]?.url).toContain("/v1/connection/create");

		const authorized = client();
		await authorized.client.runAction("authorize-conn");
		expect(authorized.calls[0]?.url).toContain("/v1/connection/authorize");
	});
});

describe("confirm", () => {
	it("posts a connection create with its provider and alias", async () => {
		const { client: yard, calls } = client();
		await yard.confirm("connectionCreate", {
			provider: "asana",
			alias: "work",
			stationId: "station:other",
		});
		const body = JSON.parse(String(calls[0]?.init.body));
		expect(body).toEqual({
			provider: "asana",
			alias: "work",
			stationId: "station:other",
		});
	});

	it("falls back to the client's station when the values omit one", async () => {
		// `values.stationId || stationId`. A confirm dialog that did not carry a
		// station must still act on the one the client is bound to rather than
		// posting an empty id.
		const { client: yard, calls } = client();
		await yard.confirm("connectionCreate", {
			provider: "asana",
			alias: "work",
		});
		expect(JSON.parse(String(calls[0]?.init.body)).stationId).toBe(
			"station:local",
		);
	});

	it("defaults the rail identity fields when a publish omits them", async () => {
		// Publishing with no values is the quick path from a button. Posting
		// empty strings would create a rail with no name or version, which is
		// unaddressable afterwards.
		const { client: yard, calls } = client();
		await yard.confirm("stationRailsPublish", {});
		expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
			id: "rail-prod",
			name: "prod",
			version: "1.0.0",
		});
	});

	it("honours explicit rail identity fields", async () => {
		const { client: yard, calls } = client();
		await yard.confirm("stationRailsPublish", {
			id: "rail-eu",
			name: "eu",
			version: "2.1.0",
		});
		expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
			id: "rail-eu",
			name: "eu",
			version: "2.1.0",
		});
	});

	it("approves before activating, in that order", async () => {
		// A rail has to be approved to be activatable. Sending activate alone
		// would be refused by the control plane; sending them out of order would
		// be refused too, and the error would name the wrong step.
		const { client: yard, calls } = client();
		await yard.confirm("stationRailsActivate", { hashOrId: "abc" });
		expect(calls).toHaveLength(2);
		expect(calls[0]?.url).toContain("/rails/approve");
		expect(calls[1]?.url).toContain("/rails/activate");
	});

	it("posts approve alone for the approve op", async () => {
		const { client: yard, calls } = client();
		await yard.confirm("stationRailsApprove", { hashOrId: "abc" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toContain("/rails/approve");
	});

	it("answers the read-only ops without any request", async () => {
		// `doctorSnapshot` and `noop` exist so a confirm dialog can be dismissed
		// or acknowledged without side effects. Posting anything here would make
		// cancelling a dialog mutate the station.
		for (const op of ["doctorSnapshot", "noop"] as const) {
			const { client: yard, calls } = client();
			expect(await yard.confirm(op, {})).toBe("Noted.");
			expect(calls).toEqual([]);
		}
	});
});

describe("deployments", () => {
	it("returns the view the control plane sent", async () => {
		const { client: yard } = client({
			"/v1/deployments/view": {
				body: { ok: true, data: { available: true, rows: [] } },
			},
		});
		expect(await yard.deployments()).toEqual({ available: true, rows: [] });
	});

	it("reports unavailable rather than throwing when the route is missing", async () => {
		// A control plane without the route is a yard with no trains. Throwing
		// would take down the whole view for a feature that is simply absent.
		const { client: yard } = client({
			"/v1/deployments/view": {
				ok: false,
				status: 404,
				body: { ok: false, message: "not found" },
			},
		});
		expect(await yard.deployments()).toEqual({ available: false });
	});

	it("reports unavailable when the network fails", async () => {
		// SAFETY: The test stub implements the fetch contract used by the client.
		const impl = (async () => {
			throw new Error("offline");
		}) as typeof fetch;
		const yard = createYardClient({
			apiBase: "http://control.local",
			fetchImpl: impl,
		});
		expect(await yard.deployments()).toEqual({ available: false });
	});

	it("reports unavailable rather than inventing rows for an empty envelope", async () => {
		// `body.data ?? { available: false }`. Returning undefined would render as
		// a view with no rows, which reads as "no deployments" rather than "no
		// deployment tracking here" — two different facts.
		const { client: yard } = client({
			"/v1/deployments/view": { body: { ok: true } },
		});
		expect(await yard.deployments()).toEqual({ available: false });
	});
});
