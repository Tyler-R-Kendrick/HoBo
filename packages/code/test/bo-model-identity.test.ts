/**
 * Telling one model offer from another.
 *
 * The catalog lists every model Bo could run — local Ollama tags, saved
 * harness models, an OpenAI-compatible endpoint someone pointed at their own
 * server. `bo-model-catalog.test.ts` beside this file covers *what* ends up in
 * that list. This one covers the identity functions underneath it, and the
 * property they exist to protect:
 *
 * **Two offers that would run differently must not share a key.** The same
 * `provider/model` id can appear more than once — the same model name served
 * by two Ollama hosts, or reachable both directly and through a harness — and
 * those are different offers. Picking the wrong one runs the prompt somewhere
 * the user did not choose, and on a local-versus-cloud mix-up that is the
 * difference between free and billed. So `offerKey` folds in `via`, `baseUrl`
 * and `host`, and only the fields that are actually set.
 *
 * **`findOfferIndex` degrades rather than failing.** A saved selection is read
 * back after the catalog has changed underneath it — a model pulled, a host
 * removed. Exact match first, then id alone, then runtime id, then the first
 * offer. Returning "not found" would leave the UI with no selection at all,
 * which is worse than a defensible default.
 *
 * **Cycling wraps and never indexes out of bounds.** It is driven by arrow
 * keys held down.
 */
import { describe, expect, it } from "vitest";

import {
	type BoModelOffer,
	buildModelId,
	cycleBoModelOffer,
	findOfferIndex,
	offerKey,
	parseModelId,
} from "../src/bo-model-catalog.js";

const offer = (patch: Partial<BoModelOffer> = {}): BoModelOffer =>
	// SAFETY: the fixture is the offer shape the helpers are declared over.
	({
		id: "ollama/qwen",
		runtimeId: "ollama/qwen",
		label: "qwen",
		provider: "ollama",
		model: "qwen",
		source: "local",
		...patch,
	}) as BoModelOffer;

describe("keying an offer", () => {
	it("uses the id alone when nothing else distinguishes it", () => {
		expect(offerKey(offer())).toBe("ollama/qwen");
	});

	it("folds in the route it is reached by", () => {
		// The same model reached directly and through a harness are different
		// offers; running one when the user picked the other changes what
		// tools are available.
		expect(offerKey(offer({ via: "codex" }))).toContain("via=codex");
	});

	it("folds in the endpoint", () => {
		// Two endpoints serving the same model name is the ordinary shape of
		// an OpenAI-compatible setup.
		expect(offerKey(offer({ baseUrl: "http://localhost:1234" }))).toContain(
			"baseUrl=http://localhost:1234",
		);
	});

	it("folds in the host", () => {
		expect(offerKey(offer({ host: "http://box:11434" }))).toContain(
			"host=http://box:11434",
		);
	});

	it("separates two offers of the same model on different hosts", () => {
		// The failure this prevents: picking the wrong one runs the prompt on
		// a machine the user did not choose.
		expect(offerKey(offer({ host: "http://a:11434" }))).not.toBe(
			offerKey(offer({ host: "http://b:11434" })),
		);
	});

	it("separates a direct offer from one reached through a harness", () => {
		expect(offerKey(offer())).not.toBe(offerKey(offer({ via: "codex" })));
	});

	it("separates two endpoints serving the same name", () => {
		expect(offerKey(offer({ baseUrl: "http://a" }))).not.toBe(
			offerKey(offer({ baseUrl: "http://b" })),
		);
	});

	it("gives the same offer the same key twice", () => {
		// It is used as a map key and compared across renders; an unstable one
		// would lose the selection on every repaint.
		expect(offerKey(offer({ via: "codex" }))).toBe(
			offerKey(offer({ via: "codex" })),
		);
	});

	it("omits a field that is not set rather than keying on empty", () => {
		// `id|via=` and `id` would be two keys for one offer, and which one a
		// caller produced would depend on whether it spelled the absence as
		// undefined or "".
		expect(offerKey(offer())).not.toContain("via=");
	});

	it("keeps all three qualifiers when all three are set", () => {
		const key = offerKey(
			offer({ via: "codex", baseUrl: "http://a", host: "http://b" }),
		);
		expect(key).toContain("via=codex");
		expect(key).toContain("baseUrl=http://a");
		expect(key).toContain("host=http://b");
	});
});

describe("building and reading a model id", () => {
	it("joins a provider and a model", () => {
		expect(buildModelId("ollama", "qwen")).toBe("ollama/qwen");
	});

	it("round-trips a built id", () => {
		// The two are each other's inverse; a mismatch would mean a saved
		// selection could not be read back.
		expect(parseModelId(buildModelId("ollama", "qwen"))).toStrictEqual({
			provider: "ollama",
			model: "qwen",
		});
	});

	it("splits on the first slash only", () => {
		// A model name may itself contain slashes -- `openrouter/meta/llama`
		// is a real shape -- and splitting on all of them would lose most of
		// the name.
		expect(parseModelId("openrouter/meta/llama-3")).toStrictEqual({
			provider: "openrouter",
			model: "meta/llama-3",
		});
	});

	it("lower-cases the provider", () => {
		// Providers are matched against a fixed set; two spellings would be
		// two providers.
		expect(parseModelId("Anthropic/claude")?.provider).toBe("anthropic");
	});

	it("leaves the model name's case alone", () => {
		// Model names are looked up verbatim by the provider; lower-casing one
		// would ask for a model that does not exist.
		expect(parseModelId("anthropic/Claude-Sonnet-5")?.model).toBe(
			"Claude-Sonnet-5",
		);
	});

	it("keeps a tag on the model", () => {
		expect(parseModelId("ollama/qwen2.5-coder:1.5b")?.model).toBe(
			"qwen2.5-coder:1.5b",
		);
	});

	it("trims surrounding whitespace", () => {
		expect(parseModelId("  ollama/qwen  ")).toStrictEqual({
			provider: "ollama",
			model: "qwen",
		});
	});

	it("refuses an id with no slash", () => {
		// A bare name has no provider, and guessing one would route the prompt
		// somewhere arbitrary.
		expect(parseModelId("qwen")).toBeNull();
	});

	it("refuses an id that starts with a slash", () => {
		// An empty provider is not a provider.
		expect(parseModelId("/qwen")).toBeNull();
	});

	it("refuses an id that ends with a slash", () => {
		// An empty model name is not a model.
		expect(parseModelId("ollama/")).toBeNull();
	});

	it("refuses an empty id", () => {
		expect(parseModelId("")).toBeNull();
	});

	it("refuses a whitespace-only id", () => {
		expect(parseModelId("   ")).toBeNull();
	});

	it("refuses a lone slash", () => {
		expect(parseModelId("/")).toBeNull();
	});
});

