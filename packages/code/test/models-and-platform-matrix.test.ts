/**
 * Which model is in play, and which provider keys are present.
 *
 * `hobo-code models` answers "what will my next prompt run against, and can it
 * run at all?" — and it answers it in the same place every other inventory
 * does: terminal output that ends up in bug reports. So the rule is the one
 * the module states in its own header, and it is the reason this file exists:
 *
 * **Never print a secret value — only the env name and whether it is set.**
 * Eight provider keys are recognised, and each is reported as a name plus a
 * boolean. Printing even a prefix would leak the issuer and shape of a live
 * credential in exchange for nothing a boolean does not already say.
 *
 * Two more decisions carry weight:
 *
 * **`HOBO_CODE_MODEL` beats the default, and the source is reported.** A user
 * debugging an unexpected answer needs to know whether they are on their own
 * override or the shipped default — the model id alone cannot tell them, and
 * "I thought I set that" is the whole failure mode.
 *
 * **`HOBO_CODE_MODEL` does not count as BYOK.** It names a model; it is not a
 * credential. Counting it would report "you have a key" to someone who has
 * only chosen a provider, and send them looking for a billing problem when the
 * real answer is that they never exported one.
 *
 * The platform matrix beside it makes a different promise: **worktree is
 * always available.** Rift is a copy-on-write optimisation, and every row
 * falls back to a classical git worktree — including CI, deliberately, because
 * a determinism guarantee is worth more there than a fast checkout.
 */
import { describe, expect, it } from "vitest";

import {
	BYOK_ENV_NAMES,
	CODE_MODELS_SCHEMA,
	inspectModels,
	modelsHumanSummary,
} from "../src/models.js";
import {
	ISOLATION_PLATFORM_MATRIX,
	matrixForPlatform,
} from "../src/platform-matrix.js";

const inspect = (env: NodeJS.ProcessEnv = {}) => inspectModels(env);

const byokFor = (env: NodeJS.ProcessEnv, name: string) =>
	inspect(env).byok.find((entry) => entry.name === name);

describe("secrets", () => {
	for (const name of BYOK_ENV_NAMES.filter((n) => n !== "HOBO_CODE_MODEL")) {
		it(`never prints the value of ${name}`, () => {
			// Printing even a prefix leaks the issuer and shape of a live
			// credential in exchange for nothing a boolean does not already say.
			const secret = "sk-live-0123456789abcdefghijklmnop";
			expect(JSON.stringify(inspect({ [name]: secret }))).not.toContain(secret);
		});
	}

	it("keeps a key out of the human summary too", () => {
		// The summary is the output people actually paste.
		const secret = "sk-live-0123456789abcdefghijklmnop";
		expect(
			modelsHumanSummary(inspect({ OPENAI_API_KEY: secret })),
		).not.toContain(secret);
	});

	it("reports presence as a plain boolean", () => {
		expect(
			byokFor({ OPENAI_API_KEY: "sk-live-abc" }, "OPENAI_API_KEY"),
		).toStrictEqual({ name: "OPENAI_API_KEY", present: true });
	});

	it("says so in its notes", () => {
		// The promise is part of the output, so a reader can rely on it without
		// reading the source.
		expect(inspect().notes.join(" ")).toMatch(/value never shown/i);
	});
});

