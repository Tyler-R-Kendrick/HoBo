import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	CANONICAL_VERBS,
	createHoboCli,
	helpText,
	runHobo,
} from "../src/index.js";

const canonicalVerbNames = [
	"up",
	"down",
	"dev",
	"new",
	"login",
	"connection",
	"identity",
	"access",
	"claim",
	"plan",
	"verify",
	"can-deploy",
	"inspect",
	"logs",
	"doctor",
	"codegen",
	"build",
	"collect",
	"stub",
	"drift",
	"add",
	"registry",
	"import",
	"generate",
	"sandbox",
	"test",
	"attest",
	"erase",
	"broker",
	"yard",
	"station",
	"derivative",
	"runbook",
];

const globalFlags = [
	"--json",
	"--camp <camp>",
	"--cwd <path>",
	"--verbose",
	"-q",
	"--help",
];

const goldenHelp = `HoBo CLI

Usage:
  hobo [global flags] <verb> [args]
  hobo --help
  hobo <verb> --help

Global flags:
  --json          Emit a machine-readable JSON envelope on stdout
  --camp <camp>   Select the target Camp
  --cwd <path>    Resolve the HoBo project from this directory
  --verbose       Print detailed diagnostics on stderr
  -q              Suppress non-error human output
  --help          Show help

Canonical verbs:
  up          lifecycle     Realize the current object graph
  down        lifecycle     Tear down what up realized
  dev         local loop    Run against runtime-local
  new         local loop    Scaffold a runnable SDK program
  login       identity      Obtain a dev SVID through OIDC
  connection  identity      Manage durable Connections (create/authorize/list/get/revoke/rotate)
  identity    identity      Observe continuous identity migration status (status/inspect; zero Bindle config)
  access      identity      Request elevated/cross-env access or break-glass (short-lived capability; audited)
  claim       identity      Bind an anonymous deployment to an account
  plan        read-only     Dry-run the up decision
  verify      read-only     Run the unified Gatekeeper preflight
  can-deploy  read-only     Diagnose producer/consumer compatibility
  inspect     read-only     Render projections and time-travel views
  logs        read-only     Live-tail Camp runtime streams
  doctor      diagnostics   Report environment and portability hazards
  codegen     authoring     Regenerate checked-in generated clients
  build       authoring     Compile services to wasm components
  collect     authoring     Run resource collection and print manifest IR
  stub        authoring     Run with a contract-backed stub
  drift       diagnostics   Report drift and governed remediation paths
  add         distribution  Install a provider or listing
  registry    distribution  Administer registry artifacts
  import      migration     Adopt existing estate in place
  generate    generation    Request provider generation
  sandbox     test loop     Run a contract-backed isolated lane
  test        test loop     Alias for the sandbox test lane
  attest      governance    Produce signed external evidence exports
  erase       governance    Request crypto-shred erasure
  broker      governance    Resolve placements through the broker (the Conductor)
  yard        control plane Install and inspect the default bare-metal Yard
  station     control plane Station occupancy setup/ops (init/up/status/rails); not a lifecycle verb
  derivative  extensibility Manage derived HoBo implementations
  runbook     SRE           Execute or replay incident runbooks
`;

