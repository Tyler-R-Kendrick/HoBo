/**
 * Load RivetKit from CJS or ESM. Upstream `require("rivetkit")` is broken
 * (`import.meta` in the published .cjs). Dynamic import works in both.
 */
export type RivetkitModule = {
	readonly actor: (...args: never[]) => unknown;
	readonly setup: (...args: never[]) => unknown;
	readonly queue: (...args: never[]) => unknown;
};

export async function loadRivetkit(): Promise<RivetkitModule> {
	const loaded = await import("rivetkit");
	if (
		typeof loaded.actor !== "function" ||
		typeof loaded.setup !== "function"
	) {
		throw new Error("rivetkit module missing actor/setup");
	}
	return loaded as unknown as RivetkitModule;
}

export async function loadRivetkitClient(): Promise<{
	createClient: (endpoint: string) => unknown;
}> {
	const loaded = await import("rivetkit/client");
	if (typeof loaded.createClient !== "function") {
		throw new Error("rivetkit/client missing createClient");
	}
	return loaded as { createClient: (endpoint: string) => unknown };
}
