import type { CommandResult } from "../types/envelope.js";

// The canonical "not yet implemented" envelope the shell registry serves for
// unwired verbs (registry.stubCommand). A cloud verb whose Yard runtime has not
// been injected (the default, adapter-free `src/` wiring) falls back to this
// exact contract, so the shell's stub tests stay green until the mocked lane is
// wired by an injected runtime (tests / a future default provider registry).
export function stubResult(verb: string): CommandResult {
	// A stub is not success: ok:false so the renderer exits non-zero (human and
	// --json lanes alike). Escape hatch: HOBO_STUB_OK=1 restores the legacy
	// ok:true envelope for tooling that still depends on exit 0.
	const legacyOk = process.env.HOBO_STUB_OK === "1";
	return {
		ok: legacyOk,
		status: "not_implemented",
		code: "HOBO_CLI_STUB",
		message: `${verb} needs the composed @hobo/hobo binary after a workspace build (pnpm exec turbo run build --filter @hobo/hobo). This adapter-free shell is a stub, not the local lane.`,
		data: {},
	};
}
