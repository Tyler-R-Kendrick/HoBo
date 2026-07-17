import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createManualClock,
	createRuntimeLocalEventStore,
	type RuntimeLocalEventStore,
} from "@hobo/runtime-local";

// A fresh, isolated event store per test (the real runtime-local EventStore,
// backed by an in-memory-style temp dir). Callers close() it when done.
export function freshStore(): RuntimeLocalEventStore {
	const dir = mkdtempSync(join(tmpdir(), "hobo-data-"));
	return createRuntimeLocalEventStore({
		dataDir: dir,
		clock: createManualClock(),
	});
}

export interface OrderState {
	placed: boolean;
	totalCents: number;
}

export interface OrderCommand {
	id: string;
	totalCents: number;
}
