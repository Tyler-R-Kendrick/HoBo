import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import { createMemoryReviewDiffSource } from "../src/review/review-generations.js";
import { startReviewControlServer } from "../src/review/review-http-routes.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

describe("review browser accessibility", () => {
	it("exposes labeled landmarks and moves file selection from the keyboard", async () => {
		const hoboHome = temp("hobo-review-a11y-");
		const diffSource = createMemoryReviewDiffSource();
		diffSource.stageFiles([
			{ path: "alpha.ts", oldText: "a\n", newText: "A\n" },
			{ path: "beta.ts", oldText: "b\n", newText: "B\n" },
			{ path: "gamma.ts", oldText: "c\n", newText: "C\n" },
		]);
		const control = createLocalReviewControl({ hoboHome, diffSource });
		const token = "browser-a11y-token";
		const server = await startReviewControlServer({
			hoboHome,
			token,
			control,
			diffSource,
		});
		const origin = `http://127.0.0.1:${server.port}`;
		try {
			const started = await fetch(`${origin}/api/reviews/commands`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
					origin,
				},
				body: JSON.stringify({
					schemaVersion: REVIEW_COMMAND_SCHEMA,
					commandId: "cmd-start",
					actorId: "browser-test",
					reviewId: "review-a11y",
					expectedRevision: "0",
					command: {
						kind: "start-review",
						sessionId: "session-a11y",
						target: {
							kind: "commit",
							repositoryId: "repo-1",
							repositoryRoot: "/tmp/hobo-secret-repo",
							parentCommitOid: "a".repeat(40),
							commitOid: "b".repeat(40),
						},
					},
				}),
			});
			expect(started.status).toBe(200);

			const browser = await chromium.launch({ headless: true });
			try {
				const page = await browser.newPage();
				page.setDefaultTimeout(4_000);
				await page.setExtraHTTPHeaders({ authorization: `Bearer ${token}` });
				await page.goto(`${origin}/reviews`);
				await page.getByRole("heading", { name: "HoBo Code review" }).waitFor();
				await page.getByRole("navigation", { name: "Reviews" }).waitFor();
				await page.getByRole("region", { name: "Changed files" }).waitFor();
				await page.getByRole("region", { name: "Diff" }).waitFor();
				await page.getByRole("region", { name: "Review threads" }).waitFor();
				await page.locator("[data-review-file]").first().waitFor();

				await page.locator("#files").focus();
				await page.waitForFunction(
					() =>
						document.activeElement instanceof HTMLElement &&
						(document.activeElement.id === "files" ||
							document.activeElement.dataset.reviewFile !== undefined),
				);
				await page.keyboard.press("j");
				await page.waitForFunction(() => {
					const selected = document.querySelector(
						"[data-review-file][aria-selected='true']",
					);
					return selected?.textContent?.includes("beta.ts") === true;
				});
				await page.keyboard.press("Enter");
				await page.waitForFunction(
					() =>
						(document.querySelector("#diff")?.textContent ?? "").includes(
							"beta.ts",
						) ||
						(document.querySelector("#diff")?.textContent ?? "").length > 0,
				);
				await page.keyboard.press("t");
				await page.waitForFunction(
					() => document.activeElement?.id === "threads",
				);
				const labeled = await page
					.locator("[data-review-file]")
					.evaluateAll((nodes) =>
						nodes.map((node) => node.getAttribute("aria-label") ?? ""),
					);
				expect(labeled.some((label) => label.includes("alpha.ts"))).toBe(true);
			} finally {
				await browser.close();
			}
		} finally {
			await server.close();
			control.close();
		}
	});
});
