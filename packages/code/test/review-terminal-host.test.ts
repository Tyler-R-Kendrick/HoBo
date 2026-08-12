import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-ports.js";
import { buildReviewTerminalDocument } from "../src/review/review-terminal-host.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("review terminal host", () => {
	it("projects listed reviews into the inbox document", async () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-review-host-"));
		roots.push(root);
		const control = createLocalReviewControl({ hoboHome: root });
		await control.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "start",
			actorId: "actor-1",
			reviewId: "review-host-1",
			expectedRevision: 0n,
			command: {
				kind: "start-review",
				target: {
					kind: "commit",
					repositoryId: "repo",
					repositoryRoot: root,
					parentCommitOid: "a".repeat(40),
					commitOid: "b".repeat(40),
				},
			},
		});
		const document = await buildReviewTerminalDocument(control);
		expect(document.inbox).toHaveLength(1);
		expect(document.inbox[0]?.reviewId).toBe("review-host-1");
		expect(document.snapshot?.reviewId).toBe("review-host-1");
		control.close();
	});
});
