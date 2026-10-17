/**
 * The pins run git without a terminal (each network git is in its own
 * session, so its deadline can end it with everything it started). ssh then
 * cannot ask for a passphrase or a host key, and git cannot ask for a
 * username. When git's error says that is what went wrong, the GIT_FAILED
 * message says why and what to do instead. The pins' own remotes are https;
 * ssh is reached only through a user's `url.<base>.insteadOf`.
 *
 * `ssh` here is a script that prints what OpenSSH prints and fails.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	makeRemote,
	makeWork,
	runBootstrap,
	scratch,
} from "./support/pins-support.ts";

const URL = "https://good.invalid/o/r.git";
const HINT =
	/hint: pins run git without a terminal, so ssh cannot ask for a passphrase or a host key and git cannot ask for a username/u;

/** A work tree whose manifest and .gitmodules name URL, and an ssh that says `says`. */
function viaSsh(says: string): { work: string; ssh: string } {
	const dir = scratch("ssh-hint");
	const remote = makeRemote(dir);
	const work = makeWork(dir, remote, 1);
	const file = join(work, "tools/pins/siblings.json");
	const manifest = JSON.parse(readFileSync(file, "utf8"));
	manifest.git.lib.repo = URL;
	writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(
		join(work, ".gitmodules"),
		`[submodule "external/lib"]\n\tpath = external/lib\n\turl = ${URL}\n`,
	);
	const ssh = join(dir, "ssh");
	writeFileSync(ssh, `#!/bin/sh\necho '${says}' >&2\nexit 255\n`, {
		mode: 0o755,
	});
	return { work, ssh };
}

function run(work: string, ssh: string, args: readonly string[]) {
	return runBootstrap(
		work,
		args,
		{ GIT_SSH_COMMAND: ssh, HOBO_PINS_ALLOW_LOCAL: "" },
		[["url.ssh://git@example.invalid/.insteadOf", "https://good.invalid/"]],
	);
}

describe("an ssh or credential prompt git could not show", () => {
	for (const says of [
		"git@example.invalid: Permission denied (publickey).",
		"Host key verification failed.",
	]) {
		it(`"${says}" gets the hint, from status --online and from fetch`, () => {
			const { work, ssh } = viaSsh(says);
			for (const args of [
				["--status", "--online"],
				["--fetch", "lib"],
			]) {
				const result = run(work, ssh, args);
				assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
				assert.match(result.stderr, /ERR GIT_FAILED/u);
				assert.match(
					result.stderr,
					HINT,
					`${args.join(" ")}: ${result.stderr}`,
				);
				assert.match(result.stderr, /ssh-agent|known_hosts|credential helper/u);
			}
		});
	}

	it("any other ssh failure gets no hint", () => {
		const { work, ssh } = viaSsh(
			"ssh: connect to host example.invalid port 22: Connection refused",
		);
		const result = run(work, ssh, ["--status", "--online"]);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /ERR GIT_FAILED/u);
		assert.doesNotMatch(result.stderr, /hint:/u);
	});
});
