import type { BindleDefinition } from "@hobo/bindles";

import type { ExampleRuntimeDescriptor } from "./catalog-contract.js";
import { synthesizeTryRuntimeFromDeclared } from "./synthesize-try-runtime.js";

/**
 * Derive try-runtime + guest handler object from a Bindle that binds a
 * trainable/component class to `web`. Guest handlers call the same method
 * bodies via Function#toString — Source pane never shows this machinery.
 */
export function deriveWebGuestFromBindle(
	definition: BindleDefinition,
	appSource: string,
): {
	readonly runtime: ExampleRuntimeDescriptor;
	readonly guestHandlersSource: string;
} {
	const makeWeb = definition.entrypoint("web");
	if (typeof makeWeb !== "function") {
		throw new TypeError(
			`Bindle "${definition.name}" has no web entrypoint — bind a trainable with b.web(Hello)`,
		);
	}
	const instance = makeWeb() as Record<string, unknown>;
	if (!instance || typeof instance !== "object") {
		throw new TypeError(
			`Bindle "${definition.name}" web entrypoint did not construct an instance`,
		);
	}

	const runtime = synthesizeTryRuntimeFromDeclared(appSource);
	const customActions = runtime.routes
		.map((route) => route.action)
		.filter((action) => action !== "health");
	if (customActions.length === 0) {
		throw new TypeError(
			`Bindle "${definition.name}" web binding declares no trainable operations`,
		);
	}

	const handlerEntries: string[] = [];
	for (const action of customActions) {
		const method = instance[action];
		if (typeof method !== "function") {
			throw new TypeError(
				`Web instance for "${definition.name}" is missing method ${action}`,
			);
		}
		const implSource = callableSource(method as (...args: never[]) => unknown);
		handlerEntries.push(`  ${JSON.stringify(action)}({ body, response }) {
    const impl = ${implSource};
    const raw = body && typeof body.name === "string" ? body.name.trim() : "";
    const arg = raw.length > 0 ? raw : undefined;
    const result = impl.call({}, arg);
    if (typeof result === "string") return response(200, { greeting: result });
    return response(200, result && typeof result === "object" ? result : { value: result });
  }`);
	}

	return {
		runtime,
		guestHandlersSource: `{\n${handlerEntries.join(",\n")}\n}`,
	};
}

/** Turn a class method / function into a FunctionExpression source string. */
function callableSource(method: (...args: never[]) => unknown): string {
	const src = Function.prototype.toString.call(method).trim();
	if (
		src.startsWith("function") ||
		src.startsWith("async function") ||
		src.startsWith("(") ||
		src.startsWith("async (")
	) {
		return src;
	}
	// Class method: `greet(name) { … }` → `function greet(name) { … }`
	return `function ${src}`;
}
