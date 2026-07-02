import type { ProviderHandlerStore, TransportInvocation, WitCodec, WrpcTransport } from "@hobo/core";

export function createJsonWitCodec(): WitCodec {
	return Object.freeze({
		name: "json-wit",
		encode(value: unknown) {
			return structuredClone(value);
		},
		decode(value: unknown) {
			return structuredClone(value);
		},
	});
}

export function createInProcessTransport(options?: {
	codec?: WitCodec;
	store?: ProviderHandlerStore;
}): WrpcTransport & { readonly codec: WitCodec } {
	const codec = options?.codec ?? createJsonWitCodec();
	const store = options?.store;
	if (!store) {
		throw new Error("wrpc.in_process_store_required");
	}

	return Object.freeze({
		kind: "in-process" as const,
		codec,
		async invoke(invocation: TransportInvocation): Promise<unknown> {
			const handler = store.getHandler(
				invocation.link.providerId,
				invocation.link.exportInterface,
				invocation.operation,
			);
			if (typeof handler !== "function") {
				throw new Error(
					`wrpc.operation_not_found: ${invocation.link.exportInterface}.${invocation.operation}`,
				);
			}
			const encodedPayload = codec.encode(invocation.payload);
			const encodedResult = await handler(encodedPayload, invocation);
			return codec.decode(encodedResult);
		},
	});
}
