import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { SURROGATE_PATTERN } from "@hobo/adapter-opensesame";
import type { EventStore } from "@hobo/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultYardRuntime, selectIacProvider } from "../src/compose.js";
import {
	CREDENTIAL_BINDINGS_FILE,
	OPENSESAME_PASS_ENV,
	OpenSesameCredentialsError,
	type RelaunchInput,
	relaunchUnderOpenSesame,
	reportingCredentialRefusals,
	requireOpenSesameSurrogate,
	wantsOpenSesameRelaunch,
} from "../src/credentials-opensesame.js";
import { isJsonObject, isJsonString, parseJsonValue } from "../src/json.js";
import type { VercelFetch } from "../src/vercel-client.js";

// HOBO_CREDENTIALS=opensesame (ADR-0170): the composed hobo relaunches itself
// once under `opensesame dev --agent run` and exits as the run did, and
// selectIacProvider refuses anything but a surrogate. OpenSesame is played by
// @hobo/adapter-opensesame's stand-in, the one its real lane holds to the real
// binary (scenario per FAKE_OPENSESAME_SCENARIO); the command it runs is
// fixtures/opensesame-child.mts, which records the environment it was given.

const FAKE_OPENSESAME = fileURLToPath(
	new URL(
		"../../adapters/adapter-opensesame/test/fixtures/fake-opensesame.mts",
		import.meta.url,
	),
);
const CHILD = fileURLToPath(
	new URL("./fixtures/opensesame-child.mts", import.meta.url),
);
const SURROGATE = new RegExp(SURROGATE_PATTERN, "u");
// Each relaunch starts the stand-in, its `--version` probe and the command: a few
// processes, which the default 10 s does not always cover beside a full suite.
const RUN_TIMEOUT_MS = 60_000;

const BINDINGS = {
	bindings: [
		{
			locator: "hobo-token://vercel/deploy",
			connection: "conn://acme/vercel",
			provider: "vercel",
			env_name: "VERCEL_TOKEN",
			paths: ["/v9/projects", "/v13/deployments"],
			methods: ["GET", "POST"],
			projection: "legacy-token",
		},
	],
};

let work = "";
beforeEach(() => {
	work = mkdtempSync(join(tmpdir(), "hobo-opensesame-relaunch-"));
	writeFileSync(join(work, CREDENTIAL_BINDINGS_FILE), JSON.stringify(BINDINGS));
});
afterEach(() => {
	rmSync(work, { recursive: true, force: true });
});

interface Relaunched {
	readonly status: number;
	readonly stderr: string;
	/** What the stand-in recorded when it was started; absent when it was not. */
	readonly started: boolean;
	/** The environment the relaunched command was given. */
	readonly childEnv: Record<string, string>;
}

function readEnv(path: string) {
	if (!existsSync(path)) return {};
	const parsed = parseJsonValue(readFileSync(path, "utf8"));
	const env = isJsonObject(parsed) ? parsed.env : undefined;
	const out: Record<string, string> = {};
	if (isJsonObject(env)) {
		for (const [key, value] of Object.entries(env)) {
			if (isJsonString(value)) out[key] = value;
		}
	}
	return out;
}

async function relaunch(
	scenario: string,
	childStatus = "0",
	env: Record<string, string> = {},
): Promise<Relaunched> {
	const record = join(work, "opensesame-record.json");
	const childOut = join(work, "child-env.json");
	rmSync(record, { force: true });
	rmSync(childOut, { force: true });
	const sink = new PassThrough();
	const seen: string[] = [];
	sink.on("data", (chunk) => seen.push(String(chunk)));
	const input: RelaunchInput = {
		argv: [process.execPath, CHILD, childOut, childStatus],
		env: {
			PATH: process.env.PATH ?? "",
			NODE_NO_WARNINGS: "1",
			HOBO_CREDENTIALS: "opensesame",
			FAKE_OPENSESAME_RECORD: record,
			FAKE_OPENSESAME_SCENARIO: scenario,
			...env,
		},
		cwd: work,
		bin: FAKE_OPENSESAME,
		// What hobo's bin passes, and the stand-in's own knobs.
		passEnv: [
			...OPENSESAME_PASS_ENV,
			"FAKE_OPENSESAME_RECORD",
			"FAKE_OPENSESAME_SCENARIO",
		],
		stderr: sink,
		tmpRoot: work,
	};
	const status = await relaunchUnderOpenSesame(input);
	return {
		status,
		stderr: seen.join(""),
		started: existsSync(record),
		childEnv: readEnv(childOut),
	};
}

