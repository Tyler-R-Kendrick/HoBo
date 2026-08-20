import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	bundledHarnessDir,
	pickKindFromSpec,
} from "../src/agent-harness-catalog.js";
import {
	agentKindOf,
	HARNESS_RUNTIME_ADAPTERS,
	HARNESS_SPEC_SCHEMA,
	HarnessSpecParseError,
	harnessKindOf,
	isHostSpec,
	parseHarnessSpec,
} from "../src/harness-spec.js";

describe("parseHarnessSpec", () => {
	it("parses a valid spec, config included", () => {
		const spec = parseHarnessSpec({
			id: "newbot",
			label: "New Bot",
			kind: "coding-agent",
			binaries: ["newbot"],
			configPaths: [".newbot"],
			command: "newbot",
			seat: 42,
			config: {
				format: "toml-append",
				path: ".newbot/config.toml",
				configuredWhen: ["[model.hobo]"],
				block: '[model.hobo]\nbase_url = "{{openaiUrl}}"\n',
			},
		});
		expect(spec.id).toBe("newbot");
		expect(spec.kind).toBe("coding-agent");
		expect(spec.seat).toBe(42);
		expect(spec.config?.format).toBe("toml-append");
		expect(Object.isFrozen(spec)).toBe(true);
	});

	it("accepts an explicit schema equal to the constant and rejects others", () => {
		expect(
			parseHarnessSpec({
				schema: HARNESS_SPEC_SCHEMA,
				id: "ok",
				label: "Ok",
				kind: "sdk",
			}).id,
		).toBe("ok");
		try {
			parseHarnessSpec({
				schema: "hobo.code.harness-spec/v2",
				id: "ok",
				label: "Ok",
				kind: "sdk",
			});
			expect.unreachable("schema mismatch must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HarnessSpecParseError);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe("schema");
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).expected).toContain(
				HARNESS_SPEC_SCHEMA,
			);
		}
	});

	it("rejects a bad kind with a path-bearing error", () => {
		try {
			parseHarnessSpec({ id: "typo", label: "Typo", kind: "coding-agnet" });
			expect.unreachable("bad kind must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HarnessSpecParseError);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const parseError = error as HarnessSpecParseError;
			expect(parseError.path).toBe("kind");
			expect(parseError.expected).toContain("coding-agent");
			expect(parseError.received).toContain("coding-agnet");
			expect(parseError.message).toContain("kind");
		}
	});

	it("rejects a bad config format with a nested path", () => {
		try {
			parseHarnessSpec({
				id: "badfmt",
				label: "Bad Format",
				kind: "coding-agent",
				config: { format: "yaml-append" },
			});
			expect.unreachable("bad format must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HarnessSpecParseError);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe("config.format");
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).expected).toContain(
				"toml-append",
			);
		}
	});

	it("rejects non-slug ids and wrong-typed optionals", () => {
		expect(() =>
			parseHarnessSpec({ id: "Bad Id!", label: "x", kind: "sdk" }),
		).toThrowError(HarnessSpecParseError);
		expect(() => parseHarnessSpec({ id: "", label: "x", kind: "sdk" })).toThrow(
			/id/,
		);
		try {
			parseHarnessSpec({ id: "x", label: "x", kind: "sdk", seat: "10" });
			expect.unreachable("string seat must throw");
		} catch (error) {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe("seat");
		}
		try {
			parseHarnessSpec({ id: "x", label: "x", kind: "sdk", binaries: [""] });
			expect.unreachable("empty binary must throw");
		} catch (error) {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe("binaries[0]");
		}
		try {
			parseHarnessSpec({
				id: "x",
				label: "x",
				kind: "sdk",
				config: { format: "json-env", env: { KEY: 1 } },
			});
			expect.unreachable("non-string env value must throw");
		} catch (error) {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe("config.env.KEY");
		}
	});

	it("keeps empty-string env values (Claude settings zero out keys)", () => {
		const spec = parseHarnessSpec({
			id: "claudeish",
			label: "Claude-ish",
			kind: "coding-agent",
			config: { format: "json-env", env: { ANTHROPIC_API_KEY: "" } },
		});
		expect(spec.config?.env?.ANTHROPIC_API_KEY).toBe("");
	});

	it("parses every bundled harness JSON file", () => {
		const dir = bundledHarnessDir();
		const names = readdirSync(dir).filter((name) => name.endsWith(".json"));
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
			expect(() => parseHarnessSpec(raw), name).not.toThrow();
		}
	});

	it("parses runtime.prompt and rejects an unknown placement", () => {
		const spec = parseHarnessSpec({
			id: "cursor",
			label: "Cursor",
			kind: "coding-agent",
			command: "cursor-agent",
			runtime: {
				adapter: "cli",
				prompt: { placement: "trailing-arg", prefixArgs: ["-p"] },
			},
		});
		expect(spec.runtime?.prompt).toEqual({
			placement: "trailing-arg",
			prefixArgs: ["-p"],
		});
		try {
			parseHarnessSpec({
				id: "cursor",
				label: "Cursor",
				kind: "coding-agent",
				runtime: {
					adapter: "cli",
					prompt: { placement: "argv-tail" },
				},
			});
			expect.unreachable("unknown placement must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HarnessSpecParseError);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			expect((error as HarnessSpecParseError).path).toBe(
				"runtime.prompt.placement",
			);
		}
	});

	it("keeps CUE closed vocabs aligned with the TypeScript constants", () => {
		const cue = readFileSync(
			join(import.meta.dirname, "..", "data-models", "harness_spec.cue"),
			"utf8",
		);
		const adapterBlock = cue.split("#HarnessRuntimeAdapter:")[1]?.split("#")[0];
		expect(adapterBlock).toBeDefined();
		const adapters = [...(adapterBlock ?? "").matchAll(/"([^"]+)"/gu)].map(
			(match) => match[1],
		);
		expect(adapters).toEqual([...HARNESS_RUNTIME_ADAPTERS]);
		expect(cue).toMatch(
			/#HarnessCliPromptPlacement:\s*"trailing-arg"\s*\|\s*"stdin"/u,
		);
	});
});

describe("kind derivations", () => {
	const base = { id: "x", label: "X" } as const;

	it("maps spec kind/host to registry and picks views like before", () => {
		const cases = [
			{
				spec: { ...base, kind: "coding-agent" },
				agent: "coding-agent",
				harness: "coding-cli",
				host: false,
			},
			{
				spec: { ...base, kind: "coding-agent", host: true },
				agent: "coding-agent",
				harness: "acp",
				host: true,
			},
			{
				spec: { ...base, kind: "harness" },
				agent: "harness",
				harness: "acp",
				host: true,
			},
			{
				spec: { ...base, kind: "harness", host: true },
				agent: "harness",
				harness: "acp",
				host: true,
			},
			{
				spec: { ...base, kind: "inference" },
				agent: "inference",
				harness: "inference",
				host: false,
			},
			{
				spec: { ...base, kind: "eve-agent" },
				agent: null,
				harness: "eve-agent",
				host: false,
			},
			{
				spec: { ...base, kind: "sdk" },
				agent: null,
				harness: "sdk",
				host: false,
			},
		] as const;
		for (const { spec, agent, harness, host } of cases) {
			expect(agentKindOf(spec), spec.kind).toBe(agent);
			expect(harnessKindOf(spec), spec.kind).toBe(harness);
			expect(isHostSpec(spec), spec.kind).toBe(host);
			// pickKindFromSpec stays the same derivation.
			expect(pickKindFromSpec(spec)).toBe(harness);
		}
	});
});
