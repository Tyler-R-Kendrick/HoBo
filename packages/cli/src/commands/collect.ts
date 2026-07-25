import { readFile } from "node:fs/promises";
import path from "node:path";

import {
	type CollectionTarget,
	canonicalManifestHash,
	collectBindleManifest,
	type ManifestV1,
	parseManifest,
	serializeManifest,
} from "@hobo/bindles";

import { stubResult } from "../cloud/stub.js";
import type { CommandModule } from "../shell/registry.js";

// The golden the `--check` drift gate compares the freshly collected manifest IR
// against. Committed alongside the project so CI can assert the checked-in IR is
// still what run-to-collect emits.
export const COLLECT_GOLDEN_FILE = "hobo.manifest.json";

export interface CollectCommandDeps {
	// Injected collection target (tests / dev wiring): the project's Bindle whose
	// components run in resource-collection mode. `src/` stays adapter-free — the
	// loader that materializes a target from a project's TS source is a later
	// slice, so un-injected `collect` falls back to the shell stub.
	readonly target?: CollectionTarget;
}

// `hobo collect` (S1-20) — run resource collection on the project Bindle and
// print/emit the manifest IR. Run-to-collect (@hobo/bindles) runs the Bindle's
// components in collection mode and folds them into a manifest IR that is
// byte-identical to the static compile. `--check` recomputes and fails on drift
// against the committed golden manifest.
export function createCollectCommand(
	deps: CollectCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, emitProgress }) => {
			const { target } = deps;
			if (!target) {
				return stubResult("collect");
			}

			const projectDir = context.projectDir ?? context.cwd;
			emitProgress(
				`hobo collect: running resource collection on ${target.bindleId}`,
			);
			const result = collectBindleManifest(target);
			const manifestValue = JSON.parse(
				serializeManifest(result.manifest),
			) as Record<string, unknown>;
			const manifestIr = JSON.stringify(manifestValue, null, 2);

			if (flags.check) {
				const golden = await loadGolden(projectDir);
				if (!golden) {
					return {
						ok: false,
						status: "error",
						code: "HOBO_COLLECT_NO_GOLDEN",
						message: `hobo collect --check: no golden manifest at ${COLLECT_GOLDEN_FILE}`,
						remediation: [
							`Run hobo collect and commit ${COLLECT_GOLDEN_FILE} before enforcing --check.`,
						],
						data: { command: "collect", manifestHash: result.manifestHash },
					};
				}

				const goldenHash = canonicalManifestHash(golden);
				if (goldenHash !== result.manifestHash) {
					return {
						ok: false,
						status: "drift",
						code: "HOBO_COLLECT_DRIFT",
						message: `hobo collect --check: manifest drift\ngolden:    ${goldenHash}\ncollected: ${result.manifestHash}`,
						remediation: [
							`Re-run hobo collect and commit the refreshed ${COLLECT_GOLDEN_FILE}.`,
						],
						data: {
							command: "collect",
							goldenHash,
							manifestHash: result.manifestHash,
							manifest: manifestValue,
						},
					};
				}

				return {
					ok: true,
					status: "ok",
					code: "HOBO_OK",
					message: `hobo collect --check ok (no drift)\nhash: ${result.manifestHash}`,
					data: {
						command: "collect",
						checked: true,
						manifestHash: result.manifestHash,
						manifest: manifestValue,
					},
				};
			}

			return {
				ok: true,
				status: "ok",
				code: "HOBO_OK",
				message: `hobo collect: ${result.bindleId} (${result.resources.length} resources)\nhash: ${result.manifestHash}\n${manifestIr}`,
				data: {
					command: "collect",
					bindleId: result.bindleId,
					manifestHash: result.manifestHash,
					resources: result.resources,
					binds: result.binds,
					manifest: manifestValue,
					events: result.events,
				},
			};
		},
	};
}

async function loadGolden(projectDir: string): Promise<ManifestV1 | null> {
	let raw: string;
	try {
		raw = await readFile(path.join(projectDir, COLLECT_GOLDEN_FILE), "utf8");
	} catch {
		return null;
	}
	try {
		return parseManifest(JSON.parse(raw));
	} catch {
		return null;
	}
}