describe("provider keys", () => {
	it("reports every recognised key whether set or not", () => {
		// An inventory listing only what is set cannot tell "not configured"
		// from "not supported", which is the question a reader has.
		expect(inspect().byok.map((entry) => entry.name)).toStrictEqual([
			...BYOK_ENV_NAMES,
		]);
	});

	it("reports an unset key as absent", () => {
		expect(byokFor({}, "OPENAI_API_KEY")?.present).toBe(false);
	});

	it("treats an empty key as unset", () => {
		// An exported-but-empty variable is the shell saying nothing; reporting
		// it present would send someone hunting a billing problem that is
		// really a missing export.
		expect(byokFor({ OPENAI_API_KEY: "" }, "OPENAI_API_KEY")?.present).toBe(
			false,
		);
	});

	it("reports no BYOK when nothing is exported", () => {
		expect(inspect().byokAny).toBe(false);
	});

	it("reports BYOK once any provider key is exported", () => {
		expect(inspect({ ANTHROPIC_API_KEY: "sk-ant" }).byokAny).toBe(true);
	});

	for (const name of BYOK_ENV_NAMES.filter((n) => n !== "HOBO_CODE_MODEL")) {
		it(`counts ${name} toward BYOK`, () => {
			// Eight providers, each its own route to a working model. Missing one
			// would report "no key" to someone who is fully configured.
			expect(inspect({ [name]: "key" }).byokAny).toBe(true);
		});
	}

	it("does not count HOBO_CODE_MODEL as a key", () => {
		// It names a model; it is not a credential. Counting it would report
		// "you have a key" to someone who has only chosen a provider.
		expect(
			inspect({ HOBO_CODE_MODEL: "anthropic/claude-sonnet-5" }).byokAny,
		).toBe(false);
	});

	it("still lists HOBO_CODE_MODEL among the recognised names", () => {
		// It belongs in the inventory — it is just not a key. Omitting it would
		// hide the one variable most likely to explain an unexpected model.
		expect(byokFor({ HOBO_CODE_MODEL: "x" }, "HOBO_CODE_MODEL")?.present).toBe(
			true,
		);
	});
});

describe("the active model", () => {
	it("falls back to the shipped default", () => {
		expect(inspect().source).toBe("default");
	});

	it("names a model even with nothing configured", () => {
		// "no model" is not an answer a user can act on; the default is what
		// actually runs.
		expect(inspect().activeModel.length).toBeGreaterThan(0);
	});

	it("takes an explicit override", () => {
		expect(inspect({ HOBO_CODE_MODEL: "openai/gpt-4.1" }).activeModel).toBe(
			"openai/gpt-4.1",
		);
	});

	it("reports the override as the source", () => {
		// A user debugging an unexpected answer needs to know whether they are
		// on their own setting or the default — "I thought I set that" is the
		// whole failure mode.
		expect(inspect({ HOBO_CODE_MODEL: "openai/gpt-4.1" }).source).toBe(
			"HOBO_CODE_MODEL",
		);
	});

	it("trims surrounding whitespace from the override", () => {
		// A copy-pasted export carries a trailing space more often than not,
		// and an untrimmed model id fails provider lookup with a confusing
		// "unknown model".
		expect(inspect({ HOBO_CODE_MODEL: "  openai/gpt-4.1  " }).activeModel).toBe(
			"openai/gpt-4.1",
		);
	});

	it("ignores an override that is only whitespace", () => {
		// Trimmed to nothing is not a chosen model; falling back beats running
		// against an empty id.
		expect(inspect({ HOBO_CODE_MODEL: "   " }).source).toBe("default");
	});

	it("ignores an empty override", () => {
		expect(inspect({ HOBO_CODE_MODEL: "" }).source).toBe("default");
	});
});

describe("the inventory as a whole", () => {
	it("stamps its schema", () => {
		expect(inspect().schema).toBe(CODE_MODELS_SCHEMA);
	});

	it("declares open-model support unconditionally", () => {
		// Not a function of what is configured: the claim is about the product,
		// and making it conditional would tell someone with no keys that open
		// models are unavailable to them — the opposite of true.
		expect(inspect().openModelSupport).toBe(true);
	});

	it("names the free local path", () => {
		// The $0 route is the answer for someone with no key and no budget;
		// leaving it out of the inventory hides the option that unblocks them.
		expect(inspect().notes.join(" ")).toMatch(/ollama|OPENAI_BASE_URL/);
	});

	it("shows the provider/model shape rather than assuming it is known", () => {
		expect(inspect().notes.join(" ")).toMatch(/provider\/model/);
	});
});

