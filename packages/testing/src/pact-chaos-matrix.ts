/**
 * The full failure-state matrix for a driver replayed against a pact.
 *
 * `runChaosConformance` injects each ambiguous fault on **one** call — the
 * write — because that is where duplication hides. That is the highest-value
 * single scenario and it is not the whole failure surface. A deploy that dies
 * on the *lookup* is a different state (nothing was applied); one that dies on
 * the *delete* is a third; one that dies twice in a row is a fourth, and it is
 * the one that actually happens when a provider is having a bad minute. A lane
 * that only ever tests the write reports "chaos: green" while four fifths of
 * the failure space has never executed.
 *
 * So this module sweeps **every fault at every call index**, then adds the two
 * scenarios an index sweep cannot express — a second fault during the recovery
 * itself, and a fault during teardown.
 *
 * ## The two properties, and why both are needed
 *
 * **Convergence** — after any failure, retrying lands exactly one resource with
 * a stable identity, and never destroys anything to get there.
 *
 * **Fidelity** — every request issued while converging still matches the
 * contract: a declared path, a recorded body, recorded headers. This is the
 * half a convergence-only lane misses, and the failure mode is specific. A
 * driver recovering from a lost response takes a branch its happy path never
 * takes — the update branch instead of the create branch, a different
 * endpoint, a body assembled from a partially-parsed response. Convergence
 * asks "did you end up with one?"; fidelity asks "was everything you said on
 * the way there something the provider agreed to hear?" A driver can converge
 * while talking nonsense, and that ships as a 400 on the first real retry.
 *
 * Both are computed from the pact, not from an opinion: convergence from the
 * lifecycle's state, fidelity from the interactions' declared requests.
 */
import type { HttpTransport, TransportRequest } from "@hobo/core";

import { CHAOS_FAULTS, type ChaosFault, chaosTransport } from "./chaos.js";
import type {
	PactFidelityViolation,
	PactLifecycle,
	PactWorld,
} from "./pact-chaos.js";

/**
 * Faults that let the inner call through and corrupt only the response, so the
 * provider applied the write and the client never learned. Everything else
 * aborts before the provider sees anything.
 *
 * The matrix does not rely on this list to decide what to expect — it observes
 * the world's actual state instead — but it reports it so a failure says which
 * side of the write the fault landed on.
 */
export const WRITE_REACHING_FAULTS: readonly ChaosFault[] = Object.freeze([
	"truncated-body",
	"malformed-body",
]);

export type PactChaosScenarioKind =
	/** One fault, then a clean retry. */
	| "single"
	/** A fault on the retry as well, then a clean third attempt. */
	| "double"
	/** Converge cleanly, then fault the teardown and retry it. */
	| "teardown";

export interface PactChaosRun {
	/** The convergent operation: upsert, apply, reconcile. May reject. */
	readonly converge: () => Promise<void>;
	/** What the provider holds now. Length is the convergence assertion. */
	readonly observe: () => Promise<readonly unknown[]>;
	/** Teardown, if the driver has one. Enables the teardown scenarios. */
	readonly remove?: () => Promise<void>;
}

export interface PactChaosSubject {
	/** Names the driver in failure output. */
	readonly label: string;
	readonly lifecycle: PactLifecycle;
	/** Builds a fresh world for one scenario. */
	readonly world: (lifecycle: PactLifecycle) => PactWorld;
	/**
	 * Binds the driver to a transport the runner has already wrapped in chaos.
	 *
	 * The runner owns the wrapping because the fault schedule is indexed by call
	 * number across the whole scenario; a subject that wrapped its own transport
	 * would restart that count.
	 */
	readonly bind: (bound: {
		readonly transport: HttpTransport;
		readonly fetchImpl: typeof fetch;
	}) => PactChaosRun;
}

export interface PactChaosScenarioResult {
	readonly label: string;
	readonly kind: PactChaosScenarioKind;
	readonly fault: ChaosFault;
	readonly at: number;
	/** Did the faulted attempt reject, or return despite the fault? */
	readonly firstRejected: boolean;
	/** Did the write reach the provider before the fault fired? */
	readonly writeLanded: boolean;
	readonly createsBeforeRetry: number;
	readonly createsAfterRetry: number;
	readonly observedAfterRetry: number;
	readonly finalState: string;
	readonly fidelity: readonly PactFidelityViolation[];
	readonly violations: readonly string[];
}

