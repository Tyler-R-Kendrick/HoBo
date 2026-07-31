import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	hermeticEnvSummary,
	inspectHermeticEnv,
} from "../src/hermetic-env.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("inspectHermeticEnv", () => {
	it("reports host-default when no nix/devenv markers", () => {
		const root = temp("he-host-");
		const home = temp("he-home-");
		const r = inspectHermeticEnv({
			projectRoot: root,
			hoboHome: home,
			env: {},
		});
		expect(r.hermeticDeclared).toBe(false);
		expect(r.hermeticActive).toBe(false);
		expect(r.fidelity).toBe("host-default");
		expect(r.layout.pureSeparation).toBe(true);
		expect(hermeticEnvSummary(r)).toBe("hermetic·host");
	});

	it("detects devenv.nix as declared hermetic", () => {
		const root = temp("he-dev-");
		const home = temp("he-home2-");
		writeFileSync(join(root, "devenv.nix"), "{ ... }: {}\n");
		const r = inspectHermeticEnv({
			projectRoot: root,
			hoboHome: home,
			env: {},
		});
		expect(r.markers).toContain("devenv.nix");
		expect(r.hermeticDeclared).toBe(true);
		expect(r.fidelity).toBe("hermetic-declared");
		expect(r.recommendations.some((x) => /devenv shell/i.test(x))).toBe(
			true,
		);
	});

	it("detects active nix shell via env without requiring files", () => {
		const root = temp("he-nix-");
		const home = temp("he-home3-");
		const r = inspectHermeticEnv({
			projectRoot: root,
			hoboHome: home,
			env: { IN_NIX_SHELL: "impure", DEVENV_ROOT: "/tmp/devenv" },
		});
		expect(r.hermeticActive).toBe(true);
		expect(r.fidelity).toBe("hermetic-active");
		expect(hermeticEnvSummary(r)).toMatch(/hermetic·on/);
	});
});
