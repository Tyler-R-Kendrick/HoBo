/**
 * The evidence overlay discovers a running hobo-code session's controls url
 * under `$HOBO_HOME/runtime/code`, from the home the env a caller passes names,
 * and from that env only. A caller passing `env: {}` named no home, so this
 * process's own home (and whatever session it holds) is not read, as on main.
 *
 * Each case runs in a child process whose HOME is a fixture account home:
 * `os.homedir()` reads the process's C environment, which a test worker's
 * `process.env` does not reach.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SOURCE = fileURLToPath(
	new URL("../src/servable-entrypoints.ts", import.meta.url),
);
const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const CONTROLS = "https://controls.example/evidence";

const scratch = mkdtempSync(join(tmpdir(), "hobo-overlay-home-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** A home whose hobo-code session left its controls url, as a session does. */
const account = join(scratch, "account");
mkdirSync(join(account, ".hobo", "runtime", "code"), { recursive: true });
writeFileSync(
	join(account, ".hobo", "runtime", "code", "evidence-controls-url"),
	`${CONTROLS}\n`,
);

/** The envs each case serves with. */
const ENVS = {
	none: {},
	home: { HOME: account },
	hoboHome: { HOBO_HOME: join(account, ".hobo") },
} as const;

/**
 * The overlay header an HTML response gets when served with each of `ENVS`,
 * all from one child process whose HOME is `account` (one compile of the
 * module, not three).
 */
function overlays(): Readonly<Record<keyof typeof ENVS, string>> {
	const script = `
const { listServableEntrypoints } = await import(${JSON.stringify(SOURCE)});
const page = () => async () =>
	new Response("<html><body>x</body></html>", {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
const definition = {
	resources: { site: { kind: "web", annotations: [] } },
	entrypoint: (name) => (name === "site" ? page : undefined),
};
const seen = {};
for (const [label, env] of Object.entries(JSON.parse(process.argv[1]))) {
	const [entry] = listServableEntrypoints(definition, { env });
	const response = await entry.handler(new Request("https://app.example/"));
	seen[label] = response.headers.get("x-hobo-evidence-overlay") ?? "none";
}
process.stdout.write(JSON.stringify(seen));
`;
	const childEnv = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => key !== "HOBO_HOME"),
	);
	const run = spawnSync(
		process.execPath,
		[
			"--import",
			"tsx",
			"--input-type=module",
			"-e",
			script,
			JSON.stringify(ENVS),
		],
		{ cwd: PACKAGE, env: { ...childEnv, HOME: account }, encoding: "utf8" },
	);
	if (run.status !== 0) throw new Error(run.stderr);
	return JSON.parse(run.stdout);
}

describe("evidence overlay discovery", () => {
	it("reads nothing when the given env names no home, and the named home's session otherwise", () => {
		const seen = overlays();
		expect(seen.none).toBe("none");
		expect(seen.home).not.toBe("none");
		expect(seen.hoboHome).not.toBe("none");
	});
});
