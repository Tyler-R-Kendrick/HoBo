/**
 * AX guard: `pnpm run doctor` must surface agent-tooling readiness offline
 * (AUTH, setup --help, MCP launchers) without live cloud credentials.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("doctor agent-tooling (AX)", () => {
	it("reports AUTH, setup help, and fail-closed MCP launchers", () => {
		const r = spawnSync(
			"node",
			["--experimental-strip-types", "scripts/dx-preflight.mts", "doctor"],
			{
				cwd: root,
				encoding: "utf8",
				timeout: 60_000,
				env: { ...process.env },
			},
		);
		const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
		expect(r.status, out).toBe(0);
		expect(out).toMatch(/AUTH\.md present/);
		expect(out).toMatch(/WorkOS auth\.md|auth\.md protocol/i);
		expect(out).toMatch(/setup-agent-tools\.sh --help/);
		expect(out).toMatch(/agent-mcp-serena\.sh present/);
		expect(out).toMatch(/agent-mcp-headroom\.sh present/);
		expect(out).toMatch(/agent-mcp-gbrain\.sh present/);
		// Zero-key path: missing gbrain must still print a copy-pasteable next step
		if (/gbrain not on PATH/.test(out)) {
			expect(out).toMatch(/setup-agent-tools\.sh --common-only --no-gbrain/);
			expect(out).toMatch(/AUTH\.md/);
		}
	});
});
