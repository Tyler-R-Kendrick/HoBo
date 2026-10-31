// The Secrets Manager resolver against a secret that is scheduled for deletion.
//
// DeleteSecret does not delete a secret: it schedules the deletion, at least 7
// and by default 30 days ahead, and until then the secret still exists under its
// name. The oracle is AWS's documentation, as the Secrets Manager API model
// (secrets-manager-2017-10-17) carries it:
//
//  - DescribeSecret answers the secret with `DeletedDate`, "The date the secret
//    is scheduled for deletion. If it is not scheduled for deletion, this field
//    is omitted."
//  - InvalidRequestException: "A parameter value is not valid for the current
//    state of the resource. Possible causes: The secret is scheduled for
//    deletion." That is what a second unforced DeleteSecret, an UpdateSecret, and
//    a CreateSecret of the same name answer while the deletion is pending.
//  - RestoreSecret "Cancels the scheduled deletion of a secret by removing the
//    DeletedDate time stamp. You can access a secret again after it has been
//    restored."
//  - ForceDeleteWithoutRecovery: "If you forcibly delete an already deleted or
//    nonexistent secret, the operation does not return
//    ResourceNotFoundException."
//
// So, for the resolver (ADR-0175): a scheduled secret still exists, and read
// reports it as being deleted ("scheduled for deletion until <date>") rather
// than absent. Someone deleted it on purpose, so reconcile fails closed unless
// the declaration says `restoreScheduled: true`, which restores it with its
// previous versions. A delete of it issues nothing more unless the declaration
// asks for a forced delete.
//
// HONEST SCOPE: the transport is a fake that models only those documented rules.
import {
	parseResolveRequest,
	ResolverError,
	type TransportRequest,
	type TransportResponse,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	AWS_SECRETS_MANAGER_PRODUCT_ID,
	awsResolverRegistry,
	guardedAwsTransport,
} from "../src/index.js";
import {
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonObject,
} from "../src/json.js";

const REGION = "us-east-1";
const ACCOUNT = "123456789012";
const CREDENTIAL_REF = "secret://camp/aws-deploy";
const NOW_MS = Date.parse("2026-03-04T05:06:07.000Z");
const DAY_SECONDS = 24 * 60 * 60;
const NAME = "hobo-stripe";

interface FakeSecret {
	description: string | undefined;
	/** Epoch seconds, as AWS's JSON protocol answers a timestamp; unset when not scheduled. */
	deletedDate: number | undefined;
}

function reply(status: number, value: JsonValue): TransportResponse {
	return { status, headers: {}, body: JSON.stringify(value) };
}

function fault(type: string, message: string): TransportResponse {
	return reply(400, {
		__type: `com.amazonaws.secretsmanager#${type}`,
		message,
	});
}

const SCHEDULED = "The secret is scheduled for deletion.";
const NOT_FOUND = "Secrets Manager can't find the specified secret.";

interface FakeOptions {
	/** Someone else schedules the secret's deletion just before our DeleteSecret lands. */
	readonly scheduleBeforeDelete?: boolean;
	/** DeleteSecret answers InvalidRequestException for a cause other than a scheduled deletion. */
	readonly refuseDelete?: boolean;
}

