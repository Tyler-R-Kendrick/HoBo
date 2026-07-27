/** Deterministic ULID-compatible id generation from a clock + counter. */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createUlidGenerator(clock: { now(): string }): () => string {
	let lastMs = 0;
	let counter = 0;

	return () => {
		const nowMs = Date.parse(clock.now());
		const ms = Number.isFinite(nowMs) ? nowMs : Date.now();
		if (ms === lastMs) {
			counter += 1;
		} else {
			lastMs = ms;
			counter = 0;
		}
		let time = ms;
		let timePart = "";
		for (let i = 0; i < 10; i++) {
			timePart = CROCKFORD[time % 32] + timePart;
			time = Math.floor(time / 32);
		}
		// 16 chars of entropy: mix counter + fixed seed for tests
		let entropy = "";
		let n = (counter * 0x9e37_79b9) >>> 0;
		for (let i = 0; i < 16; i++) {
			entropy += CROCKFORD[n % 32];
			n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
		}
		return timePart + entropy;
	};
}

export function createDeterministicId(
	prefix: string,
	parts: readonly string[],
): string {
	return `${prefix}:${parts.join(":")}`;
}
