import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Official nektos/act v0.2.89 Linux x64 release checksum, checked 2026-10-26.
const version = "0.2.89";
const checksum =
	"0191d6f1f3b716b5c55820032605d05fc3c1cdbf581ebeff655019e5dd1524c0";
if (process.platform !== "linux" || process.arch !== "x64")
	throw new Error(
		"the pinned installer supports Linux x64; use an official act v0.2.89 release for another platform",
	);
const parsed = parseArgs({
	options: { directory: { type: "string" } },
	strict: true,
});
const destination = resolve(parsed.values.directory ?? "work/hobo-ci-tools");
const scratch = await mkdtemp(join(tmpdir(), "hobo-ci-act-install-"));
try {
	const response = await fetch(
		`https://github.com/nektos/act/releases/download/v${version}/act_Linux_x86_64.tar.gz`,
		{ signal: AbortSignal.timeout(120000) },
	);
	if (!response.ok) throw new Error(`act download failed (${response.status})`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (createHash("sha256").update(bytes).digest("hex") !== checksum)
		throw new Error("act archive checksum mismatch");
	const archive = join(scratch, "act.tar.gz");
	await writeFile(archive, bytes);
	await mkdir(destination, { recursive: true });
	await new Promise<void>((resolvePromise, reject) =>
		execFile("tar", ["xzf", archive, "-C", destination, "act"], (error) =>
			error ? reject(error) : resolvePromise(),
		),
	);
	const binary = join(destination, "act");
	await chmod(binary, 0o755);
	process.stdout.write(`${binary}\n`);
} finally {
	await rm(scratch, { recursive: true, force: true });
}
