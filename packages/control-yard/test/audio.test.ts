import { describe, expect, it } from "vitest";

import { createYardAudio, cueForFx, loadAssetIndex } from "../src/index.js";

function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		read: () => Object.fromEntries(map),
	};
}

describe("audio cue mapping", () => {
	it("maps recorded fx labels to cues, and stays silent for the rest", () => {
		expect(cueForFx("stamp:connection.authorize")).toBe("stamp");
		expect(cueForFx("spike:doctor.fix:0")).toBe("spike");
		expect(cueForFx("highball")).toBe("whistle");
		expect(cueForFx("derail")).toBe("derail");
		expect(cueForFx("needs-reauth")).toBe("steam");
		expect(cueForFx("tick")).toBe("telegraph");
		// Speech and arbitrary status text must not make noise.
		expect(cueForFx("Station open.")).toBeNull();
		expect(cueForFx("Rail activated.")).toBeNull();
	});
});

describe("audio player rules", () => {
	const index = loadAssetIndex();

	it("every manifest audio clip has a cue mapping and vice versa", () => {
		const ids = Object.keys(index.audio ?? {}).sort();
		expect(ids).toEqual([
			"derail",
			"spike",
			"stamp",
			"steam",
			"telegraph",
			"whistle",
		]);
		for (const id of ids) {
			// Each clip is reachable from some fx label.
			const reachable = [
				"stamp:x",
				"spike:x",
				"highball",
				"derail",
				"needs-reauth",
				"tick",
			].some((fx) => cueForFx(fx) === id);
			expect(reachable, id).toBe(true);
		}
	});

	it("defaults to muted — an ops room is shared, so sound is opt-in", () => {
		const audio = createYardAudio({
			index,
			assetBaseUrl: "/assets",
			enabled: false,
			storage: memoryStorage(),
		});
		expect(audio.muted()).toBe(true);
	});

	it("persists an explicit unmute", () => {
		const store = memoryStorage();
		const audio = createYardAudio({
			index,
			assetBaseUrl: "/assets",
			enabled: false,
			storage: store,
		});
		audio.setMuted(false);
		expect(store.read()["hobo-yard-muted"]).toBe("0");
		const reopened = createYardAudio({
			index,
			assetBaseUrl: "/assets",
			enabled: false,
			storage: store,
		});
		expect(reopened.muted()).toBe(false);
	});

	it("never plays before a gesture unlock, and never throws when disabled", () => {
		const audio = createYardAudio({
			index,
			assetBaseUrl: "/assets",
			enabled: false,
			storage: memoryStorage({ "hobo-yard-muted": "0" }),
		});
		expect(audio.muted()).toBe(false);
		// No AudioContext exists in the test env; these must be safe no-ops.
		expect(() => audio.play("whistle")).not.toThrow();
		expect(() => audio.unlock()).not.toThrow();
		expect(audio.ready).toBe(false);
	});
});
