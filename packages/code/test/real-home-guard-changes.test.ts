/**
 * What the real-home guard counts as a change to a home it watches.
 *
 * A file whose size and modification time came back as they were has still
 * been written: its change time, inode or mode tells, and a symlink's target
 * tells for a symlink. A directory reached through a symlink in the home is a
 * place a write lands too, and a file written and removed again during the run
 * leaves nothing a snapshot after it could see, so the guard also watches the
 * homes while the run goes on. Each case here is one way a write used to slip
 * past the comparison.
 */
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	changedEntries,
	gainedEntries,
	removedEntries,
	snapshotHomes,
} from "./real-home-snapshot.js";
import { watchHomes } from "./real-home-watch.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-real-home-changes-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let homes = 0;

/** A home holding `durable/chat.json` ("{}"), and the snapshot of it. */
function home(): { home: string; file: string } {
	homes += 1;
	const dir = join(scratch, `home-${homes}`, ".hobo");
	mkdirSync(join(dir, "durable"), { recursive: true });
	const file = join(dir, "durable", "chat.json");
	writeFileSync(file, "{}");
	// Five seconds back, so a restored time is told apart from the write's.
	const then = new Date(Date.now() - 5000);
	utimesSync(file, then, then);
	return { home: dir, file };
}

/**
 * Waits out the kernel's timestamp granularity (a jiffy, up to 10ms), so a
 * write after the snapshot gets a change time of its own.
 */
const nextTick = () => new Promise((done) => setTimeout(done, 25));

/** Puts a file's access and modification times back as they were. */
function restoreTimes(file: string, before: { atime: Date; mtime: Date }) {
	utimesSync(file, before.atime, before.mtime);
}

describe("a file that looks untouched by size and time", () => {
	it("is changed when overwritten with as many bytes and its mtime put back", async () => {
		const { home: dir, file } = home();
		const times = statSync(file);
		const before = snapshotHomes([dir]);
		await nextTick();
		writeFileSync(file, "[]");
		restoreTimes(file, times);
		expect(changedEntries(before, snapshotHomes([dir]))).toEqual([file]);
	});

	it("is changed when overwritten, then restored, bytes and mtime alike", async () => {
		const { home: dir, file } = home();
		const times = statSync(file);
		const before = snapshotHomes([dir]);
		await nextTick();
		writeFileSync(file, '{"messages":[1]}');
		writeFileSync(file, "{}");
		restoreTimes(file, times);
		expect(changedEntries(before, snapshotHomes([dir]))).toEqual([file]);
	});

	it("is changed when replaced by a rename of a copy with the same bytes and times", async () => {
		const { home: dir, file } = home();
		const times = statSync(file);
		const before = snapshotHomes([dir]);
		await nextTick();
		const copy = join(dir, "durable", "chat.json.tmp");
		writeFileSync(copy, "{}");
		restoreTimes(copy, times);
		renameSync(copy, file);
		expect(changedEntries(before, snapshotHomes([dir]))).toEqual([file]);
	});

	it("is changed when only its mode changed, and so is a directory", () => {
		const { home: dir, file } = home();
		const before = snapshotHomes([dir]);
		chmodSync(file, 0o600);
		chmodSync(join(dir, "durable"), 0o700);
		expect(changedEntries(before, snapshotHomes([dir]))).toEqual([
			join(dir, "durable"),
			file,
		]);
	});
});

describe("symlinks in a watched home", () => {
	it("a symlink pointed somewhere else is changed, however long its target", () => {
		const { home: dir } = home();
		mkdirSync(join(scratch, "aa"), { recursive: true });
		mkdirSync(join(scratch, "bb"), { recursive: true });
		const link = join(dir, "workspaces");
		symlinkSync(join(scratch, "aa"), link);
		const before = snapshotHomes([dir]);
		unlinkSync(link);
		symlinkSync(join(scratch, "bb"), link);
		expect(changedEntries(before, snapshotHomes([dir]))).toEqual([link]);
	});

	it("a write through a symlinked directory is a write into the home", () => {
		const { home: dir } = home();
		const outside = join(scratch, `outside-${homes}`);
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(dir, "worktrees"));
		const before = snapshotHomes([dir]);
		writeFileSync(join(outside, "leak.json"), "{}");
		expect(gainedEntries(before, snapshotHomes([dir]))).toEqual([
			join(dir, "worktrees", "leak.json"),
		]);
	});

	it("a symlink loop, or one up to the home's own ancestor, is walked once", () => {
		const { home: dir } = home();
		symlinkSync(dir, join(dir, "durable", "again"));
		symlinkSync(join(dir, ".."), join(dir, "up"));
		const snapshot = snapshotHomes([dir]).get(dir);
		const paths = [...(snapshot?.keys() ?? [])];
		expect(paths).toContain(join("durable", "again"));
		expect(paths).toContain("up");
		expect(
			paths.some((path) =>
				path.startsWith(`${join("durable", "again")}${sep}`),
			),
		).toBe(false);
		expect(paths.some((path) => path.startsWith(`up${sep}`))).toBe(false);
	});
});

describe("watching a home during the run", () => {
	/** Lets the watcher's events arrive. */
	const settle = () => new Promise((done) => setTimeout(done, 200));

	it("names a file written and removed again, which no snapshot shows", async () => {
		const { home: dir } = home();
		const watch = watchHomes([dir]);
		try {
			await settle();
			const before = snapshotHomes([dir]);
			const leak = join(dir, "durable", "leak.json");
			writeFileSync(leak, "{}");
			rmSync(leak);
			await settle();
			const after = snapshotHomes([dir]);
			expect([
				...gainedEntries(before, after),
				...changedEntries(before, after),
				...removedEntries(before, after),
			]).toEqual([]);
			expect(watch.touched()).toContain(leak);
		} finally {
			watch.close();
		}
	});

	it("names a home created and removed again, though it did not exist", async () => {
		homes += 1;
		const parent = join(scratch, `home-${homes}`);
		mkdirSync(parent, { recursive: true });
		const dir = join(parent, ".hobo");
		const watch = watchHomes([dir]);
		try {
			await settle();
			mkdirSync(join(dir, "runtime"), { recursive: true });
			rmSync(dir, { recursive: true });
			await settle();
			expect(watch.touched()).toContain(dir);
		} finally {
			watch.close();
		}
	});

	it("names nothing in a home nobody wrote", async () => {
		const { home: dir } = home();
		const watch = watchHomes([dir]);
		try {
			snapshotHomes([dir]);
			await settle();
			expect(watch.touched()).toEqual([]);
		} finally {
			watch.close();
		}
	});
});
