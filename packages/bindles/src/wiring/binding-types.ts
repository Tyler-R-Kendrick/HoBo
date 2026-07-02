import type { ComponentHandle } from "./errors.js";

export function bindingTypesFor(handle: ComponentHandle): Readonly<Record<string, string>> {
	assertComponent(handle, "bindingTypesFor.handle");
	return Object.fromEntries(
		Object.entries(handle.bindings).map(([alias, binding]) => [alias, binding.clientType]),
	);
}

function assertComponent(handle: unknown, path: string): asserts handle is ComponentHandle {
	if (
		!handle ||
		typeof handle !== "object" ||
		!["service", "container"].includes((handle as ComponentHandle).kind)
	) {
		throw new Error(`${path}: must be a service or container handle`);
	}
}
