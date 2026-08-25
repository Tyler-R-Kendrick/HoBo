/**
 * The review content store: content-addressed blobs with verification on both
 * sides of the disk.
 *
 * Review comments reference the text they were written about by digest rather
 * than by copy, so this store is what makes an old comment still quotable
 * against a branch that has moved on. That means a blob is evidence, and the
 * store treats it as such: it verifies the hash after writing *and* after
 * reading.
 *
 * **Verifying on read is the unusual half, and the load-bearing one.** Writing
 * and re-reading immediately catches a truncated write; hashing again on `get`
 * catches everything that happened to the file afterwards — a bad disk, a
 * careless editor, a tampered store. Returning bytes that do not hash to the
 * digest they were asked for would let a review quote text nobody wrote.
 *
 * **The digest is validated before it is used as a path.** It becomes a
 * directory and filename, so anything that is not 64 hex characters is refused
 * rather than joined — otherwise `get("../../etc/passwd")` reads outside the
 * store.
 *
 * **Writes land by rename.** A reader that found a half-written blob would hash
 * it, get a mismatch, and report corruption for a blob that was merely still
 * arriving.
 */
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	createReviewContentStore,
	sha256Hex,
} from "../src/review/review-content-store.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function store() {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-blobs-"));
	roots.push(root);
	return { store: createReviewContentStore(root), root };
}

/** The message of the refusal, or a marker when there was none. */
function refusal(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return (error as Error).message;
	}
	return "no-refusal";
}

const blobDir = (root: string) => join(root, "review-blobs");

describe("addressing content by its hash", () => {
	it("returns the sha256 of what it stored", () => {
		const { store: content } = store();
		expect(content.put("hello")).toBe(sha256Hex("hello"));
	});

	it("gives identical content the same address", () => {
		// The point of content addressing: two reviewers quoting the same lines
		// share one blob.
		const { store: content } = store();
		expect(content.put("same")).toBe(content.put("same"));
	});

	it("gives different content different addresses", () => {
		const { store: content } = store();
		expect(content.put("a")).not.toBe(content.put("b"));
	});

	it("accepts bytes as readily as text", () => {
		const { store: content } = store();
		const bytes = new Uint8Array([1, 2, 3]);
		expect(content.put(bytes)).toBe(sha256Hex(bytes));
	});

	it("shards the first byte into a directory", () => {
		// Two hex characters, so a store with many blobs does not put them all in
		// one directory.
		const { store: content, root } = store();
		const digest = content.put("hello");
		expect(
			existsSync(join(blobDir(root), digest.slice(0, 2), digest.slice(2))),
		).toBe(true);
	});
});

describe("reading back", () => {
	it("round-trips text", () => {
		const { store: content } = store();
		expect(content.getText(content.put("some reviewed line"))).toBe(
			"some reviewed line",
		);
	});

	it("round-trips bytes exactly", () => {
		const { store: content } = store();
		const bytes = new Uint8Array([0, 255, 128, 7]);
		expect([...content.get(content.put(bytes))]).toEqual([...bytes]);
	});

	it("decodes as utf8, not as latin1", () => {
		// Review text is prose as often as code.
		const { store: content } = store();
		expect(content.getText(content.put("héllo — ünïcode"))).toBe(
			"héllo — ünïcode",
		);
	});

	it("refuses a digest it does not hold", () => {
		const { store: content } = store();
		expect(refusal(() => content.get("a".repeat(64)))).toMatch(/missing/u);
	});
});

describe("verifying on the way out", () => {
	it("refuses a blob whose bytes no longer hash to its name", () => {
		// The half that catches everything after the write: a bad disk, an editor
		// that touched the store, a tampered blob. Returning it would let a
		// review quote text nobody wrote.
		const { store: content, root } = store();
		const digest = content.put("original");
		writeFileSync(
			join(blobDir(root), digest.slice(0, 2), digest.slice(2)),
			"tampered",
		);
		expect(refusal(() => content.get(digest))).toMatch(/failed hash check/u);
	});

	it("names the digest that failed", () => {
		// So an operator can find the blob rather than the store.
		const { store: content, root } = store();
		const digest = content.put("original");
		writeFileSync(
			join(blobDir(root), digest.slice(0, 2), digest.slice(2)),
			"tampered",
		);
		expect(refusal(() => content.get(digest))).toContain(digest);
	});
});

