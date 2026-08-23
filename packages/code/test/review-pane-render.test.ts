/**
 * The review pane, and what a reviewer can tell from one glance at it.
 *
 * `review.test.ts` checks that the pane renders at all. This checks what it
 * says, because the whole surface is a progress report and a progress report
 * that overstates itself is worse than none:
 *
 * **A file is only ticked when it has actually been reviewed.** Three marks,
 * three meanings — `✓` reviewed, `!` stale, `·` untouched — and the middle one
 * is the one that matters. *Stale* means the file was reviewed and then
 * changed underneath that review. Rendering it as `✓` would tell a reviewer
 * they had already looked at code they have not seen; rendering it as `·`
 * would make them redo work they did do. It is its own state because it is
 * neither.
 *
 * **The counts are of coverage entries, not of files.** Reviewed and stale are
 * counted independently, so a review where every file has been touched once
 * and half have since changed reports both numbers rather than one number that
 * could be read either way.
 *
 * **The list is bounded at sixteen rows.** The pane shares a terminal with
 * everything else; an unbounded list on a large diff would push the counts —
 * the part that summarises — off the top of the screen.
 *
 * Pure rendering: a snapshot in, a string out.
 */
import { describe, expect, it } from "vitest";

import type { ReviewSnapshot } from "../src/_generated/code_review_pb.js";
import {
	ReviewCoverageState,
	ReviewLifecycle,
} from "../src/_generated/code_review_pb.js";
import { renderReviewPane } from "../src/review/review-terminal.js";

const file = (fileId: string, patch: Record<string, unknown> = {}) => ({
	fileId,
	pathAfter: `src/${fileId}.ts`,
	pathBefore: `src/${fileId}.ts`,
	additions: 3,
	deletions: 1,
	...patch,
});

const coverage = (fileId: string, state: ReviewCoverageState) => ({
	unit: { fileId },
	state,
});

const snapshot = (patch: Record<string, unknown> = {}): ReviewSnapshot =>
	// SAFETY: the fixture is the snapshot shape the renderer reads.
	({
		reviewId: "review-abcdef0123456789",
		lifecycle: ReviewLifecycle.OPEN,
		generations: [{ id: "gen-1" }],
		threads: [],
		coverage: [],
		manifest: { files: [file("a")] },
		...patch,
	}) as unknown as ReviewSnapshot;

const rows = (s: ReviewSnapshot, width?: number) =>
	renderReviewPane(s, width).split("\n");

describe("the header", () => {
	it("shortens the review id for reading", () => {
		// The full id is a uuid; eight characters is enough to tell two reviews
		// apart in a terminal and short enough to leave room for the rest.
		expect(rows(snapshot())[0]).toContain("review-a");
	});

	it("does not print the whole id", () => {
		expect(rows(snapshot())[0]).not.toContain("review-abcdef0123456789");
	});

	it("counts the generations", () => {
		// A generation is a re-read of the diff. How many there have been is
		// how a reviewer knows whether they are looking at a moving target.
		expect(
			rows(snapshot({ generations: [{ id: "g1" }, { id: "g2" }] }))[0],
		).toContain("gen 2");
	});

	it("says an open review is open", () => {
		expect(rows(snapshot())[0]).toContain("open");
	});

	it("says a closed review is closed", () => {
		// Closed means no more work is expected. Rendering it as open would
		// have someone pick up a review that is finished.
		expect(rows(snapshot({ lifecycle: ReviewLifecycle.CLOSED }))[0]).toContain(
			"closed",
		);
	});

	it("names the product so a pasted pane is identifiable", () => {
		expect(rows(snapshot())[0]).toContain("hobo-code review");
	});
});

describe("the progress line", () => {
	it("counts reviewed entries", () => {
		expect(
			rows(
				snapshot({
					coverage: [coverage("a", ReviewCoverageState.REVIEWED)],
				}),
			)[1],
		).toContain("reviewed 1");
	});

	it("counts stale entries separately from reviewed ones", () => {
		// Two independent numbers on purpose. One combined figure could be read
		// either way, and the difference is whether there is work left.
		const line = rows(
			snapshot({
				coverage: [
					coverage("a", ReviewCoverageState.REVIEWED),
					coverage("b", ReviewCoverageState.STALE),
				],
			}),
		)[1];
		expect(line).toContain("reviewed 1");
		expect(line).toContain("stale 1");
	});

	it("does not count a stale entry as reviewed", () => {
		// The core of it: stale is code that was reviewed and then changed.
		// Counting it as reviewed tells a reviewer they have seen code they
		// have not.
		expect(
			rows(
				snapshot({ coverage: [coverage("a", ReviewCoverageState.STALE)] }),
			)[1],
		).toContain("reviewed 0");
	});

	it("counts the files in the manifest", () => {
		expect(
			rows(snapshot({ manifest: { files: [file("a"), file("b")] } }))[1],
		).toContain("files 2");
	});

	it("counts the open threads", () => {
		// Threads are the conversation; a review with unresolved ones is not
		// finished even if every file is ticked.
		expect(
			rows(snapshot({ threads: [{ id: "t1" }, { id: "t2" }] }))[1],
		).toContain("threads 2");
	});

	it("reports zeroes on a review with nothing in it", () => {
		// A fresh review is a legitimate state and reads as "nothing done yet"
		// rather than as a broken pane.
		const line = rows(snapshot({ manifest: { files: [] } }))[1];
		expect(line).toContain("reviewed 0");
		expect(line).toContain("files 0");
	});

	it("renders with no manifest at all", () => {
		// The manifest arrives after the diff is fetched; before that the pane
		// still has to draw.
		expect(rows(snapshot({ manifest: undefined }))[1]).toContain("files 0");
	});
});