describe("the human summary", () => {
	it("leads with the active model", () => {
		expect(modelsHumanSummary(inspect()).split("\n")[0]).toMatch(/^model · /);
	});

	it("names the source", () => {
		expect(
			modelsHumanSummary(inspect({ HOBO_CODE_MODEL: "openai/gpt-4.1" })),
		).toContain("source · HOBO_CODE_MODEL");
	});

	it("lists the keys that are set", () => {
		expect(
			modelsHumanSummary(inspect({ OPENAI_API_KEY: "k", XAI_API_KEY: "k" })),
		).toMatch(/OPENAI_API_KEY.*XAI_API_KEY/);
	});

	it("says open models still work when no key is set", () => {
		// "none set" alone reads as a blocker. The line has to carry the way
		// out, or a user with no key concludes the tool is unusable.
		expect(modelsHumanSummary(inspect())).toMatch(
			/none set.*open models still supported/,
		);
	});

	it("points at the cost command for the $0 path", () => {
		expect(modelsHumanSummary(inspect())).toMatch(/hobo-code cost/);
	});
});

describe("the isolation platform matrix", () => {
	it("gives every row a fallback of worktree", () => {
		// Rift is an optimisation; a classical git worktree is the thing that
		// always works. A row whose fallback was anything else would have no
		// guaranteed path at all.
		for (const row of ISOLATION_PLATFORM_MATRIX) {
			expect(row.fallback).toBe("worktree");
		}
	});

	it("defaults CI to worktree on every platform, even CoW-capable ones", () => {
		// Determinism is worth more in CI than a fast checkout, so the fast
		// path is deliberately not taken there.
		for (const row of ISOLATION_PLATFORM_MATRIX) {
			expect(row.ciDefault).toBe("worktree");
		}
	});

	it("only prefers rift where copy-on-write is actually available", () => {
		// Preferring it on a non-CoW filesystem would pick a backend that
		// cannot work, and the failure would land at isolate time.
		for (const row of ISOLATION_PLATFORM_MATRIX) {
			if (row.preferredBackend === "rift") expect(row.cowCapable).toBe(true);
		}
	});

	it("explains each row rather than leaving the choice bare", () => {
		// The matrix is read by someone deciding whether their machine is set up
		// correctly; a row with no note cannot answer that.
		for (const row of ISOLATION_PLATFORM_MATRIX) {
			expect(row.notes.length).toBeGreaterThan(0);
		}
	});

	it("names each platform once", () => {
		const names = ISOLATION_PLATFORM_MATRIX.map((row) => row.platform);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("resolving a platform", () => {
	it("maps darwin to the APFS row", () => {
		expect(matrixForPlatform("darwin").platform).toBe("darwin-apfs");
	});

	it("maps win32 to the Windows row", () => {
		expect(matrixForPlatform("win32").platform).toBe("win32");
	});

	it("maps linux to the generic row until a CoW probe upgrades it", () => {
		// The conservative choice: `process.platform` alone cannot tell btrfs
		// from ext4, and claiming rift on ext4 would pick a backend that fails.
		expect(matrixForPlatform("linux").platform).toBe("linux-generic");
	});

	it("maps an unknown platform to the generic row rather than throwing", () => {
		// A new or unusual platform still needs an isolation strategy, and
		// worktree works everywhere.
		expect(matrixForPlatform("freebsd").platform).toBe("linux-generic");
	});

	it("gives an unknown platform a working backend", () => {
		expect(matrixForPlatform("freebsd").preferredBackend).toBe("worktree");
	});

	it("resolves the host platform with no argument", () => {
		expect(matrixForPlatform().fallback).toBe("worktree");
	});

	it("returns a row that is in the published matrix", () => {
		// The resolver must not synthesise a row; a caller cross-referencing
		// the matrix would otherwise find nothing matching what it was handed.
		expect(ISOLATION_PLATFORM_MATRIX).toContain(matrixForPlatform("darwin"));
	});
});
