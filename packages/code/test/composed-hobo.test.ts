import { describe, expect, it } from "vitest";

import {
	explicitHoboBinOverride,
	loadCreateComposedHoboCli,
	loadServeProjectOnLocalYard,
	resolveHoboPackageRoot,
	runComposedHobo,
} from "../src/composed-hobo.js";

describe("composed-hobo in-process bridge", () => {
	it("finds the sibling @hobo/hobo package in this checkout", () => {
		const root = resolveHoboPackageRoot();
		expect(root).toMatch(/packages[/\\]hobo$/u);
	});

	it("ignores empty env overrides so in-process is the default", () => {
		expect(
			explicitHoboBinOverride({
				HOBO_CODE_HOBO_BIN: "",
				HOBO_BIN: "  ",
			}),
		).toBeUndefined();
		expect(
			explicitHoboBinOverride({ HOBO_CODE_HOBO_BIN: "/tmp/stub-hobo" }),
		).toBe("/tmp/stub-hobo");
	});

	it("loads serveProjectOnLocalYard from @hobo/hobo dist", async () => {
		const serve = await loadServeProjectOnLocalYard();
		expect(serve instanceof Function).toBe(true);
	}, 120_000);

	it("loads createComposedHoboCli from @hobo/hobo dist", async () => {
		const create = await loadCreateComposedHoboCli();
		expect(create instanceof Function).toBe(true);
		expect(create().run instanceof Function).toBe(true);
	}, 120_000);

	it("runs --help in-process without PATH hobo", async () => {
		const result = await runComposedHobo(["--help"], {
			env: { ...process.env, PATH: "/no/such/bin" },
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout + result.stderr).toMatch(/hobo/i);
	}, 120_000);
});
