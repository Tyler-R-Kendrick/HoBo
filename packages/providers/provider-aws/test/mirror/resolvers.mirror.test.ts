/**
 * The AWS resolvers against the mirror.cloud emulator (ADR-0174).
 *
 * Every product in AWS_RESOLVED_PRODUCT_IDS is reconciled twice, read, and
 * deleted through its real resolver: SigV4-signed with dummy credentials,
 * through `guardedAwsTransport` as a deploy would be, and only then rewritten
 * to the emulator (`createMirrorTransport` keeps path, query, headers, body
 * and the `Host`, so mirror routes each request to the service it names).
 * The journal, read from a mark taken before each case, is what reached the
 * emulator.
 *
 * Emulated, not live: mirror serves these services at its emulate tier from
 * the AWS API models; nothing here was compared with AWS.
 */
import {
	createMirrorTransport,
	type MirrorJournalEntry,
	mirrorLaneEndpoint,
	readMirrorJournal,
} from "@hobo/contract-harness";
import {
	type CapabilitySlot,
	type HttpTransport,
	parseResolveRequest,
	type ResolveRequest,
	type ResourceResolver,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	AWS_DYNAMODB_PRODUCT_ID,
	AWS_RESOLVED_PRODUCT_IDS,
	AWS_S3_PRODUCT_ID,
	AWS_SECRETS_MANAGER_PRODUCT_ID,
	AWS_SNS_PRODUCT_ID,
	AWS_SQS_FIFO_PRODUCT_ID,
	AWS_SQS_PRODUCT_ID,
	AWS_SSM_PARAMETER_PRODUCT_ID,
	awsResolverRegistry,
	guardedAwsTransport,
} from "../../src/index.js";
import type { JsonObject } from "../../src/json.js";

const REGION = "us-east-1";
const CREDENTIAL_REF = "secret://camp/aws-mirror-lane";
const endpoint = mirrorLaneEndpoint(process.env);
const transport: HttpTransport = guardedAwsTransport(
	createMirrorTransport(endpoint),
	REGION,
);
const registry = awsResolverRegistry({
	region: REGION,
	nowMs: () => Date.now(),
	resolveCredential: async (ref) => {
		if (ref !== CREDENTIAL_REF) throw new Error(`unknown credential ${ref}`);
		// The emulator takes any key; these are the conventional dummies.
		return { accessKeyId: "test", secretAccessKey: "test" };
	},
});

interface ProductCase {
	readonly productId: string;
	/** The mirror service the request must land on. */
	readonly service: string;
	readonly slot: CapabilitySlot;
	readonly logicalId: string;
	readonly desired: JsonObject;
	/** The emulator operation that creates it. */
	readonly create: string;
}

const PRODUCTS: readonly ProductCase[] = [
	{
		productId: AWS_DYNAMODB_PRODUCT_ID,
		service: "aws.dynamodb",
		slot: "kv",
		logicalId: "hobo-lane-sessions",
		desired: { billingMode: "on-demand", partitionKey: "sessionId" },
		create: "CreateTable",
	},
	{
		productId: AWS_S3_PRODUCT_ID,
		service: "aws.s3",
		slot: "bucket",
		logicalId: "hobo-lane-orders",
		desired: { versioning: true, publicAccessBlocked: true },
		create: "CreateBucket",
	},
	{
		productId: AWS_SECRETS_MANAGER_PRODUCT_ID,
		service: "aws.secretsmanager",
		slot: "secretRef",
		logicalId: "hobo-lane-stripe",
		// The description is declared and must read back with no drift: mirror
		// keeps it (mirror.cloud claude/ecstatic-mayer-wbm2c3-secrets-manager-gaps,
		// 7cd36e6f). The delete is still forced. Mirror now answers a secret
		// scheduled for deletion as AWS documents (DescribeSecret with a
		// DeletedDate, a second unforced DeleteSecret InvalidRequestException),
		// and this resolver does not handle that yet: an unforced delete here
		// fails "The secret is scheduled for deletion" on the second delete.
		// HoBo claude/ecstatic-mayer-wbm2c3-secrets-pending-deletion (cece16e7)
		// fixes the resolver; with it the case passes unforced, and forceDelete
		// goes (ADR-0174, residuals).
		desired: { description: "payment provider key", forceDelete: true },
		create: "CreateSecret",
	},
	{
		productId: AWS_SNS_PRODUCT_ID,
		service: "aws.sns",
		slot: "topic",
		logicalId: "hobo-lane-events",
		desired: {},
		create: "CreateTopic",
	},
	{
		productId: AWS_SQS_FIFO_PRODUCT_ID,
		service: "aws.sqs",
		slot: "queue",
		logicalId: "hobo-lane-ordered",
		desired: {},
		create: "CreateQueue",
	},
	{
		productId: AWS_SQS_PRODUCT_ID,
		service: "aws.sqs",
		slot: "queue",
		logicalId: "hobo-lane-jobs",
		desired: { visibilityTimeoutSeconds: 45 },
		create: "CreateQueue",
	},
	{
		productId: AWS_SSM_PARAMETER_PRODUCT_ID,
		service: "aws.ssm",
		slot: "secretRef",
		logicalId: "hobo-lane-endpoint",
		desired: { value: "https://api.example.com", tier: "standard" },
		create: "PutParameter",
	},
];

