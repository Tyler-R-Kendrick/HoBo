import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BindleImportError, loadBindleDefinition } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("loadBindleDefinition", () => {
	it("returns null when no bindle source exists", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "hobo-loader-empty-"));
		roots.push(dir);
		await expect(loadBindleDefinition(dir)).resolves.toBeNull();
	});

	it("surfaces a missing workspace dependency instead of no_bindle", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "hobo-loader-miss-"));
		roots.push(dir);
		await mkdir(path.join(dir, "src"), { recursive: true });
		await writeFile(
			path.join(dir, "src", "bindle.js"),
			'import { honoEntrypoint } from "@hobo/adapter-hono";\nexport default { name: "x" };\n',
		);
		await expect(loadBindleDefinition(dir)).rejects.toBeInstanceOf(
			BindleImportError,
		);
		await expect(loadBindleDefinition(dir)).rejects.toThrow(
			/adapter-hono|Cannot find/u,
		);
	});
});