async function withBindle(callback: (cwd: string) => Promise<void>) {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-cli-shell-"));
	await writeFile(
		path.join(dir, "hobo.bindle.json"),
		JSON.stringify({ name: "snapshop" }),
	);
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function withEmptyDir(callback: (cwd: string) => Promise<void>) {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-cli-empty-"));
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("HoBo CLI shell", () => {
	it("pins hobo --help to the canonical HOBO-8 verbs and global flags", async () => {
		expect(CANONICAL_VERBS.map((verb) => verb.name)).toEqual(
			canonicalVerbNames,
		);

		const result = await runHobo(["--help"], { cwd: process.cwd() });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(goldenHelp);
		expect(result.stderr).toBe("");
		expect(helpText()).toBe(goldenHelp);

		const verbHelp = await runHobo(["plan", "--help"], { cwd: process.cwd() });
		expect(verbHelp.exitCode).toBe(0);
		expect(verbHelp.stdout).toMatch(
			/Usage:\n {2}hobo plan \[global flags\] \[args\]/,
		);
		expect(verbHelp.stdout).toMatch(/Status: not yet implemented/);

		for (const flag of globalFlags) {
			expect(result.stdout).toMatch(new RegExp(flag.replace(/[<>]/g, "\\$&")));
		}
		for (const retired of [
			"deploy",
			"destroy",
			"teardown",
			"rollback",
			"promote",
			"forge",
			"train",
			"crew",
			"fleet",
		]) {
			expect(result.stdout).not.toMatch(new RegExp(`^  ${retired}\\s`, "m"));
		}
	});

	it("emits a well-formed JSON stub envelope for hobo plan --json", async () => {
		await withBindle(async (cwd) => {
			const result = await runHobo(["plan", "--json"], { cwd });

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).not.toMatch(/not yet implemented\nUsage:/);

			const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
			expect(envelope.ok).toBe(true);
			expect(envelope.verb).toBe("plan");
			expect(envelope.status).toBe("not_implemented");
			expect(envelope.code).toBe("HOBO_CLI_STUB");
			expect(envelope.message).toBe("plan is not yet implemented");
			expect((envelope.context as { cwd: string }).cwd).toBe(cwd);
			expect((envelope.context as { projectDir: string }).projectDir).toBe(cwd);
		});
	});

	it("rejects unknown verbs and flags without guessing silently", async () => {
		await withBindle(async (cwd) => {
			const typo = await runHobo(["plann"], { cwd });
			expect(typo.exitCode).toBe(2);
			expect(typo.stdout).toBe("");
			expect(typo.stderr).toMatch(/Unknown verb "plann"/);
			expect(typo.stderr).toMatch(/Did you mean "plan"\?/);

			const flag = await runHobo(["plan", "--wat"], { cwd });
			expect(flag.exitCode).toBe(2);
			expect(flag.stdout).toBe("");
			expect(flag.stderr).toMatch(/Unknown option "--wat"/);
			expect(flag.stderr).toMatch(/Run "hobo plan --help"/);
		});
	});

	it("emits JSON failure envelope with remediation for usage errors", async () => {
		await withBindle(async (cwd) => {
			const result = await runHobo(["plann", "--json"], { cwd });
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toBe("");

			const envelope = JSON.parse(result.stdout) as {
				ok: boolean;
				code: string;
				remediation: string[];
			};
			expect(envelope.ok).toBe(false);
			expect(envelope.code).toMatch(/^HOBO_/);
			expect(envelope.remediation.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("keeps JSON stdout and human output separate", async () => {
		await withBindle(async (cwd) => {
			const json = await runHobo(["plan", "--json"], { cwd });
			expect(json.stderr).toBe("");
			expect(() => JSON.parse(json.stdout)).not.toThrow();
			expect(json.stdout).not.toMatch(/^Command\s+Status/m);

			const human = await runHobo(["plan"], { cwd });
			expect(human.exitCode).toBe(0);
			expect(human.stderr).toBe("");
			expect(human.stdout).toMatch(/^Command\s+Status/m);
			expect(() => JSON.parse(human.stdout)).toThrow();
		});
	});

	it("fails outside a HoBo project with a clear no-Bindle error", async () => {
		await withEmptyDir(async (cwd) => {
			const result = await runHobo(["plan"], { cwd });

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toMatch(/No Bindle here/);
			expect(result.stderr).toMatch(/Run from a HoBo project or pass --cwd/);
		});
	});

	it("rejects conflicting lifecycle flags at parse time", async () => {
		await withBindle(async (cwd) => {
			const result = await runHobo(["up", "--to", "rev-123", "--rollback"], {
				cwd,
			});

			expect(result.exitCode).toBe(2);
			expect(result.stdout).toBe("");
			expect(result.stderr).toMatch(/--to cannot be combined with --rollback/);
		});
	});

	it("constructs command context once and injects it into dispatch", async () => {
		await withBindle(async (cwd) => {
			let contextBuilds = 0;
			let injectedContext: { buildId: string } | undefined;
			const cli = createHoboCli({
				contextFactory: async (request) => {
					contextBuilds += 1;
					return {
						cwd: request.cwd,
						projectDir: request.cwd,
						identity: "user:dev",
						clients: { readApi: "fake-read-api", runtime: "fake-runtime" },
						buildId: `ctx-${contextBuilds}`,
					};
				},
				commands: {
					plan: {
						run: async ({ context }) => {
							injectedContext = context as { buildId: string };
							return {
								ok: true,
								status: "not_implemented",
								code: "HOBO_CLI_STUB",
								message: "plan is not yet implemented",
								data: {
									contextBuildId: (context as { buildId: string }).buildId,
								},
							};
						},
					},
				},
			});

			const result = await cli.run(["plan", "--json"], { cwd });
			const envelope = JSON.parse(result.stdout) as {
				data: { contextBuildId: string };
			};

			expect(result.exitCode).toBe(0);
			expect(contextBuilds).toBe(1);
			expect(injectedContext?.buildId).toBe("ctx-1");
			expect(envelope.data.contextBuildId).toBe("ctx-1");
		});
	});
});
