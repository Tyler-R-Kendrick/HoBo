import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	assertCloudflareContainersSupportedForConvex,
	CONVEX_BACKEND_OCI_IMAGE,
	ConvexCloudflareContainersError,
	materializeConvexCloudflareBackendScaffold,
	parseWorkersDevUrl,
	provisionConvexBackendOnCloudflare,
} from "../src/convex-backend-container.js";

describe("convex Cloudflare Containers provision (anon)", () => {
	it("does not refuse Temporary Accounts up-front (anon is the path)", () => {
		expect(() =>
			assertCloudflareContainersSupportedForConvex({ temporaryAccount: true }),
		).not.toThrow();
	});

	it("materializes official Convex image URI — no Dockerfile / no Docker", async () => {
		const workDir = await mkdtemp(path.join(tmpdir(), "hobo-convex-cf-"));
		await materializeConvexCloudflareBackendScaffold({
			workDir,
			workerName: "hobo-convex-test",
			image: CONVEX_BACKEND_OCI_IMAGE,
			cloudOrigin: "https://hobo-convex-test.workers.dev",
			siteOrigin: "https://hobo-convex-test.workers.dev/http",
			bootstrapToken: "bootstrap-test-token",
		});
		const wrangler = await readFile(
			path.join(workDir, "wrangler.jsonc"),
			"utf8",
		);
		expect(wrangler).toContain(CONVEX_BACKEND_OCI_IMAGE);
		expect(wrangler).toContain("ConvexBackend");
		expect(wrangler).not.toContain("./Dockerfile");
		// The claim is "no Dockerfile was written", so the assertion has to be
		// ENOENT specifically: a bare `rejects.toThrow()` would also have been
		// satisfied by EACCES, EISDIR, or a bad `workDir` — i.e. by the test
		// looking in the wrong place.
		await expect(
			readFile(path.join(workDir, "Dockerfile"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(JSON.stringify(wrangler)).not.toMatch(/hobo\/convex/i);
		const worker = await readFile(path.join(workDir, "src/index.ts"), "utf8");
		expect(worker).toContain("generate_admin_key.sh");
		expect(worker).toContain("/.hobo/admin-key");
	});

	it("mock provision returns workers.dev URL — not localhost / not convex.cloud", async () => {
		const workDir = await mkdtemp(path.join(tmpdir(), "hobo-convex-cf-mock-"));
		const result = await provisionConvexBackendOnCloudflare({
			workDir,
			workerName: "hobo-convex-swaghaus",
			mock: true,
		});
		expect(result.mode).toBe("cloudflare-containers");
		expect(result.anonymous).toBe(true);
		expect(result.temporary).toBe(true);
		expect(result.backendUrl).toMatch(/^https:\/\/.+\.workers\.dev$/u);
		expect(result.backendUrl).not.toMatch(/127\.0\.0\.1|localhost/iu);
		expect(result.backendUrl).not.toMatch(/\.convex\.cloud/iu);
		expect(result.image).toBe(CONVEX_BACKEND_OCI_IMAGE);
		expect(result.claimUrl).toContain("claim-preview");
	});

	it("parses workers.dev URL from wrangler output", () => {
		expect(
			parseWorkersDevUrl(
				"Published https://hobo-convex-swaghaus.acct.workers.dev",
				"",
			),
		).toBe("https://hobo-convex-swaghaus.acct.workers.dev");
	});

	it("live path surfaces Containers 403 from Temporary Accounts (no Docker)", async () => {
		const workDir = await mkdtemp(path.join(tmpdir(), "hobo-convex-cf-live-"));
		await expect(
			provisionConvexBackendOnCloudflare({
				workDir,
				workerName: "hobo-convex-403",
				temporaryAccount: {
					accountId: "acct-test",
					apiToken: "token-test",
					claimUrl:
						"https://dash.cloudflare.com/claim-preview?claimToken=probe",
				},
				spawn: async ({ args }) => {
					if (args.includes("deploy")) {
						return {
							exitCode: 1,
							stdout: "Uploaded hobo-convex-403",
							stderr:
								"POST /accounts/acct-test/containers/applications\nForbidden\nAuthentication error",
						};
					}
					return { exitCode: 0, stdout: "", stderr: "" };
				},
			}),
		).rejects.toMatchObject({
			name: "ConvexCloudflareContainersError",
			claimUrl: expect.stringContaining("claim-preview"),
		});
		try {
			await provisionConvexBackendOnCloudflare({
				workDir,
				workerName: "hobo-convex-403b",
				temporaryAccount: {
					accountId: "acct-test",
					apiToken: "token-test",
					claimUrl:
						"https://dash.cloudflare.com/claim-preview?claimToken=probe",
				},
				spawn: async ({ args }) => {
					if (args.includes("deploy")) {
						return {
							exitCode: 1,
							stdout: "",
							stderr: "containers/applications Forbidden",
						};
					}
					return { exitCode: 0, stdout: "", stderr: "" };
				},
			});
		} catch (error) {
			expect(error).toBeInstanceOf(ConvexCloudflareContainersError);
			// SAFETY: fixture/test or I/O boundary value is the named domain type after this assertion.
			expect((error as Error).message).toMatch(
				/Temporary Accounts rejected Containers/i,
			);
			// SAFETY: fixture/test or I/O boundary value is the named domain type after this assertion.
			expect((error as Error).message).not.toMatch(
				/install Docker|local Docker|CLOUDFLARE_API_TOKEN/i,
			);
		}
	});
});
