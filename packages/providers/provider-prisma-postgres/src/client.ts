/**
 * Idempotency and adoption for a CLI-shaped provider.
 *
 * Prisma's claimable databases have no documented read-by-id API, so there is
 * nothing to GET after an ambiguous create. That makes the local journal the
 * *only* record of what a previous attempt produced, and makes running the CLI
 * a second time for the same intent strictly worse than failing: it mints a
 * second anonymous project that nobody can find or reap.
 *
 * So: one CLI run per idempotency key, ever. A repeat call adopts the recorded
 * snapshot or raises `PROVIDER_OPERATION_AMBIGUOUS`.
 */
import {
	assertBoundedOutput,
	buildCreateDbArgv,
	type CreateDbInvocationInput,
	createDbEnv,
	type ProcessRunner,
} from "./cli.js";
import { PrismaProviderError, redactProviderText } from "./errors.js";
import {
	type CreateDbOutputMode,
	type PrismaCreateResult,
	parseCreateDbHumanV1,
	parseCreateDbJson,
} from "./output.js";

export type IdempotencyState = "in-flight" | "created" | "failed";

/**
 * The adoptable snapshot. It holds a SecretRef, never the credential, so the
 * journal is safe to persist next to a plan.
 */
export type PrismaResourceSnapshot = {
	readonly projectId: string;
	readonly claimUrl: string;
	readonly region: string;
	readonly name: string;
	readonly deletionDateIso: string;
	readonly deletionDateMs: number;
	readonly host: string;
	readonly port: number;
	readonly databaseName: string;
	readonly tls: boolean;
	readonly credentialRef: string;
};

export type IdempotencyRecord = {
	readonly key: string;
	readonly state: IdempotencyState;
	readonly attemptedAtMs: number;
	readonly snapshot?: PrismaResourceSnapshot;
};

export interface IdempotencyStore {
	get(key: string): Promise<IdempotencyRecord | undefined>;
	put(record: IdempotencyRecord): Promise<void>;
}

export function createInMemoryIdempotencyStore(
	seed: readonly IdempotencyRecord[] = [],
): IdempotencyStore {
	const records = new Map<string, IdempotencyRecord>(
		seed.map((record) => [record.key, record]),
	);
	return {
		async get(key) {
			return records.get(key);
		},
		async put(record) {
			records.set(record.key, record);
		},
	};
}

export type PrismaClientOptions = {
	readonly runner: ProcessRunner;
	readonly store: IdempotencyStore;
	readonly clock: () => number;
	readonly invocation?: CreateDbInvocationInput;
	readonly outputMode?: CreateDbOutputMode;
	readonly env?: Readonly<Record<string, string>>;
};

export type CreateInput = {
	readonly idempotencyKey: string;
	readonly region?: CreateDbInvocationInput["region"];
	readonly ttl?: string;
};

export type CreateOutcome =
	| {
			readonly kind: "created";
			readonly result: PrismaCreateResult;
			readonly argv: readonly string[];
	  }
	| { readonly kind: "adopted"; readonly snapshot: PrismaResourceSnapshot };

/**
 * What the journal knows about an intent.
 *
 * `unresolved` is the interesting one: a run started and never came back. It is
 * reported rather than collapsed into `unknown` because the two demand opposite
 * responses — an unknown key is safe to create, an unresolved one is not.
 */
export type ObserveOutcome =
	| { readonly kind: "known"; readonly snapshot: PrismaResourceSnapshot }
	| { readonly kind: "unresolved"; readonly attemptedAtMs: number }
	| { readonly kind: "failed"; readonly attemptedAtMs: number }
	| { readonly kind: "unknown" };