// Selection-only: constructing a provider touches neither the store nor the network.
const selectionDeps = {
	// SAFETY: assertion required at this I/O or test boundary.
	store: {} as EventStore,
	providers: [],
};

function countingFetch() {
	let calls = 0;
	const fetch: VercelFetch = async () => {
		calls += 1;
		throw new Error("no request may be made in this test");
	};
	return { fetch, calls: () => calls };
}

describe("HOBO_CREDENTIALS=opensesame relaunch", () => {
	it(
		"relaunches once and not twice",
		async () => {
			const first = await relaunch("surrogate-delivered");
			expect(first.status).toBe(0);
			expect(first.started).toBe(true);
			const record = parseJsonValue(
				readFileSync(join(work, "opensesame-record.json"), "utf8"),
			);
			const argv = isJsonObject(record) ? record.argv : undefined;
			expect(argv).toEqual([
				"dev",
				"--agent",
				"--schema",
				expect.stringMatching(/\/\.env\.schema$/u),
				"run",
				"--",
				process.execPath,
				CHILD,
				join(work, "child-env.json"),
				"0",
			]);
			const child = first.childEnv;
			expect(child.HOBO_OPENSESAME_CHILD).toBe("1");
			expect(child.HOBO_CREDENTIALS).toBe("opensesame");
			expect(child.NODE_USE_ENV_PROXY).toBe("1");
			expect(child.VERCEL_TOKEN).toMatch(SURROGATE);
			// The child composes instead of relaunching, and its surrogate passes the guard.
			expect(wantsOpenSesameRelaunch(child)).toBe(false);
			expect(() => requireOpenSesameSurrogate(child)).not.toThrow();

			// Asked to relaunch from inside the run, it refuses and starts nothing.
			const second = await relaunch("surrogate-delivered", "0", {
				HOBO_OPENSESAME_CHILD: "1",
			});
			expect(second.status).toBe(1);
			expect(second.started).toBe(false);
			expect(second.stderr).toMatch(/^hobo: recursion_guard: /mu);
		},
		RUN_TIMEOUT_MS,
	);

	it("relaunches only when HOBO_CREDENTIALS is opensesame", () => {
		expect(wantsOpenSesameRelaunch({})).toBe(false);
		expect(wantsOpenSesameRelaunch({ HOBO_CREDENTIALS: "env" })).toBe(false);
		expect(wantsOpenSesameRelaunch({ HOBO_CREDENTIALS: "opensesame" })).toBe(
			true,
		);
	});

	describe("exit codes pass through (77, 143)", () => {
		it(
			"a tripwire's 77",
			async () => {
				const tripwire = await relaunch("misdirected");
				expect(tripwire.status).toBe(77);
				expect(tripwire.stderr).toMatch(/^hobo: tripwire_misdirected: /mu);
			},
			RUN_TIMEOUT_MS,
		);

		it(
			"a SIGTERM's 143",
			async () => {
				const signalled = await relaunch("sigterm");
				expect(signalled.status).toBe(143);
				expect(signalled.stderr).toMatch(/^hobo: signalled: /mu);
			},
			RUN_TIMEOUT_MS,
		);

		it(
			"the command's own failing status, not re-reported",
			async () => {
				const failed = await relaunch("surrogate-delivered", "3");
				expect(failed.status).toBe(3);
				expect(failed.stderr).not.toMatch(/^hobo: /mu);
			},
			RUN_TIMEOUT_MS,
		);
	});

	it(
		"a run that left a placeholder exits 1, and the placeholder never deploys",
		async () => {
			const absent = await relaunch("plugin-absent");
			expect(absent.status).toBe(1);
			expect(absent.stderr).toMatch(/^hobo: placeholders_only: /mu);
			expect(absent.childEnv.VERCEL_TOKEN).toMatch(/^ostest_/u);

			const { fetch, calls } = countingFetch();
			expect(() =>
				selectIacProvider({
					...selectionDeps,
					env: absent.childEnv,
					vercelFetch: fetch,
				}),
			).toThrow(OpenSesameCredentialsError);
			expect(calls()).toBe(0);
		},
		RUN_TIMEOUT_MS,
	);

	it(
		"without hobo.credentials.json nothing is started",
		async () => {
			rmSync(join(work, CREDENTIAL_BINDINGS_FILE));
			const run = await relaunch("surrogate-delivered");
			expect(run.status).toBe(1);
			expect(run.started).toBe(false);
			expect(run.stderr).toMatch(/^hobo: OPENSESAME_BINDINGS_UNREADABLE: /mu);
		},
		RUN_TIMEOUT_MS,
	);
});