/** A `fetch` over an already-wrapped transport, for drivers that take `fetchImpl`. */
export function fetchFromTransport(transport: HttpTransport): typeof fetch {
	return async (input, init) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url;
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((value, key) => {
			headers[key] = value;
		});
		const request: TransportRequest = {
			method: (
				init?.method ?? "GET"
			).toUpperCase() as TransportRequest["method"],
			url,
			headers,
			timeoutMs: 5_000,
			maxResponseBytes: 256 * 1024,
			...(typeof init?.body === "string" ? { body: init.body } : {}),
		};
		const response = await transport(request);
		return new Response(response.body, {
			status: response.status,
			headers: response.headers as HeadersInit,
		});
	};
}

/** How many calls the driver makes with nothing going wrong. */
export async function baselineCallCount(
	subject: PactChaosSubject,
): Promise<number> {
	const world = subject.world(subject.lifecycle);
	const run = subject.bind({
		transport: world.transport,
		fetchImpl: world.fetchImpl,
	});
	await run.converge();
	return world.calls.length;
}

/**
 * Every fault at every call index, plus the double-fault and teardown
 * scenarios the index sweep cannot express.
 *
 * All six faults are swept, not just the five ambiguous ones. `rate-limited`
 * is unambiguous — a 429 means nothing was applied — but "unambiguous" is a
 * claim about the provider, not about the driver, and a driver that treats a
 * 429 as fatal, or retries it into a duplicate, fails here rather than in
 * production.
 */
export async function runPactChaosMatrix(
	subject: PactChaosSubject,
): Promise<readonly PactChaosScenarioResult[]> {
	const callCount = await baselineCallCount(subject);
	const results: PactChaosScenarioResult[] = [];

	for (const fault of CHAOS_FAULTS) {
		for (let at = 0; at < callCount; at += 1) {
			results.push(await runSingle(subject, fault, at));
		}
		results.push(await runDouble(subject, fault, callCount));
		// Teardown indices count from the start of the teardown: a read-then-delete
		// driver makes the delete its call 1, and call 0 is the lookup.
		for (const at of [0, 1]) {
			const teardown = await runTeardown(subject, fault, at);
			if (teardown) results.push(teardown);
		}
	}

	return results;
}

/** Faults one call, retries clean, and asks whether the world converged. */
async function runSingle(
	subject: PactChaosSubject,
	fault: ChaosFault,
	at: number,
): Promise<PactChaosScenarioResult> {
	const world = subject.world(subject.lifecycle);
	// Every call goes through the chaos transport, including the retry's. Gating
	// it per attempt instead would restart chaos's own call counter against the
	// world's, so a fault scheduled for "call 3" would fire on some other call.
	// Only the scheduled index faults; the rest pass straight through.
	const seen: DriverObservation = {
		createsAfterFailedRead: 0,
		createsAfterKnownPresent: 0,
	};
	const faulted = chaosTransport(world.transport, [{ at, fault }]);
	const run = subject.bind(
		bound(() => faulted.transport, subject.lifecycle, seen),
	);

	const firstRejected = await rejected(run.converge);
	const writeLanded = world.state() === subject.lifecycle.created;
	const createsBeforeRetry = world.countCreates();

	const retryRejected = await rejected(run.converge);
	const observed = await run.observe().catch(() => []);

	return finish({
		subject,
		seen,
		kind: "single",
		fault,
		at,
		world,
		firstRejected,
		writeLanded,
		createsBeforeRetry,
		retryRejected,
		observed,
		extra: [],
	});
}

/**
 * The scenario an index sweep cannot reach: the recovery itself fails.
 *
 * A driver that caches "I already looked and it was absent" across attempts
 * converges under a single fault and duplicates under two. Only this shape
 * finds that.
 *
 * The second fault is scheduled for the call right after the write, which is
 * the recovery's first call for any driver whose write is its last call — true
 * of read-then-write drivers, which is what this lane is for. For a driver that
 * keeps calling after its write, that index lands inside the first attempt
 * instead; the scenario is still a real two-fault run, and `at` is reported so
 * the failure is reproducible either way.
 */