export type PrismaClient = {
	create(input: CreateInput): Promise<CreateOutcome>;
	/**
	 * Read the journal. This is the *whole* observation surface: Prisma
	 * documents no read-by-id endpoint for a claimable database, so there is
	 * no provider call that could confirm or contradict what is recorded here.
	 */
	observe(key: string): Promise<ObserveOutcome>;
	recordSnapshot(key: string, snapshot: PrismaResourceSnapshot): Promise<void>;
	markFailed(key: string): Promise<void>;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export function createPrismaClient(options: PrismaClientOptions): PrismaClient {
	const outputMode = options.outputMode ?? "json";

	return {
		async recordSnapshot(key, snapshot) {
			await options.store.put({
				key,
				state: "created",
				attemptedAtMs: options.clock(),
				snapshot,
			});
		},

		async markFailed(key) {
			await options.store.put({
				key,
				state: "failed",
				attemptedAtMs: options.clock(),
			});
		},

		async observe(key) {
			const record = await options.store.get(key);
			if (record === undefined) return { kind: "unknown" };
			if (record.snapshot !== undefined) {
				return { kind: "known", snapshot: record.snapshot };
			}
			if (record.state === "in-flight") {
				return { kind: "unresolved", attemptedAtMs: record.attemptedAtMs };
			}
			return { kind: "failed", attemptedAtMs: record.attemptedAtMs };
		},

		async create(input) {
			if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
				throw new PrismaProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					"idempotency key must be 8-128 identifier characters",
				);
			}

			const existing = await options.store.get(input.idempotencyKey);
			if (existing?.snapshot !== undefined) {
				return { kind: "adopted", snapshot: existing.snapshot };
			}
			if (existing?.state === "in-flight") {
				throw new PrismaProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					"a previous create-db run with this idempotency key did not resolve; Prisma exposes no read-by-id API, so a second run would orphan an unreachable project",
					{
						detail: {
							idempotencyKey: input.idempotencyKey,
							attemptedAtMs: existing.attemptedAtMs,
						},
					},
				);
			}

			const invocation = buildCreateDbArgv({
				...options.invocation,
				...(input.region !== undefined ? { region: input.region } : {}),
				...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
				json: outputMode === "json",
			});

			await options.store.put({
				key: input.idempotencyKey,
				state: "in-flight",
				attemptedAtMs: options.clock(),
			});

			let result: Awaited<ReturnType<ProcessRunner["run"]>>;
			try {
				result = await options.runner.run(invocation.argv, {
					env: createDbEnv(options.env),
					timeoutMs: invocation.timeoutMs,
				});
			} catch (cause) {
				// Left in-flight on purpose.
				throw new PrismaProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					"the create-db run did not complete; a project may or may not exist",
					{ cause, detail: { idempotencyKey: input.idempotencyKey } },
				);
			}

			assertBoundedOutput(result.stdout, invocation.maxOutputBytes, "stdout");
			assertBoundedOutput(result.stderr, invocation.maxOutputBytes, "stderr");

			if (result.code !== 0 && result.stdout.trim().length === 0) {
				// No document to read, so nothing proves whether the service
				// was reached. Ambiguous, and the key stays in-flight.
				throw new PrismaProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`create-db exited with code ${result.code} and printed no result document: ${redactProviderText(result.stderr, 160)}`,
					{
						detail: { code: result.code, idempotencyKey: input.idempotencyKey },
					},
				);
			}

			let parsed: PrismaCreateResult;
			try {
				parsed =
					outputMode === "json"
						? parseCreateDbJson(result.stdout)
						: parseCreateDbHumanV1(result.stdout, {
								region:
									input.region ?? options.invocation?.region ?? "us-east-1",
							});
			} catch (error) {
				// A parsed failure document is a definite non-create; a parse
				// error on a zero-exit run is a contract change. Neither
				// created something we can point at, so release the key only
				// when the CLI itself reported failure.
				if (
					error instanceof PrismaProviderError &&
					error.code !== "PROVIDER_OPERATION_AMBIGUOUS"
				) {
					await options.store.put({
						key: input.idempotencyKey,
						state: "failed",
						attemptedAtMs: options.clock(),
					});
				}
				throw error;
			}

			return { kind: "created", result: parsed, argv: invocation.argv };
		},
	};
}
