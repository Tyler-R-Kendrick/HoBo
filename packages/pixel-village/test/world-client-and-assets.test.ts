/**
 * The world stream client and the browser-safe asset index.
 *
 * The world client is a snapshot-plus-delta stream, and that shape carries one
 * rule that matters more than the rest: **a delta is only applied on top of a
 * snapshot**. An event folded onto nothing would produce a world built from a
 * partial history — a village where an agent moved but was never born. So a
 * `world` delta arriving before any snapshot is dropped rather than applied, and
 * the client waits for the snapshot the server will send.
 *
 * It also carries the same degrade-don't-go-dark rule as the yard client: every
 * SSE failure falls back to polling rather than freezing the view on stale
 * state, because a browser cannot reliably tell a dropped stream from a quiet
 * one.
 *
 * The asset resolvers are pure and small, and their job is to make "never
 * hard-code a clip name" enforceable. Every animation is reached through a
 * stable id, and every failure along that path names which link broke — the id,
 * the sheet, or the clip — because those are three different fixes.
 */
import { describe, expect, it } from "vitest";

import {
	allAssetPaths,
	animationFrameList,
	expectedSheetPixelSize,
	frameCount,
	resolveAnimation,
} from "../src/assets-index-core.js";
import { createWorldClient, foldWorldDelta } from "../src/net/world-client.js";

const SHEET = {
	id: "villager",
	path: "assets/villager.png",
	frameWidth: 16,
	frameHeight: 24,
	columns: 4,
	rows: 2,
	margin: 0,
	spacing: 0,
	origin: { x: 0.5, y: 1 },
	animations: {
		walk: {
			id: "villager.walk",
			sourceClipName: "walk",
			frames: [0, 1, 2, 3],
			frameRate: 8,
			repeat: -1,
		},
		idle: {
			id: "villager.idle",
			sourceClipName: "idle",
			frames: "all",
			frameRate: 4,
			repeat: -1,
		},
	},
} as never;

const INDEX = {
	spritesheets: { villager: SHEET },
	animationIds: {
		"villager.walk": { sheet: "villager", animation: "walk" },
		"villager.idle": { sheet: "villager", animation: "idle" },
	},
} as never;

describe("resolveAnimation", () => {
	it("resolves a stable id to its sheet and clip", () => {
		// The indirection that makes "never hard-code a clip name" enforceable:
		// callers name an id, and the index owns which sheet and clip serve it.
		const resolved = resolveAnimation(INDEX, "villager.walk");
		expect(resolved.sheet.id).toBe("villager");
		expect(resolved.animation.sourceClipName).toBe("walk");
	});

	it("names the unknown id when nothing is registered under it", () => {
		// Three failures, three messages, because they are three different
		// fixes: add the id, add the sheet, or add the clip.
		expect(() => resolveAnimation(INDEX, "villager.dance")).toThrow(
			/unknown animation id: villager\.dance/u,
		);
	});

	it("names the missing sheet when an id points at one that does not exist", () => {
		expect(() =>
			resolveAnimation(
				{
					...INDEX,
					animationIds: {
						"villager.walk": { sheet: "ghost", animation: "walk" },
					},
				} as never,
				"villager.walk",
			),
		).toThrow(/unknown sheet for animation villager\.walk: ghost/u);
	});

	it("names the missing clip when a sheet does not carry it", () => {
		expect(() =>
			resolveAnimation(
				{
					...INDEX,
					animationIds: {
						"villager.walk": { sheet: "villager", animation: "dance" },
					},
				} as never,
				"villager.walk",
			),
		).toThrow(/unknown animation dance on sheet villager/u);
	});
});

