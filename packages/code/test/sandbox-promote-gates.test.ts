/**
 * The gates that stand between a sandbox and the canonical project tree.
 *
 * Promotion is the sole audited mutation path into the real tree, so these
 * three functions are the whole safety story around it, and each fails closed
 * in a slightly different way.
 *
 * **A missing gate result is a failure, not an absence.** `runPromotionGates`
 * does not ask "did any gate fail" — it asks, for each *required* gate, whether
 * a passing result was reported. A suite that crashed before running
 * `docs:freshness` reports nothing for it, and treating silence as consent
 * would promote work no gate ever looked at. The synthesised failure says
 * `missing required gate result` precisely so that case is distinguishable from
 * a gate that ran and failed.
 *
 * **Failing gates beyond the required set still block.** The required list is a
 * floor, not a filter: a repository that adds its own gate gets it honoured
 * without touching this module.
 *
 * **`assertMediatedOnly` is inverted on purpose.** It takes "the agent may
 * write the canonical tree" and throws when that is *true*. The caller passes
 * `options.agentMayWriteCanonical === true`, so an absent option is false and
 * the safe path is the default — a flag that had to be explicitly set to
 * `false` to be safe would fail open on every caller that forgot it.
 *
 * **Vendored token tools are checked by presence, not by manifest.** A tool
 * copied into `vendor/` is there whether or not anything declares it, and the
 * check looks in all three places a copy plausibly lands.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	assertMediatedOnly,
	assertNoVendoredTokenTools,
	EXTERNAL_TOKEN_TOOLS,
	runPromotionGates,
} from "../src/sandbox-promote.js";

const REQUIRED = [
	"architecture:guard",
	"standards:check",
	"agent:check",
	"docs:freshness",
];

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function projectRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-promote-"));
	roots.push(dir);
	return dir;
}

const gate = (name: string, pass = true, detail = "") => ({
	name,
	pass,
	detail,
});

/** Every required gate, reported as passing. */
const allPassing = () => REQUIRED.map((name) => gate(name));

const failedNames = (gates: ReturnType<typeof allPassing>) =>
	runPromotionGates(gates)
		.failed.map((entry) => entry.name)
		.sort();

describe("mediated writes only", () => {
	it("permits promotion when the agent cannot write the tree", () => {
		expect(() => assertMediatedOnly(false)).not.toThrow();
	});

	it("refuses when the agent may write the tree directly", () => {
		// Promotion exists to be the audited path. If the agent can also write
		// directly, the audit describes a subset of what happened.
		expect(() => assertMediatedOnly(true)).toThrow(/sandbox purity violated/u);
	});

	it("says what the violation is, not just that there was one", () => {
		expect(() => assertMediatedOnly(true)).toThrow(
			/must not freely write the canonical project tree/u,
		);
	});
});

