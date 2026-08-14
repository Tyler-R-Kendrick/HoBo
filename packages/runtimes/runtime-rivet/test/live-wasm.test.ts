import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("rivetkit wasm live", () => {
	it("imports the wasm runtime package and exposes isolate primitives", async () => {
		const wasm = await import("@rivetkit/rivetkit-wasm");
		expect(typeof wasm.start).toBe("function");
		expect(wasm.ActorContext || wasm.SqliteDb).toBeTruthy();
	});

	it("does not claim Component Model / WIT guest ABI", () => {
		const pkgPath = join(
			dirname(require.resolve("@rivetkit/rivetkit-wasm")),
			"package.json",
		);
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
			description?: string;
			name?: string;
		};
		expect(pkg.name).toBe("@rivetkit/rivetkit-wasm");
		expect(JSON.stringify(pkg).toLowerCase()).not.toMatch(/component model/);
		expect(JSON.stringify(pkg).toLowerCase()).not.toMatch(/\bwit\b/);
	});
});
