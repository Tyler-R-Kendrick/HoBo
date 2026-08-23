export function deepFreeze<T>(value: T): T {
	// SAFETY: this generic helper preserves primitives and callable values.
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- SAFETY: arbitrary values enter this shared boundary.
	if (!value || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}
