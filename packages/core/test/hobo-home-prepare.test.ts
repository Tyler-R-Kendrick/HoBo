// `prepareHoboHome`: what an entry point calls before it writes the HoBo home.
//
// Earlier versions kept state in `/tmp/.hobo` (or `$(os.tmpdir())/.hobo`) when
// HOME was unset. That state is never read now, so a user who has some is told
// once where it lives now. Only their own: another uid's directory, a symlink,
// or the very directory that is now the home says nothing. And a home that
// cannot be created (the account `nobody`, whose passwd home does not exist) fails
// with a message naming HOBO_HOME rather than with EACCES from a later write.
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	HoboHomeUnavailable,
	LEGACY_NOTICE_MARKER,
	prepareHoboHome,
} from "../src/hobo-home.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-home-prepare-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let cases = 0;

/** A user's HOME and a legacy temp home with state in it, for one case. */
function layout() {
	cases += 1;
	const root = join(scratch, `case-${cases}`);
	const user = join(root, "user");
	const legacy = join(root, "tmp", ".hobo");
	mkdirSync(user, { recursive: true });
	mkdirSync(join(legacy, "durable", "code"), { recursive: true });
	writeFileSync(join(legacy, "durable", "code", "chat.json"), "{}");
	return { root, user, legacy };
}

const me = process.getuid?.() ?? 0;

describe("prepareHoboHome", () => {
	it("creates the home, owner-only", () => {
		const { user } = layout();
		const home = prepareHoboHome({
			env: { HOME: user },
			legacyHomes: [],
			warn: () => {},
		});
		expect(home).toBe(join(user, ".hobo"));
		expect(statSync(home).isDirectory()).toBe(true);
		expect(statSync(home).mode & 0o777).toBe(0o700);
	});

	it("tells the user once where their legacy temp-dir state went", () => {
		const { user, legacy } = layout();
		const lines: string[] = [];
		const prepare = () =>
			prepareHoboHome({
				env: { HOME: user },
				legacyHomes: [legacy],
				uid: me,
				warn: (line) => lines.push(line),
			});
		prepare();
		prepare();
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(
			`HoBo state now lives in ${join(user, ".hobo")}`,
		);
		expect(lines[0]).toContain(`${legacy} holds state`);
		expect(lines[0]).toContain(`HOBO_HOME=${legacy}`);
		expect(existsSync(join(user, ".hobo", LEGACY_NOTICE_MARKER))).toBe(true);
		// Nothing is read from, or moved out of, the legacy home.
		expect(existsSync(join(legacy, "durable", "code", "chat.json"))).toBe(true);
		expect(existsSync(join(user, ".hobo", "durable"))).toBe(false);
	});

	it("says nothing about another uid's directory", () => {
		const { user, legacy } = layout();
		const lines: string[] = [];
		prepareHoboHome({
			env: { HOME: user },
			legacyHomes: [legacy],
			uid: me + 4242,
			warn: (line) => lines.push(line),
		});
		expect(lines).toEqual([]);
	});

	it("says nothing about a symlink", () => {
		const { root, user, legacy } = layout();
		const link = join(root, "tmp", ".hobo-link");
		symlinkSync(legacy, link);
		const lines: string[] = [];
		prepareHoboHome({
			env: { HOME: user },
			legacyHomes: [link],
			uid: me,
			warn: (line) => lines.push(line),
		});
		expect(lines).toEqual([]);
	});

	it("says nothing when the legacy directory is the resolved home", () => {
		const { root, legacy } = layout();
		const lines: string[] = [];
		prepareHoboHome({
			env: { HOME: join(root, "tmp") },
			legacyHomes: [legacy],
			uid: me,
			warn: (line) => lines.push(line),
		});
		expect(lines).toEqual([]);
	});

	it("says nothing when HOBO_HOME is set: the fallback never applied", () => {
		const { root, legacy } = layout();
		const lines: string[] = [];
		prepareHoboHome({
			env: { HOBO_HOME: join(root, "chosen") },
			legacyHomes: [legacy],
			uid: me,
			warn: (line) => lines.push(line),
		});
		expect(lines).toEqual([]);
	});

	it("fails with HoboHomeUnavailable naming HOBO_HOME when the home cannot be made", () => {
		// A file where a directory must go: as `nobody`, under its missing home,
		// the same call fails with EACCES instead.
		const { root } = layout();
		writeFileSync(join(root, "file"), "");
		let thrown: unknown;
		try {
			prepareHoboHome({ env: { HOME: join(root, "file") }, legacyHomes: [] });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(HoboHomeUnavailable);
		expect(thrown).toMatchObject({
			message: expect.stringMatching(
				/cannot create .*\/file\/\.hobo \(ENOTDIR\); set HOBO_HOME to a directory you can write$/u,
			),
		});
	});
});
