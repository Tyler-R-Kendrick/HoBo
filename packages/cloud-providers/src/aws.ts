/**
 * AWS: the default Yard, plus the slot factories for authoring your own.
 *
 * `Yard()` returns everything AWS *can* allocate — a catalog, not a selection.
 * Which offering a given resource gets is decided later, by ADR-0151 selection,
 * against the requirements the app actually states.
 *
 * HONEST SCOPE: `@hobo/provider-aws` ships no deployment resolvers, so nothing
 * here deploys. A deploy against this Yard fails closed at resolution until
 * Resource Definitions and resolvers land for the `aws.*` product ids.
 */
import { type AwsYardSpecOptions, awsYardSpec } from "@hobo/provider-aws";
import type { Yard as ParsedYard } from "@hobo/yards";

import {
	type ComposedYardOptions,
	composeYard,
	regionOption,
} from "./compose.js";

export {
	DYNAMODB_BILLING_MODES,
	type DynamodbBillingMode,
	type DynamodbOptions,
	dynamodb,
	EKS_SERVICE_TYPES,
	type EksDeploymentOptions,
	type EksResourceQuantities,
	type EksServiceType,
	eks,
	LAMBDA_ARCHITECTURES,
	type LambdaArchitecture,
	type LambdaOptions,
	lambda,
	type RdsPostgresOptions,
	rds,
	S3_STORAGE_CLASSES,
	type S3Options,
	type S3StorageClass,
	type SqsOptions,
	s3,
	sqs,
} from "@hobo/provider-aws";

/** Yard name used when the caller does not supply one. */
// public-contract: the name every default AWS Yard is registered under; changing it renames them all.
export const DEFAULT_AWS_YARD_NAME = "aws";

export interface AwsYardOptions
	extends ComposedYardOptions,
		AwsYardSpecOptions {}

/** The default AWS Yard: the full allocatable catalog, parsed and canonical. */
export function Yard(options: AwsYardOptions = {}): ParsedYard {
	return composeYard(
		DEFAULT_AWS_YARD_NAME,
		awsYardSpec(regionOption(options.regions)),
		options,
	);
}
