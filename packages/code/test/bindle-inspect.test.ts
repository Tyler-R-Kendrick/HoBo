import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	BINDLE_RESOURCE_KINDS,
	inspectBindleProject,
	inspectBindleSource,
	localBindleCapabilities,
} from "../src/bindle-inspect.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("inspectBindleSource", () => {
	it("reads hello-world factories, env keys, and http requirements", () => {
		const inspected = inspectBindleSource(`
import { bindle, env } from "@hobo/bindles";
const campEnv = env({ GREETING_PREFIX: "howdy", APP_TITLE: "howdy" });
export default bindle("hello-world", (b) => {
  const a = b.api(honoEntrypoint(api)).with(campEnv);
  const w = b.web(honoEntrypoint(web)).with(campEnv).dependsOn(a);
  return { api: a, web: w };
});
`);
		expect(inspected.name).toBe("hello-world");
		expect(inspected.resources.map((row) => `${row.kind}:${row.name}`)).toEqual(
			["api:api", "web:web"],
		);
		expect(inspected.envKeys).toEqual(["GREETING_PREFIX", "APP_TITLE"]);
		expect(inspected.requirements).toContain("managed-http-runtime");
	});

	it("reads backing capabilities from a JSON bindle project", () => {
		const root = mkdtempSync(join(tmpdir(), "bindle-inspect-"));
		roots.push(root);
		writeFileSync(
			join(root, "hobo.bindle.json"),
			JSON.stringify({
				name: "shop",
				resources: {
					db: { kind: "data", name: "db", dependsOn: [] },
					cache: { kind: "kv", name: "cache" },
					api: { kind: "api", name: "api", dependsOn: ["db"] },
				},
			}),
		);
		const inspected = inspectBindleProject(root);
		expect(inspected?.name).toBe("shop");
		expect(inspected?.resources.map((row) => row.kind).sort()).toEqual([
			"api",
			"data",
			"kv",
		]);
		expect(inspected?.requirements).toEqual(
			expect.arrayContaining(["managed-http-runtime", "data", "key-value"]),
		);
	});

	it("reads src/bindle.ts when no artifact is present", () => {
		const root = mkdtempSync(join(tmpdir(), "bindle-src-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "src", "bindle.ts"),
			`export default bindle("notes", (b) => ({ kv: b.kv(), web: b.web() }));\n`,
		);
		const inspected = inspectBindleProject(root);
		expect(inspected?.name).toBe("notes");
		expect(inspected?.resources.map((row) => row.kind).sort()).toEqual([
			"kv",
			"web",
		]);
	});
});

describe("local Bindle capability catalog", () => {
	it("covers the Bindle kind list with honest local fidelity", () => {
		const rows = localBindleCapabilities();
		expect(rows.map((row) => row.kind)).toEqual(
			BINDLE_RESOURCE_KINDS.filter((kind) => kind !== "experiment"),
		);
		expect(rows.map((row) => row.kind)).not.toContain("experiment");
		expect(rows.find((row) => row.kind === "web")).toEqual(
			expect.objectContaining({
				available: true,
				fidelity: "real",
			}),
		);
		expect(rows.find((row) => row.kind === "kv")).toEqual(
			expect.objectContaining({
				available: true,
				fidelity: "real",
			}),
		);
		expect(rows.find((row) => row.kind === "secret")).toEqual(
			expect.objectContaining({
				available: true,
				fidelity: "mocked",
			}),
		);
		expect(rows.find((row) => row.kind === "container")).toEqual(
			expect.objectContaining({
				available: false,
				fidelity: "camp-only",
			}),
		);
		expect(rows.find((row) => row.kind === "rollout")).toEqual(
			expect.objectContaining({
				available: true,
				fidelity: "real",
			}),
		);
		expect(rows.map((row) => row.kind)).not.toContain("golden");
	});
});