describe("expectedSheetPixelSize", () => {
	it("multiplies the grid by the frame size", () => {
		// This is checked against the real PNG's dimensions. A mismatch means the
		// sheet was regenerated at a different size and every frame index would
		// slice the wrong pixels — art that renders, and renders wrong.
		expect(expectedSheetPixelSize(SHEET)).toEqual({ width: 64, height: 48 });
	});

	it("adds the margin on both edges", () => {
		expect(expectedSheetPixelSize({ ...SHEET, margin: 2 } as never)).toEqual({
			width: 68,
			height: 52,
		});
	});

	it("adds spacing between frames but not outside them", () => {
		// `columns - 1` gaps, not `columns`. Counting one too many would compute
		// a size larger than any real sheet and reject every one of them.
		expect(expectedSheetPixelSize({ ...SHEET, spacing: 1 } as never)).toEqual({
			width: 67,
			height: 49,
		});
	});

	it("does not subtract a gap from a single-column sheet", () => {
		// `Math.max(0, columns - 1)`. Without the clamp a one-column sheet would
		// have its spacing subtracted, producing a size smaller than the frame.
		expect(
			expectedSheetPixelSize({
				...SHEET,
				columns: 1,
				rows: 1,
				spacing: 4,
			} as never),
		).toEqual({ width: 16, height: 24 });
	});
});

describe("frameCount and animationFrameList", () => {
	it("counts the whole grid", () => {
		expect(frameCount(SHEET)).toBe(8);
	});

	it("lists an explicit frame sequence in order", () => {
		// Order is the animation. A set or a sort would play the frames in the
		// wrong sequence, which looks like a different animation entirely.
		expect(animationFrameList(SHEET, SHEET.animations.walk as never)).toEqual([
			0, 1, 2, 3,
		]);
	});

	it("copies the sequence rather than exposing the definition's array", () => {
		// The index is shared across every sprite using this clip. A caller
		// mutating the returned list would change what every later sprite plays.
		const frames = animationFrameList(SHEET, SHEET.animations.walk as never);
		frames.push(99);
		expect(animationFrameList(SHEET, SHEET.animations.walk as never)).toEqual([
			0, 1, 2, 3,
		]);
	});

	it("expands `all` to the whole sheet", () => {
		expect(animationFrameList(SHEET, SHEET.animations.idle as never)).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7,
		]);
	});

	it("honours an explicit frame count over the grid size", () => {
		// A sheet padded with empty trailing frames declares how many are real.
		// Playing the whole grid would animate through blank cells.
		expect(
			animationFrameList(SHEET, {
				...SHEET.animations.idle,
				frameCount: 3,
			} as never),
		).toEqual([0, 1, 2]);
	});

	it("returns nothing for a zero frame count", () => {
		expect(
			animationFrameList(SHEET, {
				...SHEET.animations.idle,
				frameCount: 0,
			} as never),
		).toEqual([]);
	});
});

describe("allAssetPaths", () => {
	it("collects spritesheet paths", () => {
		expect(allAssetPaths(INDEX)).toEqual(["assets/villager.png"]);
	});

	it("collects backgrounds and images alongside sheets", () => {
		// The list feeds preload and coverage checks. Missing a category would
		// leave those assets unloaded at runtime and unchecked at build time —
		// the second is why it matters more than it looks.
		const paths = allAssetPaths({
			...INDEX,
			backgrounds: { sky: { path: "assets/sky.png", width: 1, height: 1 } },
			images: { logo: { path: "assets/logo.png", width: 1, height: 1 } },
		} as never);
		expect(paths.sort()).toEqual([
			"assets/logo.png",
			"assets/sky.png",
			"assets/villager.png",
		]);
	});

	it("tolerates an index with no backgrounds or images at all", () => {
		// `?? {}`. Both categories are optional in the manifest, and an index
		// without them must not crash the preloader.
		expect(() => allAssetPaths(INDEX)).not.toThrow();
	});

	it("omits audio, which is not a PNG path", () => {
		// The function is documented as PNG paths for preload and coverage. Audio
		// has its own loader, and mixing it in would make a coverage check demand
		// image dimensions for a WAV.
		const paths = allAssetPaths({
			...INDEX,
			audio: {
				chime: {
					id: "chime",
					path: "assets/chime.wav",
					durationMs: 100,
					role: "ui",
				},
			},
		} as never);
		expect(paths).not.toContain("assets/chime.wav");
	});
});

