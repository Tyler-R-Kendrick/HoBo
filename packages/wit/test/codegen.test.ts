import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GENERATED_SDK = join(PACKAGE_ROOT, "generated", "sdk.d.ts");

describe("generated hobo:sdk bindings", () => {
	it("checks in jco output for the sdk world", () => {
		expect(existsSync(GENERATED_SDK)).toBe(true);
	});

	it("trivial guest fixture imports generated world types", async () => {
		const guest = await import("../fixtures/trivial-guest.js");
		expect(guest.importedInterfaces).toEqual([
			"workflow",
			"actor",
			"saga",
			"agent",
			"command",
			"subscription",
			"capability",
			"data",
		]);
		expect(guest.buildTrivialGuest({} as never)).toBe("guest-builds");
	});
});
