/**
 * The cue binary record-cue.test.ts vets the records with (ADR-0172), found
 * as the bindles CUE gate finds it: HOBO_CUE_BIN, else the cache the root
 * test:schema lane fills at .tools/cue/<CUE_VERSION>, else cue on PATH.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The version the root test:schema lane caches, and the one the CUE suite is written against. */
export const CUE_VERSION = "v0.14.0";

/** `binary` when its `cue version` names CUE_VERSION; otherwise a thrown error naming what was found. */
function pinned(binary: string, source: string): string {
	let version: string;
	try {
		version = execFileSync(binary, ["version"], { encoding: "utf8" });
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(
			`cue ${CUE_VERSION} not found (${source} ${binary}: ${reason}): run the root test:schema lane (it caches .tools/cue/${CUE_VERSION}), set HOBO_CUE_BIN, or put cue ${CUE_VERSION} on PATH`,
		);
	}
	if (!version.includes(CUE_VERSION)) {
		const found = version.split(/\r?\n/u)[0] ?? version;
		throw new Error(
			`${source} ${binary} is "${found}", not cue ${CUE_VERSION}: required fields (!) and these fixtures are checked against ${CUE_VERSION}`,
		);
	}
	return binary;
}

/** HOBO_CUE_BIN when set (it must exist), else the cached binary under `repoRoot`, else cue on PATH; each must be CUE_VERSION. */
export function cueBinary(env: NodeJS.ProcessEnv, repoRoot: string): string {
	const configured = env.HOBO_CUE_BIN;
	if (configured !== undefined) {
		if (!existsSync(configured)) {
			throw new Error(
				`HOBO_CUE_BIN names ${configured}, which does not exist: unset it or name cue ${CUE_VERSION}`,
			);
		}
		return pinned(configured, "HOBO_CUE_BIN");
	}
	const exe = process.platform === "win32" ? "cue.exe" : "cue";
	const cached = join(repoRoot, ".tools", "cue", CUE_VERSION, exe);
	if (existsSync(cached)) return pinned(cached, "the cached");
	return pinned("cue", "PATH's");
}
