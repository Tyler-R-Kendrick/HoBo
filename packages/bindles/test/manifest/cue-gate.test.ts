import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(testDir, "../..");
const cueFile = join(packageRoot, "data-models/cue/hobo_manifest_v1.cue");
const goldenDir = join(packageRoot, "test/fixtures/manifests/golden");
const invalidDir = join(packageRoot, "test/fixtures/manifests/invalid");

function resolveCueBinary(): string {
	const configured = process.env.HOBO_CUE_BIN;
	if (configured && existsSync(configured)) {
		return configured;
	}

	try {
		return execFileSync("which", ["cue"], { encoding: "utf8" }).trim();
	} catch {
		throw new Error(
			"CUE binary not found. Install with: go install cuelang.org/go/cmd/cue@latest or download from https://github.com/cue-lang/cue/releases",
		);
	}
}

function vetFixture(cueBin: string, fixturePath: string): number {
	try {
		execFileSync(cueBin, ["vet", cueFile, fixturePath, "-d", "#Manifest"], {
			encoding: "utf8",
			stdio: "pipe",
		});
		return 0;
	} catch (error) {
		const status = (error as NodeJS.ErrnoException & { status?: number }).status;
		return typeof status === "number" ? status : 1;
	}
}

describe("hobo.manifest/v1 CUE gate", () => {
	const cueBin = resolveCueBinary();

	for (const file of readdirSync(goldenDir).filter((name) => name.endsWith(".json"))) {
		it(`accepts golden fixture ${file}`, () => {
			expect(vetFixture(cueBin, join(goldenDir, file))).toBe(0);
		});
	}

	for (const file of readdirSync(invalidDir).filter((name) => name.endsWith(".json"))) {
		it(`rejects invalid fixture ${file}`, () => {
			expect(vetFixture(cueBin, join(invalidDir, file))).not.toBe(0);
		});
	}

	it("rejects corrupted golden fixture when db.port is removed", () => {
		const golden = JSON.parse(readFileSync(join(goldenDir, "db-api-site.json"), "utf8"));
		delete golden.resources.db.port;
		const tempPath = join(packageRoot, "test/fixtures/manifests/invalid/.tmp-missing-port-runtime.json");
		writeFileSync(tempPath, JSON.stringify(golden));
		try {
			expect(vetFixture(cueBin, tempPath)).not.toBe(0);
		} finally {
			if (existsSync(tempPath)) {
				unlinkSync(tempPath);
			}
		}
	});
});
