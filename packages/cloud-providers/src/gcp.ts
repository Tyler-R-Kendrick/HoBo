/**
 * GCP: the default Yard, plus the slot factories for authoring your own.
 *
 * `Yard()` returns everything GCP *can* allocate — a catalog, not a selection.
 * Which offering a given resource gets is decided later, by ADR-0151 selection,
 * against the requirements the app actually states.
 *
 * HONEST SCOPE: `@hobo/provider-gcp` ships no deployment resolvers, so nothing
 * here deploys. A deploy against this Yard fails closed at resolution until
 * Resource Definitions and resolvers land for the `gcp.*` product ids.
 */
import { type GcpYardSpecOptions, gcpYardSpec } from "@hobo/provider-gcp";
import type { Yard as ParsedYard } from "@hobo/yards";

import {
	type ComposedYardOptions,
	composeYard,
	regionOption,
} from "./compose.js";

export {
	type ApiGatewayOptions,
	type AppEngineOptions,
	apiGateway,
	appEngine,
	CLOUD_FUNCTIONS_GENERATIONS,
	CLOUD_RUN_INGRESS,
	CLOUD_STORAGE_CLASSES,
	type CloudFunctionsGeneration,
	type CloudFunctionsOptions,
	type CloudRunIngress,
	type CloudRunJobOptions,
	type CloudRunOptions,
	type CloudSqlMysqlOptions,
	type CloudSqlPostgresOptions,
	type CloudStorageClass,
	type CloudStorageOptions,
	type CloudStorageSiteOptions,
	type CloudTasksOptions,
	cloudFunctions,
	cloudRun,
	cloudRunJob,
	cloudSqlMysql,
	cloudSqlPostgres,
	cloudStorage,
	cloudStorageSite,
	cloudTasks,
	FIRESTORE_MODES,
	type FirestoreMode,
	type FirestoreOptions,
	firestore,
	MEMORYSTORE_TIERS,
	type MemorystoreRedisOptions,
	type MemorystoreTier,
	memorystoreRedis,
	type PubsubOptions,
	pubsub,
	SECRET_MANAGER_REPLICATION,
	type SecretManagerOptions,
	type SecretManagerReplication,
	secretManager,
} from "@hobo/provider-gcp";

/** Yard name used when the caller does not supply one. */
// public-contract: the name every default GCP Yard is registered under; changing it renames them all.
export const DEFAULT_GCP_YARD_NAME = "gcp";

export interface GcpYardOptions
	extends ComposedYardOptions,
		GcpYardSpecOptions {}

/** The default GCP Yard: the full allocatable catalog, parsed and canonical. */
export function Yard(options: GcpYardOptions = {}): ParsedYard {
	return composeYard(
		DEFAULT_GCP_YARD_NAME,
		gcpYardSpec(regionOption(options.regions)),
		options,
	);
}
