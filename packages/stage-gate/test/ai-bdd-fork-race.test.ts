/**
 * runAiBdd against a member of ai-bdd's group that forks and exits over and
 * over (ADR-0172): test/helpers/hop.sh ignores SIGTERM and, 100 times, starts
 * itself again in the background and exits. A /proc scan that lists the pids
 * before such a fork and reads the parent after its exit sees only a zombie;
 * the stop must still end in a SIGKILL to the group, which reaches the child.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";
import { runAiBdd } from "../src/ai-bdd-process.js";
import { killQuietly } from "./helpers/release-gate.js";

const HOP = join(dirname(fileURLToPath(import.meta.url)), "helpers", "hop.sh");
const RUNS = 10;

const scratch = mkdtempSync(join(tmpdir(), "hobo-fork-race-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** The live processes whose command line names `token`: hop.sh's, which name their marker. */
function survivors(token: string): number[] {
	const found: number[] = [];
	for (const entry of readdirSync("/proc")) {
		if (!/^\d+$/u.test(entry)) continue;
		try {
			if (readFileSync(`/proc/${entry}/cmdline`, "utf8").includes(token)) {
				found.push(Number(entry));
			}
		} catch {
			// Gone between the listing and the read.
		}
	}
	return found;
}

describe("runAiBdd on Linux, against a member that forks and exits while it is stopped", () => {
	it.runIf(process.platform === "linux")(
		`leaves none of ${RUNS} hopping groups running`,
		async () => {
			const token = join(scratch, "hop-");
			try {
				await Promise.all(
					Array.from({ length: RUNS }, (_, run) =>
						runAiBdd(
							{
								command: [
									"sh",
									"-c",
									'sh "$0" 100 "$1" >/dev/null 2>&1 & sleep 0.3; exit 0',
									HOP,
									`${token}${run}`,
								],
								cwd: tmpdir(),
								env: process.env,
								timeoutMs: 20_000,
								graceMs: 1500,
								relay: () => undefined,
							},
							[],
						),
					),
				);
				// A SIGKILLed hop.sh is gone within moments; one that escaped hops on, then sleeps 3 s.
				const deadline = Date.now() + 2000;
				while (survivors(token).length > 0 && Date.now() < deadline) {
					await new Promise((done) => setTimeout(done, 100));
				}
				expect(survivors(token)).toEqual([]);
			} finally {
				for (const pid of survivors(token)) killQuietly(pid);
			}
		},
		60_000,
	);
});
