/**
 * Typed AWS offering factories for Yard slot bindings.
 *
 * Why this module exists: authoring a slot binding by hand means typing a
 * capability-profile string, a product id, and an untyped property bag — three
 * independent chances to make a typo that only surfaces at resolution time.
 * Each factory here owns exactly one `(slot, profile, productId)` triple and
 * takes a per-product options interface, so the profile string is never typed
 * by an operator and a misspelled option name is a compile error.
 *
 * Every factory returns `slotBinding()` from `@hobo/core`; none of them build a
 * binding record by hand. The core parse boundary — credential screening,
 * JSON-safety, freezing, key ordering — therefore applies to every binding
 * produced here, and this module adds no parse rules of its own.
 *
 * No defaults are invented. A default replica count or instance class quietly
 * deployed on the caller's behalf would misreport what they asked for, so an
 * omitted option is simply absent from `properties` and the Resource
 * Definition decides.
 *
 * HONEST SCOPE: the `productId` values below are the ids these factories
 * *emit*. Whether a matching Resource Definition is registered in the catalog
 * is checked at resolution time (`YARD_BINDING_PRODUCT_UNKNOWN`), not here — a
 * successful call is not evidence that the product exists in the catalog
 * today, and several of these products are not registered yet.
 */
import { type SlotBinding, slotBinding } from "@hobo/core";

/**
 * Forwards the caller's option bag to the parse boundary, dropping only keys
 * whose value is `undefined` (an omitted option must be absent, not an
 * explicit `undefined`, under `exactOptionalPropertyTypes` and JSON-safety).
 *
 * Every remaining key is passed through — including one the option types do
 * not declare — so a key smuggled past the types reaches `slotBinding()` and
 * is screened there. Cherry-picking the known keys instead would silently
 * swallow it, which is exactly the kind of quiet drop this repo refuses.
 */
function present<T extends object>(options: T): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (value === undefined) {
			continue;
		}
		out[key] =
			typeof value === "object" && value !== null && !Array.isArray(value)
				? present(value)
				: value;
	}
	return out;
}

/** Amazon S3 storage classes this factory can request. */
export const S3_STORAGE_CLASSES = Object.freeze([
	"standard",
	"intelligent-tiering",
	"glacier-ir",
] as const);

export type S3StorageClass = (typeof S3_STORAGE_CLASSES)[number];

export interface S3Options {
	readonly versioning?: boolean;
	readonly publicAccessBlocked?: boolean;
	readonly storageClass?: S3StorageClass;
}

/** Amazon S3 bucket — slot `bucket`, profile `bucket.s3-compatible/v1`. */
export function s3(options?: S3Options): SlotBinding {
	return slotBinding({
		slot: "bucket",
		profile: "bucket.s3-compatible/v1",
		productId: "aws.s3/v1",
		properties: present(options ?? {}),
	});
}

export interface RdsPostgresOptions {
	readonly instanceClass?: string;
	readonly multiAz?: boolean;
	readonly storageGb?: number;
	readonly engineVersion?: string;
}

/** Amazon RDS for PostgreSQL — slot `data`, profile `data.postgres/v1`. */
function rdsPostgres(options?: RdsPostgresOptions): SlotBinding {
	return slotBinding({
		slot: "data",
		profile: "data.postgres/v1",
		productId: "aws.rds-postgres/v1",
		properties: present(options ?? {}),
	});
}

/** RDS engine namespace, so the call site reads `rds.postgres({ … })`. */
export const rds = Object.freeze({ postgres: rdsPostgres });

/** DynamoDB billing modes this factory can request. */
export const DYNAMODB_BILLING_MODES = Object.freeze([
	"on-demand",
	"provisioned",
] as const);

export type DynamodbBillingMode = (typeof DYNAMODB_BILLING_MODES)[number];

export interface DynamodbOptions {
	readonly billingMode?: DynamodbBillingMode;
	readonly readCapacity?: number;
	readonly writeCapacity?: number;
}

/** Amazon DynamoDB table — slot `kv`, profile `kv.key-value/v1`. */
export function dynamodb(options?: DynamodbOptions): SlotBinding {
	return slotBinding({
		slot: "kv",
		profile: "kv.key-value/v1",
		productId: "aws.dynamodb/v1",
		properties: present(options ?? {}),
	});
}

export interface SqsOptions {
	readonly fifo?: boolean;
	readonly visibilityTimeoutSeconds?: number;
	readonly maxReceiveCount?: number;
}

/** Amazon SQS queue — slot `queue`, profile `queue.at-least-once/v1`. */
export function sqs(options?: SqsOptions): SlotBinding {
	return slotBinding({
		slot: "queue",
		profile: "queue.at-least-once/v1",
		productId: "aws.sqs/v1",
		properties: present(options ?? {}),
	});
}

/** Kubernetes service types an EKS deployment can front itself with. */
export const EKS_SERVICE_TYPES = Object.freeze([
	"ClusterIP",
	"LoadBalancer",
	"NodePort",
] as const);

export type EksServiceType = (typeof EKS_SERVICE_TYPES)[number];

/** Container compute quantities, kept as authored strings (`"500m"`, `"1Gi"`). */
export interface EksResourceQuantities {
	readonly cpu?: string;
	readonly memory?: string;
}

export interface EksDeploymentOptions {
	readonly replicas?: number;
	readonly service?: EksServiceType;
	readonly limits?: EksResourceQuantities;
	readonly requests?: EksResourceQuantities;
	readonly image?: string;
}

/** EKS Deployment + Service — slot `web`, profile `web.hosted/v1`. */
function eksDeployment(options?: EksDeploymentOptions): SlotBinding {
	return slotBinding({
		slot: "web",
		profile: "web.hosted/v1",
		productId: "aws.eks-deployment/v1",
		properties: present(options ?? {}),
	});
}

/** EKS workload namespace, so the call site reads `eks.deployment({ … })`. */
export const eks = Object.freeze({ deployment: eksDeployment });

/** Lambda instruction set architectures this factory can request. */
export const LAMBDA_ARCHITECTURES = Object.freeze(["x86_64", "arm64"] as const);

export type LambdaArchitecture = (typeof LAMBDA_ARCHITECTURES)[number];

export interface LambdaOptions {
	readonly memoryMb?: number;
	readonly timeoutSeconds?: number;
	readonly architecture?: LambdaArchitecture;
}

/** AWS Lambda function — slot `service`, profile `service.worker/v1`. */
export function lambda(options?: LambdaOptions): SlotBinding {
	return slotBinding({
		slot: "service",
		profile: "service.worker/v1",
		productId: "aws.lambda/v1",
		properties: present(options ?? {}),
	});
}
