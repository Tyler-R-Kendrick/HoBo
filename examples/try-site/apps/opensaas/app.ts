import { bindle } from "@hobo/bindles";

/**
 * HoBo packaging Bindle for real Wasp Open-SaaS
 * (examples/wasp-opensaas/app — wasp new -t saas).
 *
 * Deploy path: local Docker bridge onto Webernetes/Lakebed stations.
 * Not a browser WIT try-runtime kit.
 */
export default bindle(
	"opensaas",
	{ require: ["http", "container"], runtimes: ["oci"] },
	(b) => {
		const db = b.container({
			image: "postgres:16-alpine",
			endpoints: { sql: { port: 5432 } },
		});
		const web = b.service().dependsOn(db);
		return { db, web };
	},
);