/** One account's Secrets Manager, holding secrets through their recovery window. */
function fakeSecretsManager(
	secrets: Map<string, FakeSecret>,
	options: FakeOptions = {},
) {
	const calls: { readonly target: string; readonly payload: JsonObject }[] = [];
	const arn = (name: string) =>
		`arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${name}-AbCdEf`;
	const describe = (name: string, secret: FakeSecret) => ({
		ARN: arn(name),
		Name: name,
		...(secret.description === undefined
			? undefined
			: { Description: secret.description }),
		...(secret.deletedDate === undefined
			? undefined
			: { DeletedDate: secret.deletedDate }),
	});

	async function transport(
		request: TransportRequest,
	): Promise<TransportResponse> {
		const target = (request.headers["x-amz-target"] ?? "").split(".")[1] ?? "";
		const payload = parseJsonObject(request.body ?? "{}");
		calls.push({ target, payload });
		const idValue = payload.SecretId ?? payload.Name;
		const name = isJsonString(idValue) ? idValue : "";
		const secret = secrets.get(name);
		const scheduled = secret?.deletedDate !== undefined;
		switch (target) {
			case "DescribeSecret":
				return secret === undefined
					? fault("ResourceNotFoundException", NOT_FOUND)
					: reply(200, describe(name, secret));
			case "CreateSecret": {
				if (scheduled) return fault("InvalidRequestException", SCHEDULED);
				if (secret !== undefined) {
					return fault("ResourceExistsException", "The secret already exists.");
				}
				const created: FakeSecret = {
					description: isJsonString(payload.Description)
						? payload.Description
						: undefined,
					deletedDate: undefined,
				};
				secrets.set(name, created);
				return reply(200, { ARN: arn(name), Name: name });
			}
			case "UpdateSecret":
				if (secret === undefined)
					return fault("ResourceNotFoundException", NOT_FOUND);
				if (scheduled) return fault("InvalidRequestException", SCHEDULED);
				if (isJsonString(payload.Description))
					secret.description = payload.Description;
				return reply(200, { ARN: arn(name), Name: name });
			case "DeleteSecret": {
				const force = payload.ForceDeleteWithoutRecovery === true;
				if (options.refuseDelete === true) {
					return fault(
						"InvalidRequestException",
						"The secret is managed by another service.",
					);
				}
				if (options.scheduleBeforeDelete === true && secret !== undefined) {
					secret.deletedDate = NOW_MS / 1000 + 7 * DAY_SECONDS;
					return fault("InvalidRequestException", SCHEDULED);
				}
				if (force) {
					secrets.delete(name);
					return reply(200, {
						ARN: arn(name),
						Name: name,
						DeletionDate: NOW_MS / 1000,
					});
				}
				if (secret === undefined)
					return fault("ResourceNotFoundException", NOT_FOUND);
				if (scheduled) return fault("InvalidRequestException", SCHEDULED);
				secret.deletedDate = NOW_MS / 1000 + 30 * DAY_SECONDS;
				return reply(200, {
					ARN: arn(name),
					Name: name,
					DeletionDate: secret.deletedDate,
				});
			}
			case "RestoreSecret":
				if (secret === undefined)
					return fault("ResourceNotFoundException", NOT_FOUND);
				secret.deletedDate = undefined;
				return reply(200, { ARN: arn(name), Name: name });
			default:
				return fault("UnknownOperationException", target);
		}
	}

	return { transport, calls, targets: () => calls.map((call) => call.target) };
}

function harness(
	secrets = new Map<string, FakeSecret>(),
	options: FakeOptions = {},
) {
	const aws = fakeSecretsManager(secrets, options);
	const registry = awsResolverRegistry({
		region: REGION,
		nowMs: NOW_MS,
		resolveCredential: async () => ({
			accessKeyId: "AKIAHOBOFAKEKEYID001",
			secretAccessKey: "n0tARealSecretAccessKey0000000000000000x",
		}),
	});
	const resolver = registry.get(AWS_SECRETS_MANAGER_PRODUCT_ID);
	if (resolver === undefined) throw new Error("no Secrets Manager resolver");
	const transport = guardedAwsTransport(aws.transport, REGION);
	const request = (desired: JsonObject) =>
		parseResolveRequest({
			ref: {
				slot: "secretRef",
				productId: AWS_SECRETS_MANAGER_PRODUCT_ID,
				logicalId: NAME,
			},
			desired,
			credentialRef: CREDENTIAL_REF,
		});
	return {
		aws,
		secrets,
		reconcile: (desired: JsonObject = {}) =>
			resolver.reconcile(request(desired), transport),
		read: (desired: JsonObject = {}) =>
			resolver.read?.(request(desired), transport),
		remove: (desired: JsonObject = {}) =>
			resolver.delete(request(desired), transport),
	};
}

function scheduledSecret(description?: string): Map<string, FakeSecret> {
	return new Map([
		[NAME, { description, deletedDate: NOW_MS / 1000 + 30 * DAY_SECONDS }],
	]);
}

/** NOW plus the default 30-day recovery window, as an ISO instant. */
const UNTIL = new Date(NOW_MS + 30 * DAY_SECONDS * 1000).toISOString();

function liveSecret(description?: string): Map<string, FakeSecret> {
	return new Map([[NAME, { description, deletedDate: undefined }]]);
}

describe("read of a secret scheduled for deletion", () => {
	it("reports it as being deleted, with the date, and that apply refuses it", async () => {
		const runner = harness(scheduledSecret("payment provider key"));

		const observed = await runner.read();

		expect(observed?.action).toBe("delete");
		expect(observed?.physicalId).toMatch(/^arn:aws:secretsmanager:/u);
		expect(observed?.outputs.deletedDate).toBe(UNTIL);
		const note = observed?.diagnostics.join(" ") ?? "";
		expect(note).toContain(`scheduled for deletion until ${UNTIL}`);
		expect(note).toContain("apply refuses it");
		expect(note).toContain("restoreScheduled: true");
		expect(runner.aws.targets()).toEqual(["DescribeSecret"]);
	});

	it("says apply will restore it, with its previous versions, when restoreScheduled is declared", async () => {
		const runner = harness(scheduledSecret());

		const observed = await runner.read({ restoreScheduled: true });

		expect(observed?.action).toBe("delete");
		expect(observed?.diagnostics.join(" ")).toContain(
			"apply will restore it, with its previous versions",
		);
	});
});