describe("running the promotion gates", () => {
	it("passes when every required gate reported success", () => {
		const outcome = runPromotionGates(allPassing());
		expect(outcome.ok).toBe(true);
		expect(outcome.failed).toEqual([]);
	});

	it("fails when a required gate reported failure", () => {
		const gates = allPassing().map((entry) =>
			entry.name === "agent:check" ? gate("agent:check", false, "lint") : entry,
		);
		expect(runPromotionGates(gates).ok).toBe(false);
		expect(failedNames(gates)).toEqual(["agent:check"]);
	});

	it("keeps the failing gate's own detail", () => {
		// The detail is what tells an operator which gate to re-run and why.
		const gates = allPassing().map((entry) =>
			entry.name === "agent:check"
				? gate("agent:check", false, "3 lint errors")
				: entry,
		);
		expect(runPromotionGates(gates).failed[0]?.detail).toBe("3 lint errors");
	});

	it("fails when a required gate reported nothing at all", () => {
		// The case that matters most: a suite that crashed before reaching a gate
		// reports no result for it, and treating silence as consent would promote
		// work no gate ever looked at.
		const gates = allPassing().filter(
			(entry) => entry.name !== "docs:freshness",
		);
		expect(runPromotionGates(gates).ok).toBe(false);
		expect(failedNames(gates)).toEqual(["docs:freshness"]);
	});

	it("distinguishes a missing result from a failed one", () => {
		const gates = allPassing().filter(
			(entry) => entry.name !== "docs:freshness",
		);
		expect(runPromotionGates(gates).failed[0]?.detail).toBe(
			"missing required gate result",
		);
	});

	it("reports every required gate when nothing ran", () => {
		expect(failedNames([])).toEqual([...REQUIRED].sort());
		expect(runPromotionGates([]).ok).toBe(false);
	});

	it("blocks on a failing gate outside the required set", () => {
		// The required list is a floor, not a filter -- a repository that adds
		// its own gate gets it honoured without touching this module.
		const gates = [...allPassing(), gate("custom:check", false, "nope")];
		expect(runPromotionGates(gates).ok).toBe(false);
		expect(failedNames(gates)).toEqual(["custom:check"]);
	});

	it("ignores a passing gate outside the required set", () => {
		const gates = [...allPassing(), gate("custom:check", true)];
		expect(runPromotionGates(gates).ok).toBe(true);
	});

	it("reports a failing required gate exactly once", () => {
		// It is reachable from both loops -- the required sweep and the
		// everything-else sweep -- so the dedupe by name is what stops an
		// operator seeing the same failure twice.
		const gates = allPassing().map((entry) =>
			entry.name === "agent:check" ? gate("agent:check", false) : entry,
		);
		expect(runPromotionGates(gates).failed).toHaveLength(1);
	});

	it("takes the first result when a gate is reported twice", () => {
		// Duplicate names collapse in the lookup. Worth pinning: a suite that
		// re-ran a gate and appended the result would otherwise have its retry
		// silently ignored, which is the wrong direction only if the retry
		// passed -- and here it stays failed, which is the safe one.
		const gates = [
			...allPassing().filter((entry) => entry.name !== "agent:check"),
			gate("agent:check", false, "first"),
			gate("agent:check", true, "retry"),
		];
		expect(runPromotionGates(gates).ok).toBe(false);
	});
});

describe("vendored token tools", () => {
	it("passes a project that vendors none of them", () => {
		expect(assertNoVendoredTokenTools(projectRoot())).toEqual({
			ok: true,
			found: [],
		});
	});

	it("finds one copied into node_modules", () => {
		const root = projectRoot();
		mkdirSync(join(root, "node_modules", "caveman"), { recursive: true });
		expect(assertNoVendoredTokenTools(root)).toEqual({
			ok: false,
			found: ["caveman"],
		});
	});

	it("looks in vendor and .vendor as well", () => {
		// Three plausible landing places for a copy; checking only one would let
		// the other two through.
		for (const directory of ["vendor", ".vendor"]) {
			const root = projectRoot();
			mkdirSync(join(root, directory, "ponytail"), { recursive: true });
			expect(assertNoVendoredTokenTools(root).found).toEqual(["ponytail"]);
		}
	});

	it("reports every tool it found, not just the first", () => {
		// So one run of the check is enough to clean up.
		const root = projectRoot();
		mkdirSync(join(root, "node_modules", "caveman"), { recursive: true });
		mkdirSync(join(root, "vendor", "serena"), { recursive: true });
		expect(assertNoVendoredTokenTools(root).found.sort()).toEqual([
			"caveman",
			"serena",
		]);
	});

	it("counts a tool once even when copied to several places", () => {
		const root = projectRoot();
		mkdirSync(join(root, "node_modules", "rtk"), { recursive: true });
		mkdirSync(join(root, "vendor", "rtk"), { recursive: true });
		expect(assertNoVendoredTokenTools(root).found).toEqual(["rtk"]);
	});

	it("checks every tool on the published list", () => {
		// Driven off EXTERNAL_TOKEN_TOOLS rather than a hand-written list, so a
		// tool added to the constant without being checked fails here.
		for (const tool of EXTERNAL_TOKEN_TOOLS) {
			const root = projectRoot();
			mkdirSync(join(root, "node_modules", tool), { recursive: true });
			expect(assertNoVendoredTokenTools(root).found).toEqual([tool]);
		}
	});

	it("is quiet about a project directory that does not exist", () => {
		// The check runs early, sometimes before a workspace is materialised.
		expect(assertNoVendoredTokenTools("/definitely/not/a/path").ok).toBe(true);
	});
});
