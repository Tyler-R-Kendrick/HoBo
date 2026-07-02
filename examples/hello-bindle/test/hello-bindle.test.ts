import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { buildHelloBindle } from "../scripts/build.ts";
import {
	componentizeHelloBindle,
	runWasmtimeSmoke,
} from "@hobo/componentize";

const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(packageRoot, "dist");
const SOURCE_DATE_EPOCH = "2026-01-01T00:00:00.000Z";

beforeAll(async () => {
	process.env.SOURCE_DATE_EPOCH = SOURCE_DATE_EPOCH;
	await buildHelloBindle();
});

describe("determinism", () => {
	it("produces identical bytes and digest across two builds", async () => {
		const first = await componentizeHelloBindle({
			sourceRoot: packageRoot,
			sourceDateEpoch: SOURCE_DATE_EPOCH,
		});
		const second = await componentizeHelloBindle({
			sourceRoot: packageRoot,
			sourceDateEpoch: SOURCE_DATE_EPOCH,
		});

		expect(second.component.digest).toBe(first.component.digest);
		expect(Buffer.from(second.component.bytes)).toEqual(Buffer.from(first.component.bytes));
	});
});

describe("artifact", () => {
	it("validates wasm component envelope and OCI annotations", async () => {
		const wasm = await readFile(join(distDir, "hello-bindle.component.wasm"));
		const oci = JSON.parse(await readFile(join(distDir, "hello-bindle.oci.json"), "utf8"));
		const { createHash } = await import("node:crypto");
		const digest = `sha256:${createHash("sha256").update(wasm).digest("hex")}`;

		expect(WebAssembly.validate(wasm)).toBe(true);
		expect(oci.artifactType).toBe("application/vnd.wasm.component.v1+wasm");
		expect(oci.manifest.annotations["dev.hobo.wit.world"]).toBe(
			"hobo:examples/hello-bindle@0.1.0/service",
		);
		expect(oci.manifest.layers[0].digest).toBe(digest);
	});
});

describe("smoke", () => {
	it("invokes health export and prints hello-bindle:ok", async () => {
		const result = await componentizeHelloBindle({
			sourceRoot: packageRoot,
			sourceDateEpoch: SOURCE_DATE_EPOCH,
		});
		const smoke = await runWasmtimeSmoke(result.component, { exportName: "health" });
		expect(smoke.stdout).toBe("hello-bindle:ok\n");
		expect(smoke.exitCode).toBe(0);
	});
});

describe("signing", () => {
	it("verifies valid signatures and refuses tampered or unsigned artifacts", async () => {
		const signature = JSON.parse(await readFile(join(distDir, "hello-bindle.signature.json"), "utf8"));
		const { verifySignedArtifact } = await import("../../src/signing.js");

		expect(verifySignedArtifact(signature)).toBe(true);

		const tampered = {
			...signature,
			digest: "sha256:" + "0".repeat(64),
		};
		expect(verifySignedArtifact(tampered)).toBe(false);

		const unsigned = { digest: signature.digest };
		expect(verifySignedArtifact(unsigned as never)).toBe(false);
	});
});

describe("guards", () => {
	it("fails closed on toolchain skew and nondeterministic source", async () => {
		const { PINNED_TOOLCHAIN } = await import("@hobo/componentize");
		await expect(
			componentizeHelloBindle({
				sourceRoot: packageRoot,
				sourceDateEpoch: SOURCE_DATE_EPOCH,
				toolchain: { ...PINNED_TOOLCHAIN, jco: "9.9.9" },
			}),
		).rejects.toThrow(/componentize\.toolchain_skew/);

		const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const root = await mkdtemp(join(tmpdir(), "hello-bindle-guard-"));
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(
			join(root, "src", "service.ts"),
			'export const t = Date.now();\nexport function health() { return { status: 200, body: "bad" }; }\n',
		);
		try {
			await expect(
				componentizeHelloBindle({
					sourceRoot: root,
					sourceDateEpoch: SOURCE_DATE_EPOCH,
				}),
			).rejects.toThrow(/componentize\.nondeterministic_source/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
