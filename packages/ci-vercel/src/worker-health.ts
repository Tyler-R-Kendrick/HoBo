import type { Pool } from "pg";
import type { WorkerHealth } from "./worker.js";

/** PostgreSQL-backed liveness evidence, shared by independent function instances. */
export class PostgresWorkerHealth implements WorkerHealth {
	constructor(
		private readonly pool: Pool,
		private readonly deploymentId?: string,
	) {
		if (deploymentId && !/^dpl_[A-Za-z0-9]{1,128}$/.test(deploymentId))
			throw new Error("invalid worker deployment ID");
	}
	private key(
		component:
			| "queue"
			| "schedule"
			| "repair"
			| "repair-deliveries"
			| "repair-queued",
	) {
		return this.deploymentId ? `${this.deploymentId}:${component}` : component;
	}
	async initialize(): Promise<void> {
		await this.pool.query(`CREATE TABLE IF NOT EXISTS hobo_ci_worker_health (
			component text PRIMARY KEY, success_at timestamptz, failure_at timestamptz
		)`);
	}
	async mark(
		component: "queue" | "schedule" | "repair",
		ok: boolean,
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO hobo_ci_worker_health (component, success_at, failure_at)
			 VALUES ($1, CASE WHEN $2 THEN clock_timestamp() END,
			 CASE WHEN NOT $2 THEN clock_timestamp() END)
			 ON CONFLICT (component) DO UPDATE SET
			 success_at = GREATEST(hobo_ci_worker_health.success_at, EXCLUDED.success_at),
			 failure_at = GREATEST(hobo_ci_worker_health.failure_at, EXCLUDED.failure_at)`,
			[this.key(component), ok],
		);
	}
	/** Capture database time before attempting a scan. A delayed completion from
	 * an older callback must not overwrite newer failure evidence. */
	async startRepair(): Promise<string> {
		const result = await this.pool.query<{ started_at: string }>(
			"SELECT clock_timestamp()::text AS started_at",
		);
		const startedAt = result.rows[0]?.started_at;
		if (!startedAt || !Number.isFinite(Date.parse(startedAt)))
			throw new Error("repair clock unavailable");
		return startedAt;
	}
	async finishRepair(
		index: number,
		ok: boolean,
		startedAt: string,
	): Promise<void> {
		if ((index !== 0 && index !== 1) || !Number.isFinite(Date.parse(startedAt)))
			throw new Error("invalid repair evidence");
		const component = index === 0 ? "repair-deliveries" : "repair-queued";
		await this.pool.query(
			`INSERT INTO hobo_ci_worker_health (component, success_at, failure_at)
			 VALUES ($1, CASE WHEN $2 THEN $3::timestamptz END,
			 CASE WHEN NOT $2 THEN $3::timestamptz END)
			 ON CONFLICT (component) DO UPDATE SET
			 success_at = GREATEST(hobo_ci_worker_health.success_at, EXCLUDED.success_at),
			 failure_at = GREATEST(hobo_ci_worker_health.failure_at, EXCLUDED.failure_at)`,
			[this.key(component), ok, startedAt],
		);
	}
	/** Idle work may stop scheduling continuations only after this deployment
	 * has a recent completed scan newer than any failure. */
	async repairComplete(index: number): Promise<boolean> {
		if (index !== 0 && index !== 1) throw new Error("invalid repair index");
		const component = index === 0 ? "repair-deliveries" : "repair-queued";
		const result = await this.pool.query<{ count: string }>(
			`SELECT count(*) FROM hobo_ci_worker_health
			 WHERE component=$1 AND success_at > clock_timestamp() - interval '45 minutes'
			 AND (failure_at IS NULL OR success_at > failure_at)
			 AND success_at > COALESCE(
			   (SELECT failure_at FROM hobo_ci_worker_health WHERE component=$2),
			   '-infinity'::timestamptz)`,
			[this.key(component), this.key("repair")],
		);
		return Number(result.rows[0]?.count) === 1;
	}
	async ready(): Promise<boolean> {
		const result = await this.pool.query<{ count: string }>(
			`SELECT count(*) FROM hobo_ci_worker_health
			 WHERE component = ANY($1::text[])
			 AND success_at > clock_timestamp() - interval '45 minutes'
			 AND (failure_at IS NULL OR success_at > failure_at)
			 AND (component <> ALL($2::text[]) OR success_at > COALESCE(
			   (SELECT failure_at FROM hobo_ci_worker_health WHERE component=$3),
			   '-infinity'::timestamptz))`,
			[
				[
					this.key("queue"),
					this.key("schedule"),
					this.key("repair-deliveries"),
					this.key("repair-queued"),
				],
				[this.key("repair-deliveries"), this.key("repair-queued")],
				this.key("repair"),
			],
		);
		return Number(result.rows[0]?.count) === 4;
	}
}