async function runDouble(
	subject: PactChaosSubject,
	fault: ChaosFault,
	callCount: number,
): Promise<PactChaosScenarioResult> {
	const world = subject.world(subject.lifecycle);
	const writeIndex = Math.max(0, callCount - 1);
	const seen: DriverObservation = {
		createsAfterFailedRead: 0,
		createsAfterKnownPresent: 0,
	};
	const faulted = chaosTransport(world.transport, [
		{ at: writeIndex, fault },
		{ at: writeIndex + 1, fault },
	]);
	const run = subject.bind(
		bound(() => faulted.transport, subject.lifecycle, seen),
	);

	const firstRejected = await rejected(run.converge);
	const writeLanded = world.state() === subject.lifecycle.created;
	const createsBeforeRetry = world.countCreates();

	await rejected(run.converge); // the second, also-faulted attempt
	const retryRejected = await rejected(run.converge);
	const observed = await run.observe().catch(() => []);

	return finish({
		subject,
		seen,
		kind: "double",
		fault,
		at: writeIndex,
		world,
		firstRejected,
		writeLanded,
		createsBeforeRetry,
		retryRejected,
		observed,
		extra: [],
	});
}

/**
 * Converge cleanly, then fault the teardown.
 *
 * "Already gone is success" is the delete-side twin of read-or-create, and it
 * is the property that decides whether a failed `hobo down` can be re-run or
 * leaves an operator to clean up by hand.
 *
 * The teardown phase gets its own chaos transport so the fault index counts
 * from the start of the teardown rather than from the start of the run — the
 * converge that precedes it makes a driver-dependent number of calls, and an
 * absolute index would land somewhere different for every subject.
 */
async function runTeardown(
	subject: PactChaosSubject,
	fault: ChaosFault,
	at: number,
): Promise<PactChaosScenarioResult | undefined> {
	const world = subject.world(subject.lifecycle);
	let active: HttpTransport = world.transport;
	const seen: DriverObservation = {
		createsAfterFailedRead: 0,
		createsAfterKnownPresent: 0,
	};
	const run = subject.bind(bound(() => active, subject.lifecycle, seen));
	if (!run.remove) return undefined;

	await run.converge();

	const faulted = chaosTransport(world.transport, [{ at, fault }]);
	active = faulted.transport;
	const firstRejected = await rejected(run.remove);

	active = world.transport;
	const retryRejected = await rejected(run.remove);
	const observed = await run.observe().catch(() => []);

	const violations: string[] = [];
	if (retryRejected) {
		violations.push(
			"the second teardown rejected — a delete that finds nothing must succeed, or a failed teardown can never be re-run",
		);
	}
	if (observed.length !== 0) {
		violations.push(
			`teardown left ${observed.length} resource(s) behind after a retry`,
		);
	}
	if (world.state() === subject.lifecycle.created) {
		violations.push(
			`teardown returned but the world is still in state ${JSON.stringify(world.state())}`,
		);
	}
	for (const v of world.fidelityViolations()) {
		violations.push(
			`call ${v.callIndex} ${v.method} ${v.path}: ${v.kind} — ${v.detail}`,
		);
	}

	return {
		label: subject.label,
		kind: "teardown",
		fault,
		at,
		firstRejected,
		writeLanded: true,
		createsBeforeRetry: world.countCreates(),
		createsAfterRetry: world.countCreates(),
		observedAfterRetry: observed.length,
		finalState: world.state(),
		fidelity: world.fidelityViolations(),
		violations: Object.freeze(violations),
	};
}

/**
 * What the driver actually experienced, observed from outside the chaos wrapper.
 *
 * This has to sit here rather than on the world, because the world never sees
 * the calls chaos aborts — a `network-error` or an injected 500 is answered by
 * the wrapper and the inner transport is never reached. A counter inside the
 * world would therefore report zero for exactly the scenarios that matter and
 * read, wrongly, as complete.
 */
interface DriverObservation {
	/** Create-shaped calls issued when the last answer the driver got was an error. */
	createsAfterFailedRead: number;
	/** Create-shaped calls issued when the last answer showed the resource present. */
	createsAfterKnownPresent: number;
}

/**
 * One indirection so a scenario can swap which transport is live between
 * phases while the driver stays bound to a single object, and so every
 * request/response pair the driver saw can be classified.
 */
