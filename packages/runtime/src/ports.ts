// Structural port shapes the authoring runtime runs on. These are the seams the
// engine is injected with — never reinvented here. In production a Camp supplies
// them; in tests the `@hobo/runtime-local` in-memory implementations are injected
// (its `ActorHostPort` / `ActorHostLease` / `ManualClock` are structurally
// assignable to the interfaces below, and its EventStore-shaped journal to
// `JournalStore`). Keeping them structural means the engine depends only on
// `@hobo/core` ports at the type level (runtime -> core), with the concrete
// durable adapter (`runtime-local`) staying test-only.

/** A folded actor event: a discriminated `type` plus an open payload. */
export interface FoldEvent {
	type: string;
	[key: string]: unknown;
}

/**
 * Single-writer lease with a monotonic fence token (ActorHost, sdk-api.md
 * §Layer 1). Acquiring an already-held key is denied; a newer holder gets a
 * strictly greater `fenceToken`, so a stale writer's append is rejected.
 */
export interface ActorLease {
	readonly key: string;
	readonly holderId: string;
	readonly fenceToken: bigint;
	readonly expiresAt: string;
	release(): void;
}

/** The actor's durable state, folded from its own event stream under a lease. */
export interface ActorStateHandle<S> {
	append(
		lease: ActorLease,
		event: FoldEvent,
	): { streamId: string; seq: number; fenceToken: bigint };
	read(): { streamId: string; seq: number; state: S };
}

/** The virtual-actor host: lease placement + durable per-key state. */
export interface ActorHost {
	acquire(key: string, request: { holderId: string }): ActorLease;
	state<S>(
		key: string,
		request: { initialState: S; fold: (state: S, event: FoldEvent) => S },
	): ActorStateHandle<S>;
}

/** Deterministic clock seam; `sleep` is journaled, never a wall-clock wait. */
export interface RuntimeClock {
	now(): string;
	nowMs(): number;
}
