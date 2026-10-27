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
	private key(component: "queue" | "schedule" | "repair") {
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
	async ready(): Promise<boolean> {
		const result = await this.pool.query<{ count: string }>(
			`SELECT count(*) FROM hobo_ci_worker_health
			 WHERE component = ANY($1::text[])
			 AND success_at > clock_timestamp() - interval '45 minutes'
			 AND (failure_at IS NULL OR success_at > failure_at)`,
			[[this.key("queue"), this.key("schedule"), this.key("repair")]],
		);
		return Number(result.rows[0]?.count) === 3;
	}
}
