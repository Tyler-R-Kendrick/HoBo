import { format, inspect } from "node:util";
import { describe, expect, it } from "vitest";

import { buildLaunch, type Launch } from "../src/launch.js";
import { parsed } from "./fixtures/bindings.js";
import { memoryTrust, SYSTEM } from "./support/trust-fs.js";

const PASSPHRASE = "store-passphrase-for-tests-0123456789";
const OTHER = "listed-value-for-tests-abcdef";

function launch() {
	return buildLaunch({
		bin: "/opt/opensesame/opensesame",
		schemaPath: "/tmp/x/.env.schema",
		argv: ["node", "app.js", "--token=argv-secret-for-tests"],
		bindings: parsed(),
		env: {
			PATH: "/usr/bin",
			OPENSESAME_STORE_PASSWORD: PASSPHRASE,
			HOBO_LISTED: OTHER,
		},
		passEnv: ["OPENSESAME_STORE_PASSWORD", "HOBO_LISTED"],
		nodeVersion: "22.22.0",
		trust: memoryTrust(SYSTEM, { cwd: "/work/checkout" }),
	});
}

/** Every way a caller might log or serialise the value. */
function printed(value: Launch): string[] {
	return [
		inspect(value),
		inspect(value, { depth: null, showHidden: true, getters: true }),
		inspect(value, { compact: false, breakLength: 20 }),
		format("%o", value),
		format("%O", value),
		format("%j", value),
		format("%s", value),
		format("%s", [value]),
		JSON.stringify(value),
		JSON.stringify({ launch: value }, null, 2),
		`${String(value)}`,
	];
}

describe("the Launch value holds the environment for spawn and prints none of it", () => {
	it("is still what spawn needs: the command, the argv and the real environment", () => {
		const run = launch();
		expect(run.command).toBe("/opt/opensesame/opensesame");
		expect(run.args.slice(0, 6)).toEqual([
			"dev",
			"--agent",
			"--schema",
			"/tmp/x/.env.schema",
			"run",
			"--",
		]);
		expect(run.env.OPENSESAME_STORE_PASSWORD).toBe(PASSPHRASE);
		expect(run.env.HOBO_LISTED).toBe(OTHER);
		expect(Object.keys(run)).toEqual(["command", "args", "env"]);
		expect(Object.isFrozen(run)).toBe(true);
	});

	it("prints neither the passphrase nor any other value of the environment, however it is logged", () => {
		for (const text of printed(launch())) {
			expect(text).not.toContain(PASSPHRASE);
			expect(text).not.toContain(OTHER);
		}
	});

	it("nor the command's own arguments, which a caller may have put a token in", () => {
		for (const text of printed(launch())) {
			expect(text).not.toContain("argv-secret-for-tests");
		}
	});

	it("still says which launch it is: the executable, the fixed arguments and the names in the environment", () => {
		const text = inspect(launch());
		expect(text).toContain("/opt/opensesame/opensesame");
		expect(text).toContain("--schema");
		expect(text).toContain("OPENSESAME_STORE_PASSWORD");
		expect(text).toContain("HOBO_LISTED");
		expect(text).toContain("redacted");
	});
});