function bound(
	active: () => HttpTransport,
	lifecycle: PactLifecycle,
	seen: DriverObservation,
): { transport: HttpTransport; fetchImpl: typeof fetch } {
	let lastFailed = false;
	let lastShowedPresent = false;

	const transport: HttpTransport = async (request) => {
		const url = new URL(request.url);
		const selector = `${request.method} ${url.pathname}${url.search}`;
		if (lifecycle.creates.includes(selector)) {
			if (lastFailed) seen.createsAfterFailedRead += 1;
			if (lastShowedPresent) seen.createsAfterKnownPresent += 1;
		}
		try {
			const response = await active()(request);
			lastFailed = response.status >= 300;
			lastShowedPresent = !lastFailed && showsPresent(response.body);
			return response;
		} catch (error) {
			// A thrown transport error is the strongest form of "you did not learn
			// anything" — treated the same as a 5xx for the purpose of deciding
			// whether a following create was justified.
			lastFailed = true;
			lastShowedPresent = false;
			throw error;
		}
	};
	return { transport, fetchImpl: fetchFromTransport(transport) };
}

/**
 * Did this response body show the driver a resource that already exists?
 *
 * Deliberately shallow: any non-empty array anywhere in the payload. A read
 * that came back holding records is a read that said "present", whatever the
 * provider calls its envelope, and being provider-agnostic here is what lets
 * one rule cover every subject.
 */
function showsPresent(body: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body) as unknown;
	} catch {
		return false;
	}
	let present = false;
	const visit = (node: unknown): void => {
		if (present) return;
		if (Array.isArray(node)) {
			if (node.length > 0) present = true;
			return;
		}
		if (typeof node === "object" && node !== null) {
			for (const value of Object.values(node)) visit(value);
		}
	};
	visit(parsed);
	return present;
}

async function rejected(op: () => Promise<unknown>): Promise<boolean> {
	try {
		await op();
		return false;
	} catch {
		return true;
	}
}

function finish(input: {
	subject: PactChaosSubject;
	seen: DriverObservation;
	kind: PactChaosScenarioKind;
	fault: ChaosFault;
	at: number;
	world: PactWorld;
	firstRejected: boolean;
	writeLanded: boolean;
	createsBeforeRetry: number;
	retryRejected: boolean;
	observed: readonly unknown[];
	extra: readonly string[];
}): PactChaosScenarioResult {
	const { world, subject } = input;
	const createsAfterRetry = world.countCreates();
	const fidelity = world.fidelityViolations();
	const violations: string[] = [...input.extra];

	if (input.retryRejected) {
		violations.push(
			"the retry itself rejected — after a failure a driver must be able to look and adopt",
		);
	}
	if (input.observed.length > 1) {
		violations.push(
			`retry left ${input.observed.length} resources; a failure must converge to 1`,
		);
	}
	if (!input.retryRejected && input.observed.length === 0) {
		violations.push(
			"the retry reported success but the provider holds nothing — the driver believes it converged and it did not",
		);
	}
	if (input.writeLanded && createsAfterRetry > input.createsBeforeRetry) {
		violations.push(
			`the write landed before the fault but the retry issued another create (${input.createsBeforeRetry} -> ${createsAfterRetry}); it must read first and adopt`,
		);
	}
	if (!input.retryRejected && world.state() !== subject.lifecycle.created) {
		violations.push(
			`the retry reported success but the world is in state ${JSON.stringify(world.state())}, not ${JSON.stringify(subject.lifecycle.created)}`,
		);
	}
	if (input.seen.createsAfterFailedRead > 0) {
		violations.push(
			`issued ${input.seen.createsAfterFailedRead} create(s) straight after a read that failed — a failed lookup is not evidence the resource is absent, and treating it as one is how a retry duplicates`,
		);
	}
	if (input.seen.createsAfterKnownPresent > 0) {
		violations.push(
			`issued ${input.seen.createsAfterKnownPresent} create(s) after a read that showed the resource already present — the retry must adopt, not create`,
		);
	}
	for (const v of fidelity) {
		violations.push(
			`call ${v.callIndex} ${v.method} ${v.path}: ${v.kind} — ${v.detail}`,
		);
	}

	return {
		label: subject.label,
		kind: input.kind,
		fault: input.fault,
		at: input.at,
		firstRejected: input.firstRejected,
		writeLanded: input.writeLanded,
		createsBeforeRetry: input.createsBeforeRetry,
		createsAfterRetry,
		observedAfterRetry: input.observed.length,
		finalState: world.state(),
		fidelity,
		violations: Object.freeze(violations),
	};
}

/** Every violation across a matrix, formatted for one assertion. */
export function pactChaosViolations(
	results: readonly PactChaosScenarioResult[],
): readonly string[] {
	return results.flatMap((r) =>
		r.violations.map((v) => `${r.label} [${r.kind} ${r.fault} @${r.at}]: ${v}`),
	);
}
