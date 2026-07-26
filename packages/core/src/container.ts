import { createPortDescriptor, type PortDescriptor, portKey } from "./ports.js";

export interface Container {
	register<T>(descriptor: PortDescriptor | unknown, implementation: T): void;
	resolve<T>(descriptor: PortDescriptor | unknown): T;
}

export function createContainer(): Container {
	const implementations = new Map<string, unknown>();
	return {
		register(
			descriptorInput: PortDescriptor | unknown,
			implementation: unknown,
		) {
			const descriptor = createPortDescriptor(descriptorInput);
			const key = portKey(descriptor);
			if (implementations.has(key)) {
				throw new Error(`port ${key} is already registered`);
			}
			implementations.set(key, implementation);
		},
		resolve<T>(descriptorInput: PortDescriptor | unknown): T {
			const descriptor = createPortDescriptor(descriptorInput);
			const key = portKey(descriptor);
			if (!implementations.has(key)) {
				throw new Error(`port ${key} is not registered`);
			}
			return implementations.get(key) as T;
		},
	};
}