describe("selectIacProvider under HOBO_CREDENTIALS=opensesame", () => {
	const placeholder = "ostest_0123456789abcdef";
	const plainToken = "vtok_plain_token_exported_by_hand";

	it("refuses a placeholder token before any request", () => {
		for (const VERCEL_TOKEN of [placeholder, plainToken, "", undefined]) {
			for (const resolvers of [undefined, "1"]) {
				const { fetch, calls } = countingFetch();
				let refusal: unknown;
				try {
					selectIacProvider({
						...selectionDeps,
						env: {
							HOBO_CREDENTIALS: "opensesame",
							VERCEL_TOKEN,
							HOBO_DEPLOY_RESOLVERS: resolvers,
						},
						vercelFetch: fetch,
					});
				} catch (error) {
					refusal = error;
				}
				expect(refusal).toBeInstanceOf(OpenSesameCredentialsError);
				if (refusal instanceof OpenSesameCredentialsError) {
					expect(refusal.code).toBe("OPENSESAME_PLACEHOLDERS_ONLY");
					if (VERCEL_TOKEN) expect(refusal.message).not.toContain(VERCEL_TOKEN);
				}
				expect(calls()).toBe(0);
			}
		}
	});

	it("a proxied run's command refuses a placeholder even without HOBO_CREDENTIALS", () => {
		const { fetch, calls } = countingFetch();
		expect(() =>
			selectIacProvider({
				...selectionDeps,
				env: { HOBO_OPENSESAME_CHILD: "1", VERCEL_TOKEN: placeholder },
				vercelFetch: fetch,
			}),
		).toThrow(/OpenSesame surrogate/u);
		expect(calls()).toBe(0);
	});

	it("deploys on a surrogate", () => {
		const provider = selectIacProvider({
			...selectionDeps,
			env: {
				HOBO_CREDENTIALS: "opensesame",
				VERCEL_TOKEN: `osr_${"0123456789abcdef".repeat(2)}`,
			},
			vercelFetch: countingFetch().fetch,
		});
		expect(provider.id).toMatch(/^vercel-deploy:/u);
	});

	it("selectIacProvider is unchanged when HOBO_CREDENTIALS is unset", () => {
		const { fetch } = countingFetch();
		for (const env of [{}, { HOBO_CREDENTIALS: "env" }]) {
			expect(
				selectIacProvider({
					...selectionDeps,
					env: { ...env, VERCEL_TOKEN: placeholder },
					vercelFetch: fetch,
				}).id,
			).toMatch(/^vercel-deploy:/u);
			expect(selectIacProvider({ ...selectionDeps, env }).id).toMatch(
				/^pulumi-backed:/u,
			);
		}
	});
});

describe("the composed hobo under a placeholder", () => {
	const env = {
		HOBO_CREDENTIALS: "opensesame",
		VERCEL_TOKEN: "ostest_0123456789abcdef",
	};

	it("is refused when the runtime is composed, before any verb runs", () => {
		expect(() =>
			createDefaultYardRuntime({ dataDir: join(work, "yard"), env }),
		).toThrow(OpenSesameCredentialsError);
	});

	it("reports the refusal as one hobo: line and status 1", async () => {
		const sink = new PassThrough();
		const seen: string[] = [];
		sink.on("data", (chunk) => seen.push(String(chunk)));
		const status = await reportingCredentialRefusals(async () => {
			createDefaultYardRuntime({ dataDir: join(work, "yard"), env });
			return 0;
		}, sink);
		expect(status).toBe(1);
		expect(seen.join("")).toMatch(
			/^hobo: OPENSESAME_PLACEHOLDERS_ONLY: .*\n$/u,
		);
		expect(seen.join("")).not.toContain(env.VERCEL_TOKEN);
	});

	it("passes the CLI's own status through and rethrows anything else", async () => {
		expect(await reportingCredentialRefusals(async () => 4)).toBe(4);
		await expect(
			reportingCredentialRefusals(async () => {
				throw new Error("not a credential refusal");
			}),
		).rejects.toThrow("not a credential refusal");
	});
});