describe("the file marks", () => {
	const markFor = (state?: ReviewCoverageState) =>
		rows(
			snapshot({
				manifest: { files: [file("a")] },
				coverage: state === undefined ? [] : [coverage("a", state)],
			}),
		)[2];

	it("ticks a reviewed file", () => {
		expect(markFor(ReviewCoverageState.REVIEWED)).toContain("✓");
	});

	it("marks a stale file with its own glyph", () => {
		// Neither ticked nor blank. Ticking it claims a review that no longer
		// applies; blanking it discards one that partly does.
		const mark = markFor(ReviewCoverageState.STALE);
		expect(mark).toContain("!");
		expect(mark).not.toContain("✓");
	});

	it("leaves an untouched file unmarked", () => {
		const mark = markFor();
		expect(mark).toContain("·");
		expect(mark).not.toContain("✓");
	});

	it("does not tick a file whose coverage is for another file", () => {
		// The coverage entry carries its own file id, and matching on anything
		// looser would tick a file because a different one was reviewed.
		expect(
			rows(
				snapshot({
					manifest: { files: [file("a")] },
					coverage: [coverage("b", ReviewCoverageState.REVIEWED)],
				}),
			)[2],
		).toContain("·");
	});

	it("shows the path after the change", () => {
		expect(markFor()).toContain("src/a.ts");
	});

	it("falls back to the path before the change for a deleted file", () => {
		// A deleted file has no after-path. Rendering an empty one would give
		// the row a mark and a diffstat with nothing to attach them to.
		expect(
			rows(
				snapshot({
					manifest: {
						files: [file("a", { pathAfter: "", pathBefore: "old/a.ts" })],
					},
				}),
			)[2],
		).toContain("old/a.ts");
	});

	it("shows the diffstat", () => {
		// How big a file's change is decides what order a reviewer takes them
		// in.
		expect(markFor()).toContain("+3/-1");
	});

	it("shows a zero diffstat rather than omitting it", () => {
		// A file in the manifest with no line changes is a rename or a mode
		// change, and saying +0/-0 is what distinguishes that from an unread
		// count.
		expect(
			rows(
				snapshot({
					manifest: { files: [file("a", { additions: 0, deletions: 0 })] },
				}),
			)[2],
		).toContain("+0/-0");
	});
});

describe("bounding the list", () => {
	const many = (count: number) =>
		snapshot({
			manifest: {
				files: Array.from({ length: count }, (_unused, index) =>
					file(`f${index}`),
				),
			},
		});

	it("shows every file when there are few", () => {
		expect(rows(many(3))).toHaveLength(5);
	});

	it("stops at sixteen rows", () => {
		// The pane shares a terminal with everything else; an unbounded list on
		// a large diff would push the counts off the top of the screen.
		expect(rows(many(40))).toHaveLength(18);
	});

	it("still counts every file in the progress line", () => {
		// Truncating the list must not truncate the total, or the pane would
		// under-report the size of the review.
		expect(rows(many(40))[1]).toContain("files 40");
	});

	it("takes the first sixteen rather than an arbitrary window", () => {
		// Deterministic: the same review renders the same rows every repaint.
		expect(rows(many(40))[2]).toContain("f0");
	});
});

describe("narrow terminals", () => {
	it("shortens a long path to fit", () => {
		const long = snapshot({
			manifest: {
				files: [file("a", { pathAfter: `src/${"deep/".repeat(30)}x.ts` })],
			},
		});
		expect(rows(long, 40)[2]?.length).toBeLessThan(60);
	});

	it("keeps a floor so a path is never cut to nothing", () => {
		// Below the floor the row would be a mark and a diffstat with no file
		// name -- worse than a truncated one, because there is nothing to
		// recognise.
		expect(rows(snapshot(), 1)[2]).toMatch(/src|a\.ts|\.\.\./);
	});

	it("renders at a wide width without padding the path", () => {
		expect(rows(snapshot(), 200)[2]).toContain("src/a.ts");
	});

	it("defaults to eighty columns", () => {
		// The width every terminal starts at, and the one the pane is designed
		// against.
		expect(renderReviewPane(snapshot())).toBe(renderReviewPane(snapshot(), 80));
	});
});