describe("foldWorldDelta", () => {
	const WORLD = { tick: 0, agents: {} } as never;

	it("returns the world unchanged for an empty event list", () => {
		// A tick with nothing in it is normal. Rebuilding the state anyway would
		// churn every consumer's identity checks for no change.
		expect(foldWorldDelta(WORLD, [])).toBe(WORLD);
	});

	it("applies events in order", () => {
		// Order is causality. Applying a move before the spawn that created the
		// agent would either drop the move or invent an agent.
		const applied = foldWorldDelta(WORLD, [
			{ kind: "tick", tick: 1 },
			{ kind: "tick", tick: 2 },
		] as never);
		expect(applied).not.toBe(WORLD);
	});

	it("does not mutate the world it was given", () => {
		// The world is held by the renderer between frames. Mutating in place
		// would make a re-render see a state it never got a callback for.
		const original = { tick: 0, agents: {} } as never;
		foldWorldDelta(original, [{ kind: "tick", tick: 1 }] as never);
		expect(original).toEqual({ tick: 0, agents: {} });
	});
});

describe("the world client", () => {
	const WORLD = { tick: 3, agents: {} };

	type Reply = { ok?: boolean; status?: number; body?: unknown };

	function fetchStub(reply?: Reply) {
		const calls: string[] = [];
		const impl = (async (url: string) => {
			calls.push(url);
			return {
				ok: reply?.ok ?? true,
				status: reply?.status ?? 200,
				json: async () =>
					reply?.body ?? {
						ok: true,
						data: { world: WORLD, demo: false, seed: null },
					},
			};
		}) as unknown as typeof fetch;
		return { impl, calls };
	}

	function eventSourceStub() {
		const instances: Array<{
			url: string;
			listeners: Map<string, (event: unknown) => void>;
			closed: boolean;
		}> = [];
		class Stub {
			readonly listeners = new Map<string, (event: unknown) => void>();
			closed = false;
			constructor(readonly url: string) {
				instances.push(this);
			}
			addEventListener(name: string, handler: (event: unknown) => void) {
				this.listeners.set(name, handler);
			}
			close() {
				this.closed = true;
			}
		}
		return { Stub: Stub as unknown as typeof EventSource, instances };
	}

	it("reports no world before the first snapshot", () => {
		// Null, not an empty world. An empty village rendered confidently is
		// indistinguishable from a real one that happens to be empty.
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: null,
		});
		expect(client.getWorld()).toBeNull();
		expect(client.isDemo()).toBe(false);
	});

	it("caches the snapshot it fetched", async () => {
		const client = createWorldClient({
			apiBase: "http://control.local/",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: null,
		});
		await client.snapshot();
		expect(client.getWorld()).toEqual(WORLD);
	});

	it("carries the demo flag the server set", async () => {
		// The SIMULATED badge depends on this (ADR-0147). A demo world rendered
		// without the badge would read as production state.
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub({
				body: { ok: true, data: { world: WORLD, demo: true, seed: 7 } },
			}).impl,
			eventSourceImpl: null,
		});
		await client.snapshot();
		expect(client.isDemo()).toBe(true);
	});

	it("strips a trailing slash from the api base", () => {
		expect(
			createWorldClient({ apiBase: "http://control.local/" }).apiBase,
		).toBe("http://control.local");
	});

	it("refuses an envelope with no world", async () => {
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub({ body: { ok: true } }).impl,
			eventSourceImpl: null,
		});
		await expect(client.snapshot()).rejects.toThrow(/no world snapshot/u);
	});

	it("raises the server's message when it sent one", async () => {
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub({ body: { ok: false, message: "world offline" } })
				.impl,
			eventSourceImpl: null,
		});
		await expect(client.snapshot()).rejects.toThrow(/world offline/u);
	});

	it("applies a snapshot event from the stream", () => {
		const { Stub, instances } = eventSourceStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: Stub,
		});
		const seen: unknown[] = [];
		const stop = client.subscribe((world) => seen.push(world));
		instances[0]?.listeners.get("world-snapshot")?.({
			data: JSON.stringify({ world: WORLD, demo: true }),
		});
		expect(seen).toEqual([WORLD]);
		expect(client.isDemo()).toBe(true);
		stop();
	});

	it("folds a delta onto the world it already has", () => {
		const { Stub, instances } = eventSourceStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: Stub,
		});
		const seen: unknown[] = [];
		const stop = client.subscribe((world) => seen.push(world));
		instances[0]?.listeners.get("world-snapshot")?.({
			data: JSON.stringify({ world: WORLD, demo: false }),
		});
		instances[0]?.listeners.get("world")?.({
			data: JSON.stringify({ events: [], tick: 4, demo: false }),
		});
		expect(seen).toHaveLength(2);
		stop();
	});

	it("drops a delta that arrives before any snapshot", () => {
		// The rule this client is built around. Folding events onto nothing would
		// produce a world assembled from partial history — a village where an
		// agent moved but was never born.
		const { Stub, instances } = eventSourceStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: Stub,
		});
		const seen: unknown[] = [];
		const stop = client.subscribe((world) => seen.push(world));
		instances[0]?.listeners.get("world")?.({
			data: JSON.stringify({ events: [], tick: 1, demo: false }),
		});
		expect(seen).toEqual([]);
		expect(client.getWorld()).toBeNull();
		stop();
	});

	it("reports a malformed frame rather than tearing down the stream", () => {
		const { Stub, instances } = eventSourceStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: Stub,
		});
		const errors: string[] = [];
		const stop = client.subscribe(
			() => {},
			(message) => errors.push(message),
		);
		instances[0]?.listeners.get("world-snapshot")?.({ data: "{broken" });
		instances[0]?.listeners.get("world")?.({ data: "{broken" });
		// Both report. The delta handler parses *before* checking whether a world
		// exists, so a malformed delta arriving before any snapshot is reported
		// rather than silently dropped — which is right: an unparseable frame is
		// a stream problem worth surfacing, while a well-formed early delta is
		// just ordering and is dropped quietly.
		expect(errors).toHaveLength(2);
		stop();
	});

	it("falls back to polling when the stream errors", () => {
		// Same degrade rule as the yard client, and the same reason: a browser
		// cannot reliably tell a dropped stream from a quiet one.
		const { Stub, instances } = eventSourceStub();
		const fetched = fetchStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetched.impl,
			eventSourceImpl: Stub,
		});
		const stop = client.subscribe(() => {});
		expect(fetched.calls).toHaveLength(0);
		instances[0]?.listeners.get("error")?.({});
		expect(fetched.calls.length).toBeGreaterThan(0);
		expect(instances[0]?.closed).toBe(false);
		stop();
	});

	it("polls when the environment has no EventSource", () => {
		const fetched = fetchStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetched.impl,
			eventSourceImpl: null,
		});
		const stop = client.subscribe(() => {});
		expect(fetched.calls.length).toBeGreaterThan(0);
		stop();
	});

	it("stops polling and closes the stream on unsubscribe", () => {
		const { Stub, instances } = eventSourceStub();
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: Stub,
		});
		client.subscribe(() => {})();
		expect(instances[0]?.closed).toBe(true);
	});

	it("delivers nothing after unsubscribe", async () => {
		// The `stopped` guard, on the emit path. A snapshot already in flight
		// must not reach a scene that has been destroyed.
		const client = createWorldClient({
			apiBase: "http://control.local",
			fetchImpl: fetchStub().impl,
			eventSourceImpl: null,
		});
		const seen: unknown[] = [];
		client.subscribe((world) => seen.push(world))();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(seen).toEqual([]);
	});
});
