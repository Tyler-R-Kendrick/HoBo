import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	asHoboEvidenceHost,
	createEvidencePort,
} from "../src/evidence-port.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("WIT evidence host port", () => {
	it("content-addresses artifacts and stamps guest evidence with host trust", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-evidence-port-"));
		roots.push(root);
		const port = createEvidencePort({
			root,
			actor: "principal:developer",
			origin: "component:demo",
			signingKey: "test-signing-key",
			now: () => "2026-08-11T12:00:00.000Z",
		});
		const writer = port.beginArtifact({
			title: "screen",
			mediaType: "image/png",
		});
		writer.write(new Uint8Array([1, 2, 3]));
		const artifact = writer.finish();
		const host = asHoboEvidenceHost(port);
		expect(host.submit).toBe(port.submit);
		expect(host.beginArtifact).toBe(port.beginArtifact);
		expect(artifact.id).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(existsSync(port.artifactPath(artifact.id))).toBe(true);
		expect([...(port.readArtifact(artifact.id)?.bytes ?? [])]).toEqual([
			1, 2, 3,
		]);

		const id = port.submit({
			kind: "screenshot",
			title: "Rendered state",
			summary: "Actual browser capture",
			subject: "session:demo",
			artifactRefs: [artifact.id],
		});
		expect(port.records()).toEqual([
			expect.objectContaining({
				id,
				actor: "principal:developer",
				origin: "component:demo",
				recordedAt: "2026-08-11T12:00:00.000Z",
				verification: "claimed",
			}),
		]);
	});

	it("rejects forged trust and unknown artifact references", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-evidence-port-"));
		roots.push(root);
		const port = createEvidencePort({
			root,
			actor: "principal:developer",
			origin: "component:demo",
			signingKey: "test-signing-key",
		});
		expect(() =>
			port.submit({
				kind: "test",
				title: "forged",
				summary: "bad",
				subject: "session:demo",
				artifactRefs: [],
				verification: "verified",
			}),
		).toThrow("verification is host-owned");
		expect(() =>
			port.submit({
				kind: "test",
				title: "unknown",
				summary: "bad",
				subject: "session:demo",
				artifactRefs: [`sha256:${"0".repeat(64)}`],
			}),
		).toThrow("unknown evidence artifact");
	});
});
