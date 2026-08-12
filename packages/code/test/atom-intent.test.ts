import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	emitFromAtoms,
	matchClosedIntent,
	retrieveAtoms,
} from "../src/atom-index.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("closed intent map", () => {
	it("maps deploy to azure without embedding", () => {
		const mapped = matchClosedIntent("please deploy this to azure");
		expect(mapped?.id).toBe("deploy.azure");
		const hit = retrieveAtoms("deploy to azure");
		expect(hit.ok).toBe(true);
		expect(hit.composition?.id).toBe("deploy.azure");
		expect(hit.score).toBe(1);
		expect(hit.atoms.map((atom) => atom.id)).toContain("yard.azure");
	});

	it("maps bundle apps in the same network to one Yard two Camps", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-net-"));
		roots.push(out);
		const result = emitFromAtoms({
			intent: "bundle apps in the same network",
			outputDir: out,
			params: { name: "shop" },
		});
		expect(result.ok).toBe(true);
		expect(result.compositionId).toBe("network.colocate");
		const yard = readFileSync(join(out, "src", "yard.ts"), "utf8");
		expect(yard).toContain('camp("web")');
		expect(yard).toContain('camp("api")');
		expect(yard).toContain('"shared"');
	});

	it("emits a trainable hole for implementation specifics", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-train-"));
		roots.push(out);
		const result = emitFromAtoms({
			intent: "trainable hello",
			outputDir: out,
			params: { name: "greeter" },
		});
		expect(result.ok).toBe(true);
		expect(result.holes).toContain("greet");
		expect(readFileSync(join(out, "src", "api.ts"), "utf8")).toContain(
			'"use training"',
		);
	});
});
