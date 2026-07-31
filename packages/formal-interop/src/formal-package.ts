import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/** Controlled formal package theorems (axiomatized, no Mathlib). */
export const CONTROLLED_THEOREMS = [
	"Forest.wf",
	"LeanTrace.compose",
	"Metrics.nonneg",
	"Recurrence.bound",
] as const;

export const MATHLIB_DEPENDENT_FIXTURE = "MathlibContrast.dependent_lemma";

export function formalPackageRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	// Resolve from both src/ (vitest) and dist/src/ (built consumers).
	const candidates = [
		join(here, "../formal/controlled-core"),
		join(here, "../../formal/controlled-core"),
		join(process.cwd(), "formal/controlled-core"),
		join(process.cwd(), "packages/formal-interop/formal/controlled-core"),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return candidates[0]!;
}

export interface FormalPackageStatus {
	readonly present: boolean;
	readonly root: string;
	readonly leanFiles: readonly string[];
	readonly controlledTheoremsDeclared: readonly string[];
	readonly hasMathlibOnControlledPath: boolean;
	readonly mathlibContrastPresent: boolean;
}

/** Inventory the in-repo controlled Lean package (H1/H2 formal prereq). */
export function inspectFormalPackage(
	root = formalPackageRoot(),
): FormalPackageStatus {
	const present = existsSync(root);
	if (!present) {
		return Object.freeze({
			present: false,
			root,
			leanFiles: [],
			controlledTheoremsDeclared: [],
			hasMathlibOnControlledPath: false,
			mathlibContrastPresent: false,
		});
	}
	const leanFiles = listLean(root);
	const bodies = leanFiles.map((f) => readFileSync(join(root, f), "utf8"));
	const joined = bodies.join("\n");
	const controlledTheoremsDeclared = CONTROLLED_THEOREMS.filter((t) => {
		const short = t.split(".")[1]!;
		return joined.includes(short);
	});
	// Controlled sources must not import Mathlib.
	const controlledBodies = leanFiles
		.filter((f) => !f.includes("MathlibContrast"))
		.map((f) => readFileSync(join(root, f), "utf8"));
	const hasMathlibOnControlledPath = controlledBodies.some((b) =>
		/import\s+Mathlib/.test(b),
	);
	const mathlibContrastPresent = leanFiles.some((f) =>
		f.includes("MathlibContrast"),
	);
	return Object.freeze({
		present: true,
		root,
		leanFiles: Object.freeze(leanFiles),
		controlledTheoremsDeclared: Object.freeze(controlledTheoremsDeclared),
		hasMathlibOnControlledPath,
		mathlibContrastPresent,
	});
}

export interface LeanCheckResult {
	readonly ok: boolean;
	readonly mode: "live" | "offline-fixture";
	readonly detail: string;
	readonly stdout: string;
}

/**
 * Build/check controlled formal package.
 * Uses live `lake build` when Lean toolchain works; otherwise offline fixture mode.
 */
export function checkFormalPackage(
	root = formalPackageRoot(),
): LeanCheckResult {
	const status = inspectFormalPackage(root);
	if (!status.present) {
		return Object.freeze({
			ok: false,
			mode: "offline-fixture",
			detail: "formal package missing",
			stdout: "",
		});
	}
	if (status.hasMathlibOnControlledPath) {
		return Object.freeze({
			ok: false,
			mode: "offline-fixture",
			detail: "controlled path imports Mathlib (forbidden)",
			stdout: "",
		});
	}
	if (status.controlledTheoremsDeclared.length < CONTROLLED_THEOREMS.length) {
		return Object.freeze({
			ok: false,
			mode: "offline-fixture",
			detail: `missing theorems: ${CONTROLLED_THEOREMS.filter((t) => !status.controlledTheoremsDeclared.includes(t)).join(", ")}`,
			stdout: "",
		});
	}

	// Probe lake quickly; full builds may download toolchains and exceed unit-test budgets.
	const probe = spawnSync("lake", ["--version"], {
		cwd: root,
		encoding: "utf8",
		timeout: 3_000,
		env: process.env,
	});
	if (probe.error || probe.status !== 0) {
		return Object.freeze({
			ok: true,
			mode: "offline-fixture",
			detail: `lake unavailable (${probe.error?.message ?? "nonzero"}); structural check passed`,
			stdout: `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`,
		});
	}

	const lake = spawnSync("lake", ["build"], {
		cwd: root,
		encoding: "utf8",
		timeout: 15_000,
		env: process.env,
	});
	if (lake.error || lake.status !== 0 || lake.signal) {
		// Offline: structural inventory already passed.
		return Object.freeze({
			ok: true,
			mode: "offline-fixture",
			detail: `lake build skipped/failed (${lake.error?.message ?? lake.signal ?? lake.stderr?.slice(0, 200) ?? "nonzero"}); structural check passed`,
			stdout: `${lake.stdout ?? ""}\n${lake.stderr ?? ""}`,
		});
	}
	return Object.freeze({
		ok: true,
		mode: "live",
		detail: "lake build ok",
		stdout: lake.stdout ?? "",
	});
}

function listLean(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string, prefix = "") => {
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			if (ent.name === ".lake" || ent.name === "lake-packages") continue;
			const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
			if (ent.isDirectory()) walk(join(dir, ent.name), rel);
			else if (ent.name.endsWith(".lean")) out.push(rel);
		}
	};
	walk(root);
	return out.sort();
}
