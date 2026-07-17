import type { CommandResult } from "../types/envelope.js";

// The canonical "not yet implemented" envelope the shell registry serves for
// unwired verbs (registry.stubCommand). A cloud verb whose Yard runtime has not
// been injected (the default, adapter-free `src/` wiring) falls back to this
// exact contract, so the shell's stub tests stay green until the mocked lane is
// wired by an injected runtime (tests / a future default provider registry).
export function stubResult(verb: string): CommandResult {
	return {
		ok: true,
		status: "not_implemented",
		code: "HOBO_CLI_STUB",
		message: `${verb} is not yet implemented`,
		data: {},
	};
}