describe("finding a saved selection again", () => {
	const offers = [
		offer({ id: "ollama/qwen", runtimeId: "ollama/qwen" }),
		offer({ id: "ollama/qwen", runtimeId: "ollama/qwen", via: "codex" }),
		offer({ id: "anthropic/claude", runtimeId: "anthropic/claude" }),
	];

	it("matches an id and route together", () => {
		// The exact match, and the one that matters: two offers share this id
		// and only the route tells them apart.
		expect(findOfferIndex(offers, "", "ollama/qwen", "codex")).toBe(1);
	});

	it("matches an id and endpoint together", () => {
		const withUrl = [
			offer({ id: "x/y", baseUrl: "http://a" }),
			offer({ id: "x/y", baseUrl: "http://b" }),
		];
		expect(findOfferIndex(withUrl, "", "x/y", undefined, "http://b")).toBe(1);
	});

	it("falls back to the id alone when the route no longer exists", () => {
		// A saved selection read back after the harness was removed. The model
		// is still there, so selecting it is better than selecting nothing.
		expect(findOfferIndex(offers, "", "ollama/qwen", "a-gone-harness")).toBe(0);
	});

	it("falls back to the runtime id when the model id does not match", () => {
		expect(findOfferIndex(offers, "anthropic/claude")).toBe(2);
	});

	it("falls back to the first offer when nothing matches", () => {
		// Returning "not found" would leave the UI with no selection at all,
		// which is worse than a defensible default.
		expect(findOfferIndex(offers, "nothing/here", "also/nothing")).toBe(0);
	});

	it("falls back to the first offer for an empty model", () => {
		expect(findOfferIndex(offers, "")).toBe(0);
	});

	it("falls back to the first offer for a whitespace model", () => {
		expect(findOfferIndex(offers, "   ")).toBe(0);
	});

	it("prefers the id match over the runtime match", () => {
		// The id is the saved selection; the runtime id is a looser hint.
		expect(findOfferIndex(offers, "anthropic/claude", "ollama/qwen")).toBe(0);
	});

	it("returns the first offer for an empty catalog", () => {
		// Nothing to select. Zero is out of bounds here, and the caller has to
		// handle that -- but it is at least a number rather than a -1 that
		// would index from the end.
		expect(findOfferIndex([], "anything")).toBe(0);
	});
});

describe("cycling through offers", () => {
	const offers = [
		offer({ id: "a/1" }),
		offer({ id: "b/2" }),
		offer({ id: "c/3" }),
	];

	it("moves forward", () => {
		expect(cycleBoModelOffer(offers, 0, 1).index).toBe(1);
	});

	it("moves backward", () => {
		expect(cycleBoModelOffer(offers, 2, -1).index).toBe(1);
	});

	it("wraps past the end", () => {
		// Driven by an arrow key held down; stopping at the end would make the
		// last offer feel like a dead end.
		expect(cycleBoModelOffer(offers, 2, 1).index).toBe(0);
	});

	it("wraps before the start", () => {
		// The modulo is written to handle a negative intermediate -- a plain
		// `%` on `-1` gives `-1`, which would index from the end and return
		// undefined.
		expect(cycleBoModelOffer(offers, 0, -1).index).toBe(2);
	});

	it("returns the offer it landed on", () => {
		expect(cycleBoModelOffer(offers, 0, 1).offer?.id).toBe("b/2");
	});

	it("returns the offer when wrapping too", () => {
		expect(cycleBoModelOffer(offers, 0, -1).offer?.id).toBe("c/3");
	});

	it("handles an empty catalog without indexing into nothing", () => {
		expect(cycleBoModelOffer([], 0, 1)).toStrictEqual({
			index: 0,
			offer: null,
		});
	});

	it("handles an empty catalog going backwards too", () => {
		expect(cycleBoModelOffer([], 0, -1).offer).toBeNull();
	});

	it("stays put on a single-offer catalog", () => {
		// One offer, and both directions land on it. An off-by-one here would
		// return undefined for the only model available.
		const one = [offer({ id: "only/one" })];
		expect(cycleBoModelOffer(one, 0, 1).offer?.id).toBe("only/one");
		expect(cycleBoModelOffer(one, 0, -1).offer?.id).toBe("only/one");
	});

	it("normalises an index past the end", () => {
		// A stale index from a catalog that shrank. The modulo brings it back
		// into range rather than returning undefined.
		expect(cycleBoModelOffer(offers, 99, 1).offer).not.toBeNull();
	});

	it("cycles all the way round and back to where it started", () => {
		let index = 0;
		for (let step = 0; step < offers.length; step += 1) {
			index = cycleBoModelOffer(offers, index, 1).index;
		}
		expect(index).toBe(0);
	});
});