describe("reconcile of a secret scheduled for deletion", () => {
	it("fails closed by default, and says how to restore or delete it", async () => {
		const runner = harness(scheduledSecret("payment provider key"));

		const refusal = await runner
			.reconcile({ description: "payment provider key" })
			.then(
				() => undefined,
				(error: Error) => error,
			);

		expect(refusal).toBeInstanceOf(ResolverError);
		expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
			"RESOLVER_PROVIDER_REJECTED",
		);
		expect(refusal?.message).toContain(`scheduled for deletion until ${UNTIL}`);
		expect(refusal?.message).toContain("restoreScheduled: true");
		expect(refusal?.message).toContain("forceDelete: true");
		expect(runner.aws.targets()).toEqual(["DescribeSecret"]);
		expect(runner.secrets.get(NAME)?.deletedDate).toBeDefined();
	});

	it("restores it when restoreScheduled is declared, applies the drift, and then converges", async () => {
		const runner = harness(scheduledSecret("old description"));
		const desired = {
			description: "payment provider key",
			restoreScheduled: true,
		};

		const outcome = await runner.reconcile(desired);

		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"RestoreSecret",
			"DescribeSecret",
			"UpdateSecret",
			"DescribeSecret",
		]);
		expect(outcome.action).toBe("update");
		expect(outcome.outputs.description).toBe("payment provider key");
		expect(outcome.diagnostics.join(" ")).toContain(
			`restored the secret scheduled for deletion until ${UNTIL}, with its previous versions`,
		);
		expect(runner.secrets.get(NAME)).toEqual({
			description: "payment provider key",
			deletedDate: undefined,
		});

		const again = await runner.reconcile(desired);
		expect(again.action).toBe("adopt");
		expect(runner.aws.targets().slice(5)).toEqual(["DescribeSecret"]);
	});

	it("restores it when restoreScheduled is declared and nothing else drifted", async () => {
		const runner = harness(scheduledSecret("payment provider key"));

		const outcome = await runner.reconcile({
			description: "payment provider key",
			restoreScheduled: true,
		});

		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"RestoreSecret",
			"DescribeSecret",
		]);
		expect(outcome.action).toBe("update");
		expect(runner.secrets.get(NAME)?.deletedDate).toBeUndefined();
	});

	it("leaves a secret that is not scheduled alone, whatever restoreScheduled says", async () => {
		const runner = harness(liveSecret("payment provider key"));

		const outcome = await runner.reconcile({
			description: "payment provider key",
			restoreScheduled: true,
		});

		expect(outcome.action).toBe("adopt");
		expect(runner.aws.targets()).toEqual(["DescribeSecret"]);
	});
});

describe("delete of a secret scheduled for deletion", () => {
	it("is not issued a second time", async () => {
		const runner = harness(scheduledSecret());

		await runner.remove();

		expect(runner.aws.targets()).toEqual(["DescribeSecret"]);
		expect(runner.secrets.get(NAME)?.deletedDate).toBeDefined();
	});

	it("converges: the first schedules the deletion, the second issues nothing", async () => {
		const runner = harness(liveSecret());

		await runner.remove();
		await runner.remove();

		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"DeleteSecret",
			"DescribeSecret",
		]);
		expect(runner.secrets.get(NAME)?.deletedDate).toBe(
			NOW_MS / 1000 + 30 * DAY_SECONDS,
		);
	});

	it("is issued at once when the declaration asks for a forced delete", async () => {
		const runner = harness(scheduledSecret());

		await runner.remove({ forceDelete: true });

		expect(runner.aws.targets()).toEqual(["DescribeSecret", "DeleteSecret"]);
		expect(runner.aws.calls[1]?.payload.ForceDeleteWithoutRecovery).toBe(true);
		expect(runner.secrets.has(NAME)).toBe(false);
	});

	it("counts a deletion someone else scheduled between the describe and the delete as done", async () => {
		const runner = harness(liveSecret(), { scheduleBeforeDelete: true });

		await runner.remove();

		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"DeleteSecret",
			"DescribeSecret",
		]);
		expect(runner.secrets.get(NAME)?.deletedDate).toBeDefined();
	});

	it("still refuses an InvalidRequestException for another cause", async () => {
		const runner = harness(liveSecret(), { refuseDelete: true });

		await expect(runner.remove()).rejects.toThrow(
			/managed by another service/u,
		);
		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"DeleteSecret",
			"DescribeSecret",
		]);
	});

	it("of a secret that does not exist issues no DeleteSecret", async () => {
		const runner = harness();

		await runner.remove();

		expect(runner.aws.targets()).toEqual(["DescribeSecret"]);
	});
});
