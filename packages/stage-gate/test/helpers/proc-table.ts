/**
 * Directories laid out like the Linux process table, for the tests of
 * src/process-group.ts: one <pid>/stat per entry, written as Linux writes it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The group the tables are about. */
export const PGID = 4242;

export interface ProcEntry {
	readonly pid: number;
	readonly comm: string;
	readonly state: string;
	readonly pgrp: number;
	/** num_threads, field 20. */
	readonly threads: number;
}

/** A /proc/<pid>/stat line as Linux writes it: 52 fields, comm unescaped in parentheses. */
export function statLine({
	pid,
	comm,
	state,
	pgrp,
	threads,
}: ProcEntry): string {
	const flags = "0 -1 4227084 91 0 0 0 0 0 0 0 20 0";
	const rest = `0 414627 0 0 18446744073709551615${" 0".repeat(13)} 17${" 0".repeat(13)}`;
	return `${pid} (${comm}) ${state} 1 ${pgrp} ${pgrp} ${flags} ${threads} ${rest}\n`;
}

/** A single-thread zombie of PGID. */
export const zombie = (pid: number): ProcEntry => ({
	pid,
	comm: "sleep",
	state: "Z",
	pgrp: PGID,
	threads: 1,
});

export interface ProcTables {
	/** Where the tables are made; anything else a test needs on disk can go here. */
	readonly dir: string;
	/** A new table holding `entries` and a non-pid entry. */
	readonly table: (entries: readonly ProcEntry[]) => string;
	readonly remove: () => void;
}

export function procTables(): ProcTables {
	const dir = mkdtempSync(join(tmpdir(), "hobo-proc-table-"));
	let made = 0;
	return {
		dir,
		table(entries) {
			made += 1;
			const root = join(dir, `proc-${made}`);
			mkdirSync(join(root, "self"), { recursive: true });
			for (const entry of entries) {
				mkdirSync(join(root, String(entry.pid)));
				writeFileSync(join(root, String(entry.pid), "stat"), statLine(entry));
			}
			return root;
		},
		remove: () => rmSync(dir, { recursive: true, force: true }),
	};
}
