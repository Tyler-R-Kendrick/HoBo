import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { saveChatSession } from "../src/chat-sessions.js";
import { createEvidencePort } from "../src/evidence-port.js";
import { renderEvidenceJournalHtml } from "../src/evidence-report.js";
import {
	projectSessionEvidenceJournal,
	readCurrentSessionContext,
	recordSessionDecision,
	writeCurrentSessionContext,
} from "../src/session-evidence.js";

const temps: string[] = [];
afterEach(() => {
	for (const dir of temps) rmSync(dir, { recursive: true, force: true });
	temps.length = 0;
});

function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-session-evidence-"));
	temps.push(dir);
	return dir;
}

describe("current hobo-code session pointer", () => {
	it("pins Evidence to the running interactive session", () => {
		const home = temp();
		writeCurrentSessionContext(home, {
			sessionId: "chat-live012345",
			cwd: "/proj/hello",
			stationLabel: "station:local",
			envLabel: "env:local-dev",
			modelLabel: "ollama · qwen",
		});
		expect(readCurrentSessionContext(home)).toEqual(
			expect.objectContaining({
				schemaVersion: "hobo.code.current-session/v1",
				sessionId: "chat-live012345",
				cwd: "/proj/hello",
				stationLabel: "station:local",
			}),
		);
	});
});

describe("session evidence journal", () => {
	it("streams asks, decisions with reasons, and visual artifacts", () => {
		const home = temp();
		const evidenceRoot = join(home, "durable", "code", "evidence");
		const port = createEvidencePort({
			root: evidenceRoot,
			actor: "hobo-code:shell",
			origin: "hobo-code:interactive-shell",
			signingKey: "test",
			now: () => "2026-08-14T12:01:00.000Z",
		});
		const png = port.beginArtifact({
			title: "Checkout after change",
			mediaType: "image/png",
		});
		png.write(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
		const shot = png.finish();
		port.submit({
			kind: "screenshot",
			title: "Browser screenshot",
			summary: "Looked at the checkout page to confirm the button label.",
			subject: "session:chat-live012345",
			artifactRefs: [shot.id],
			sourceRef: "http://web.hello.local.hobo.localhost:4173/checkout",
		});
		recordSessionDecision(home, {
			sessionId: "chat-live012345",
			title: "Promoted sandbox",
			reason: "Apply the checkout label fix.\nM src/button.ts",
			now: () => "2026-08-14T12:02:00.000Z",
		});
		saveChatSession(home, {
			id: "chat-live012345",
			cwd: "/proj/hello",
			messages: [
				{ role: "user", text: "Make the checkout button say Pay now.", at: 1 },
				{
					role: "assistant",
					text: "I will rename the button and verify it in the browser.",
					at: 2,
				},
			],
			createdAt: 1,
			updatedAt: 3,
		});
		writeCurrentSessionContext(home, {
			sessionId: "chat-live012345",
			cwd: "/proj/hello",
		});

		const journal = projectSessionEvidenceJournal({
			hoboHome: home,
			evidence: port,
			generatedAt: "2026-08-14T12:03:00.000Z",
		});
		expect(journal.sessionId).toBe("chat-live012345");
		expect(journal.events.map((event) => event.kind)).toEqual([
			"ask",
			"decision",
			"look",
			"decision",
		]);
		expect(journal.events[0]?.reason).toContain("checkout button");
		expect(journal.events[1]?.reason).toContain("rename the button");
		expect(journal.events[2]?.artifacts[0]?.mediaType).toBe("image/png");
		expect(journal.events[3]?.reason).toContain("src/button.ts");
		expect(
			journal.events.some((event) => event.id.startsWith("missing:")),
		).toBe(false);
	});

	it("renders a live stream, not a sectioned static report", () => {
		const home = temp();
		const port = createEvidencePort({
			root: join(home, "durable", "code", "evidence"),
			actor: "hobo-code:shell",
			origin: "hobo-code:interactive-shell",
			signingKey: "test",
			now: () => "2026-08-14T12:01:00.000Z",
		});
		saveChatSession(home, {
			id: "chat-stream99",
			cwd: "/proj",
			messages: [{ role: "user", text: "Ship it.", at: 10 }],
			createdAt: 10,
			updatedAt: 10,
		});
		writeCurrentSessionContext(home, {
			sessionId: "chat-stream99",
			cwd: "/proj",
		});
		const journal = projectSessionEvidenceJournal({
			hoboHome: home,
			evidence: port,
			generatedAt: "2026-08-14T12:03:00.000Z",
		});
		const html = renderEvidenceJournalHtml(journal, {
			live: true,
			journalHref: "/__hobo/evidence/journal?report=read",
		});
		expect(html).toContain('class="stream"');
		expect(html).toContain("data-live");
		expect(html).toContain("chat-stream99");
		expect(html).toContain("Ship it.");
		expect(html).toContain("fetch(");
		expect(html).not.toContain("No test run report submitted");
		expect(html).not.toContain(
			"Live report updates when this page is refreshed",
		);
		expect(html).not.toContain("<h2>Tests</h2>");
	});
});
