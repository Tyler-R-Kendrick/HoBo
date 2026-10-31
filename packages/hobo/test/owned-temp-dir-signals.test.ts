import { describe, expect, it, vi } from "vitest";

import {
	type DirOwner,
	removeOwnedDirsOnSignals,
} from "../src/owned-temp-dir.js";

// The signals on which an entry point's owned directories are removed are
// hobo-code's ending signals, one list (`@hobo/code/ending-signals`). Here it
// names a signal no one else uses, so the handlers follow the list, not a copy.
vi.mock("@hobo/code/ending-signals", () => ({
	ENDING_SIGNALS: Object.freeze(["SIGUSR2"]),
}));
// The handlers are installed in a process's main thread only, and this suite
// runs in worker threads: the owner below stands for a main thread's process.
vi.mock("node:worker_threads", () => ({ isMainThread: true }));

describe("removeOwnedDirsOnSignals", () => {
	it("handles the signals of hobo-code's one list", () => {
		const handled: string[] = [];
		const owner: DirOwner = {
			pid: 4242,
			on: () => {},
			prependListener: (signal) => {
				handled.push(signal);
			},
			off: () => {},
			listenerCount: () => 0,
			kill: () => {},
		};
		removeOwnedDirsOnSignals(owner);
		expect(handled).toEqual(["SIGUSR2"]);
	});
});