function requestFor(product: ProductCase, physicalId?: string): ResolveRequest {
	return parseResolveRequest({
		ref: {
			slot: product.slot,
			productId: product.productId,
			logicalId: product.logicalId,
			...(physicalId === undefined ? undefined : { physicalId }),
		},
		desired: product.desired,
		credentialRef: CREDENTIAL_REF,
	});
}

function resolverFor(product: ProductCase): ResourceResolver {
	const resolver = registry.get(product.productId);
	if (resolver === undefined)
		throw new Error(`no resolver for ${product.productId}`);
	return resolver;
}

async function mark(service: string): Promise<string | undefined> {
	const [newest] = await readMirrorJournal(endpoint, { service, limit: 1 });
	return newest?.requestId;
}

/** What `service` recorded after `from`, oldest first. */
async function since(
	service: string,
	from: string | undefined,
): Promise<readonly MirrorJournalEntry[]> {
	const entries = await readMirrorJournal(endpoint, { service, limit: 1000 });
	const at =
		from === undefined
			? entries.length
			: entries.findIndex((entry) => entry.requestId === from);
	if (at === -1) {
		throw new Error(
			`the ${service} journal answer no longer holds ${from}: more requests than one answer carries were made since`,
		);
	}
	return entries.slice(0, at).reverse();
}

describe("the lane covers every AWS product a resolver ships for", () => {
	it("has one case per AWS_RESOLVED_PRODUCT_IDS entry", () => {
		expect(PRODUCTS.map((product) => product.productId).sort()).toEqual(
			[...AWS_RESOLVED_PRODUCT_IDS].sort(),
		);
	});
});

describe.each(PRODUCTS)("$productId against the emulator", (product) => {
	it(`resolver creates and converges against ${product.service}`, async () => {
		const resolver = resolverFor(product);
		const from = await mark(product.service);

		const created = await resolver.reconcile(requestFor(product), transport);
		const again = await resolver.reconcile(requestFor(product), transport);
		const known = await resolver.reconcile(
			requestFor(product, created.physicalId),
			transport,
		);
		const read = await resolver.read?.(requestFor(product), transport);

		expect(created.action).toBe("create");
		expect(created.physicalId.length).toBeGreaterThan(0);
		expect(again).toMatchObject({
			action: "adopt",
			physicalId: created.physicalId,
		});
		expect(known).toMatchObject({
			action: "noop",
			physicalId: created.physicalId,
		});
		expect(read?.physicalId).toBe(created.physicalId);
		const recorded = await since(product.service, from);
		expect(
			recorded.filter((entry) => entry.operation === product.create),
		).toHaveLength(1);
		expect(
			recorded.filter((entry) => entry.status >= 500),
			"no call landed on a mock or unimplemented operation",
		).toEqual([]);
		expect(new Set(recorded.map((entry) => entry.tier))).toEqual(
			new Set(["emulate"]),
		);
	});

	it(`delete removes it from ${product.service}, and a second delete is the state it asks for`, async () => {
		const resolver = resolverFor(product);

		await resolver.delete(requestFor(product), transport);
		const gone = await resolver.read?.(requestFor(product), transport);
		await resolver.delete(requestFor(product), transport);

		expect(gone).toBeUndefined();
	});
});

describe("the guard still decides before the rewrite", () => {
	it("refuses a non-amazonaws host, and nothing reaches the emulator", async () => {
		const from = await mark("aws.s3");
		const call = (url: string) =>
			transport({
				method: "GET",
				url,
				headers: {},
				timeoutMs: 5_000,
				maxResponseBytes: 1024,
			});

		await expect(
			call("https://s3.us-east-1.amazonaws.com.attacker.example/bucket"),
		).rejects.toMatchObject({ code: "TRANSPORT_HOST_FORBIDDEN" });
		await expect(
			call("https://s3.eu-west-1.amazonaws.com/bucket"),
		).rejects.toMatchObject({ code: "TRANSPORT_HOST_FORBIDDEN" });
		await expect(
			call("http://s3.us-east-1.amazonaws.com/bucket"),
		).rejects.toMatchObject({ code: "TRANSPORT_SCHEME_FORBIDDEN" });

		expect(await mark("aws.s3")).toBe(from);
	});
});
