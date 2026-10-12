import { describe, expect, it } from "vitest";

import { OpenSesameAdapterError } from "../src/errors.js";
import { buildLaunch, type Launch, type LaunchInput } from "../src/launch.js";
import { parsed, vercelRecord } from "./fixtures/bindings.js";

const DUMMY = "vtok_dummy_marker_0123456789abcdef";
const SURROGATE = `osr_${"0123456789abcdef".repeat(2)}`;

function launchWith(
	env: NodeJS.ProcessEnv,
	more: Partial<LaunchInput> = {},
): ReturnType<typeof buildLaunch> {
	return buildLaunch({
		bin: "/opt/opensesame/opensesame",
		schemaPath: "/tmp/x/.env.schema",
		argv: ["node", "app.js"],
		bindings: parsed(),
		env,
		nodeVersion: "22.22.0",
		exists: () => true,
		...more,
	});
}

function refusal(run: () => Launch): OpenSesameAdapterError | undefined {
	try {
		run();
	} catch (error) {
		if (error instanceof OpenSesameAdapterError) return error;
		throw error;
	}
	return undefined;
}

describe("the environment a run starts from is an allowlist, not the caller's", () => {
	const credentials: NodeJS.ProcessEnv = {
		AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
		AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		AWS_SESSION_TOKEN: "session-looking-value",
		AWS_PROFILE: "prod",
		GITHUB_TOKEN: "ghp_not_a_real_token_0123456789",
		GH_TOKEN: "gho_not_a_real_token_0123456789",
		CLOUDFLARE_API_TOKEN: "cf-not-a-real-token",
		NPM_TOKEN: "npm_not_a_real_token",
		ANTHROPIC_API_KEY: "sk-not-a-real-key",
		DATABASE_URL: "postgres://user:password@db/app",
		HTTPS_PROXY: "http://corp:pw@proxy.example:3128",
		LD_PRELOAD: "/tmp/evil.so",
		DYLD_INSERT_LIBRARIES: "/tmp/evil.dylib",
		OPENSESAME_STORE_PASSWORD: "store-passphrase-for-tests",
		NODE_AUTH_TOKEN: "npm_not_a_real_token",
		HOBO_API_KEY: "hobo-not-a-real-key",
		HOBO_DB_PASSWORD: "not-a-real-password",
		XDG_SECRET_TOKEN: "not-a-real-token",
		LC_PRIVATE_KEY: "not-a-real-key",
	};

	it("drops every credential, whatever its name, unless the caller lists it", () => {
		const { env } = launchWith({ PATH: "/usr/bin", ...credentials });
		for (const name of Object.keys(credentials)) {
			expect(env, name).not.toHaveProperty(name);
		}
		expect(JSON.stringify(env)).not.toContain("not-a-real");
		expect(JSON.stringify(env)).not.toContain("AKIA");
	});

	it("keeps what a command needs to run", () => {
		const kept = {
			PATH: "/usr/bin:/bin",
			HOME: "/home/someone",
			USER: "someone",
			LOGNAME: "someone",
			SHELL: "/bin/sh",
			LANG: "en_US.UTF-8",
			LC_ALL: "C.UTF-8",
			LC_CTYPE: "UTF-8",
			TERM: "xterm-256color",
			TMPDIR: "/tmp",
			TZ: "UTC",
			CI: "true",
			NODE_NO_WARNINGS: "1",
			NODE_OPTIONS: "--no-deprecation",
			XDG_CONFIG_HOME: "/home/someone/.config",
			XDG_RUNTIME_DIR: "/run/user/1000",
			HOBO_REGION: "eu-west-1",
		};
		const { env } = launchWith({ ...kept, ...credentials });
		expect(env).toEqual({
			...kept,
			NODE_USE_ENV_PROXY: "1",
			HOBO_OPENSESAME_CHILD: "1",
		});
	});

	it("passes the env-spec bridge OpenSesame is told to use, because the launch has already checked it exists", () => {
		const { env } = launchWith({
			PATH: "/usr/bin",
			OPENSESAME_ENV_PARSE: "/kit/bridge/parse.mjs",
			OPENSESAME_STORE_DIR: "/somewhere/store",
		});
		expect(env.OPENSESAME_ENV_PARSE).toBe("/kit/bridge/parse.mjs");
		expect(env).not.toHaveProperty("OPENSESAME_STORE_DIR");
	});

	it("keeps the Windows variables only on Windows", () => {
		const win = {
			SYSTEMROOT: "C:\\Windows",
			COMSPEC: "C:\\Windows\\System32\\cmd.exe",
			PATHEXT: ".COM;.EXE",
		};
		expect(launchWith(win, { platform: "win32" }).env).toMatchObject(win);
		const linux = launchWith(win, { platform: "linux" }).env;
		for (const name of Object.keys(win)) expect(linux).not.toHaveProperty(name);
	});

	it("passes a variable the caller names in passEnv, and only that one", () => {
		const { env } = launchWith(
			{
				PATH: "/usr/bin",
				OPENSESAME_STORE_PASSWORD: "store-passphrase-for-tests",
				OPENSESAME_STORE_DIR: "/somewhere/store",
				HOBO_API_KEY: "hobo-not-a-real-key",
				AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			},
			{
				passEnv: [
					"OPENSESAME_STORE_PASSWORD",
					"OPENSESAME_STORE_DIR",
					"HOBO_API_KEY",
					"NOT_SET_HERE",
				],
			},
		);
		expect(env).toMatchObject({
			OPENSESAME_STORE_PASSWORD: "store-passphrase-for-tests",
			OPENSESAME_STORE_DIR: "/somewhere/store",
			HOBO_API_KEY: "hobo-not-a-real-key",
		});
		expect(env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
		expect(env).not.toHaveProperty("NOT_SET_HERE");
	});

	it("refuses a passEnv entry that is not a variable name", () => {
		for (const name of ["", "lower", "A=B", "A B", "A\0B", "1A"]) {
			const error = refusal(() =>
				launchWith({ PATH: "/usr/bin" }, { passEnv: [name] }),
			);
			expect(error?.code, JSON.stringify(name)).toBe("launch_invalid");
		}
	});

	it("the run's own variables win over the caller's, listed or not", () => {
		for (const passEnv of [[], ["NODE_USE_ENV_PROXY"]]) {
			const { env } = launchWith(
				{ PATH: "/usr/bin", NODE_USE_ENV_PROXY: "0" },
				{ passEnv },
			);
			expect(env.NODE_USE_ENV_PROXY, JSON.stringify(passEnv)).toBe("1");
		}
		const { env } = launchWith(
			{ PATH: "/usr/bin", HOBO_OPENSESAME_CHILD: "0" },
			{ passEnv: ["HOBO_OPENSESAME_CHILD"] },
		);
		expect(env.HOBO_OPENSESAME_CHILD).toBe("1");
	});
});

describe("a real credential already in the process refuses the run", () => {
	it("refuses a bound variable that holds something other than a surrogate", () => {
		const error = refusal(() =>
			launchWith({ PATH: "/usr/bin", VERCEL_TOKEN: DUMMY }),
		);
		expect(error?.code).toBe("real_credential_in_env");
		expect(error?.message).toContain("VERCEL_TOKEN");
		expect(error?.message).not.toContain(DUMMY);
	});

	it("refuses the provider's conventional variable when the binding names another", () => {
		for (const name of ["VERCEL_TOKEN", "VERCEL_API_TOKEN"]) {
			const error = refusal(() =>
				launchWith(
					{ PATH: "/usr/bin", [name]: DUMMY },
					{ bindings: parsed(vercelRecord({ env_name: "HOBO_VERCEL" })) },
				),
			);
			expect(error?.code, name).toBe("real_credential_in_env");
			expect(error?.message, name).toContain(name);
			expect(error?.message, name).not.toContain(DUMMY);
		}
	});

	it("refuses it whether or not the caller lists the variable in passEnv", () => {
		const error = refusal(() =>
			launchWith(
				{ PATH: "/usr/bin", VERCEL_API_TOKEN: DUMMY },
				{ passEnv: ["VERCEL_API_TOKEN"] },
			),
		);
		expect(error?.code).toBe("real_credential_in_env");
	});

	it("accepts a surrogate, an empty string and nothing at all", () => {
		for (const value of [SURROGATE, "", undefined]) {
			const error = refusal(() =>
				launchWith({ PATH: "/usr/bin", VERCEL_TOKEN: value }),
			);
			expect(error, JSON.stringify(value)).toBeUndefined();
		}
	});

	it("does not look at a provider no binding uses", () => {
		const error = refusal(() =>
			launchWith({
				PATH: "/usr/bin",
				GITHUB_TOKEN: DUMMY,
				AWS_SECRET_ACCESS_KEY: DUMMY,
			}),
		);
		expect(error).toBeUndefined();
	});
});
