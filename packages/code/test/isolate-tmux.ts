// Every test file runs against a tmux server of its own, and the shell seats
// no agent CLIs in it. A test that started the shell on a TTY, or ran `mux`,
// reached the developer's own tmux server (the `hobo` session) and started the
// agents it found on PATH there, their real `claude` among them, where they
// outlived the run.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const socketDir = mkdtempSync(join(tmpdir(), "hobo-code-tmux-"));
process.env.TMUX_TMPDIR = socketDir;
// Inside tmux, $TMUX names the developer's server and wins over TMUX_TMPDIR.
delete process.env.TMUX;
process.env.HOBO_CODE_SEAT_AGENTS = "0";

afterAll(() => {
	spawnSync("tmux", ["kill-server"], { env: process.env, stdio: "ignore" });
	rmSync(socketDir, { recursive: true, force: true });
});