describe("digests that are not digests", () => {
	it("refuses anything that is not 64 hex characters", () => {
		// It becomes a path. Without the check, a caller-supplied digest reads
		// outside the store.
		const { store: content } = store();
		for (const digest of [
			"../../etc/passwd",
			"",
			"a".repeat(63),
			"a".repeat(65),
			`${"a".repeat(62)}ZZ`,
			"A".repeat(64),
		]) {
			expect(refusal(() => content.get(digest))).toMatch(/not sha256/u);
		}
	});

	it("refuses uppercase hex, because the digest it writes is lowercase", () => {
		// Accepting both would make one blob addressable under two names and
		// break the "identical content, one blob" property.
		const { store: content } = store();
		const digest = content.put("hello");
		expect(refusal(() => content.get(digest.toUpperCase()))).toMatch(
			/not sha256/u,
		);
	});
});

describe("limits", () => {
	it("refuses a blob over 8MiB", () => {
		// A review quotes lines, not artifacts. Without a cap, one comment could
		// put an arbitrary file into the store.
		const { store: content } = store();
		expect(refusal(() => content.put("x".repeat(8 * 1024 * 1024 + 1)))).toMatch(
			/exceeds 8MiB/u,
		);
	});

	it("accepts a blob exactly at the limit", () => {
		// `>`, not `>=`: the boundary is allowed, and a blob at exactly the cap
		// is a legitimate one.
		const { store: content } = store();
		expect(() => content.put("x".repeat(8 * 1024 * 1024))).not.toThrow();
	});
});

describe("how writes land", () => {
	it("leaves no temporary file behind", () => {
		// A reader finding a half-written blob would hash it, mismatch, and
		// report corruption for a blob that was merely still arriving.
		const { store: content, root } = store();
		const digest = content.put("hello");
		expect(
			readdirSync(join(blobDir(root), digest.slice(0, 2))).filter((name) =>
				name.includes(".tmp"),
			),
		).toEqual([]);
	});

	it("does not rewrite a blob it already holds", () => {
		// Content-addressed, so a re-put is a no-op. Rewriting would churn the
		// disk and briefly replace a good blob with a partial one.
		const { store: content, root } = store();
		const digest = content.put("hello");
		const path = join(blobDir(root), digest.slice(0, 2), digest.slice(2));
		const before = statSync(path).mtimeMs;
		content.put("hello");
		expect(statSync(path).mtimeMs).toBe(before);
	});

	it("keeps blobs owner-only", () => {
		// Review text can quote anything in the repository, including files the
		// operator would not publish.
		const { store: content, root } = store();
		const digest = content.put("hello");
		const path = join(blobDir(root), digest.slice(0, 2), digest.slice(2));
		expect(statSync(path).mode & 0o077).toBe(0);
	});

	it("creates its root on construction", () => {
		// So the first put does not have to be the one that discovers the
		// directory is missing.
		const root = mkdtempSync(join(tmpdir(), "hobo-review-blobs-"));
		roots.push(root);
		createReviewContentStore(root);
		expect(existsSync(blobDir(root))).toBe(true);
	});
});

describe("the digest helper", () => {
	it("agrees with the store's own addressing", () => {
		const { store: content } = store();
		expect(sha256Hex("payload")).toBe(content.put("payload"));
	});

	it("hashes bytes and their text form identically", () => {
		expect(sha256Hex(Buffer.from("abc"))).toBe(sha256Hex("abc"));
	});

	it("is lowercase hex", () => {
		expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/u);
	});
});
