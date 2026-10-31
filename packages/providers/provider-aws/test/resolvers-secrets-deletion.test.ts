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
// reports it as being deleted ("scheduled for deletion (DeletedDate <date>)")
// rather than absent. The date is reported as DeletedDate and nothing more:
// DeleteSecret's DeletionDate is "the date and time of the delete request plus
// the number of days in RecoveryWindowInDays", and the API does not say
// DescribeSecret's DeletedDate is the same instant. Someone deleted it on purpose, so reconcile fails closed unless
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
	awsResolvers,
	guardedAwsTransport,
	secretsManager,
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
	/**
	 * DescribeSecret's DeletedDate, unset when not scheduled. Epoch seconds, as
	 * AWS's JSON protocol answers a timestamp, unless a test answers another form.
	 */
	deletedDate: JsonValue | undefined;
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
	/** What RestoreSecret does after answering success: nothing, or remove the secret. */
	readonly restore?: "takes-no-effect" | "secret-vanishes";
	/** DescribeSecret's DeletedDate as raw JSON text, for values JSON.stringify cannot write (1e400). */
	readonly rawDeletedDate?: string;
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
		// A null DeletedDate is the field's absence, as Smithy reads it.
		const scheduled =
			secret?.deletedDate !== undefined && secret.deletedDate !== null;
		switch (target) {
			case "DescribeSecret":
				if (secret === undefined) {
					return fault("ResourceNotFoundException", NOT_FOUND);
				}
				if (options.rawDeletedDate !== undefined) {
					const body = JSON.stringify(describe(name, secret)).slice(0, -1);
					return {
						status: 200,
						headers: {},
						body: `${body},"DeletedDate":${options.rawDeletedDate}}`,
					};
				}
				return reply(200, describe(name, secret));
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
				if (options.restore === "secret-vanishes") secrets.delete(name);
				else if (options.restore !== "takes-no-effect")
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

/** The fake's DeletedDate for a scheduled secret, as the ISO instant read() reports. */
const DELETED_DATE = new Date(NOW_MS + 30 * DAY_SECONDS * 1000).toISOString();

function liveSecret(description?: string): Map<string, FakeSecret> {
	return new Map([[NAME, { description, deletedDate: undefined }]]);
}

describe("read of a secret scheduled for deletion", () => {
	it("reports it as being deleted, with the date, and that apply refuses it", async () => {
		const runner = harness(scheduledSecret("payment provider key"));

		const observed = await runner.read();

		expect(observed?.action).toBe("delete");
		expect(observed?.physicalId).toMatch(/^arn:aws:secretsmanager:/u);
		expect(observed?.outputs.deletedDate).toBe(DELETED_DATE);
		const note = observed?.diagnostics.join(" ") ?? "";
		expect(note).toContain(
			`scheduled for deletion (DeletedDate ${DELETED_DATE})`,
		);
		expect(note).not.toContain("until");
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
		expect(refusal?.message).toContain(
			`scheduled for deletion (DeletedDate ${DELETED_DATE})`,
		);
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
			`restored the secret scheduled for deletion (DeletedDate ${DELETED_DATE}), with its previous versions`,
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

	it.each([
		["takes-no-effect", "still reports it scheduled for deletion (DeletedDate"],
		["secret-vanishes", "no longer finds the secret"],
	] as const)("refuses, and sends nothing more, when RestoreSecret succeeds but %s", async (restore, observed) => {
		const runner = harness(scheduledSecret("old description"), { restore });

		const refusal = await runner
			.reconcile({
				description: "payment provider key",
				restoreScheduled: true,
			})
			.then(
				() => undefined,
				(error: Error) => error,
			);

		expect(refusal).toBeInstanceOf(ResolverError);
		expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
			"RESOLVER_PROVIDER_REJECTED",
		);
		expect(refusal?.message).toContain("the restore did not take effect");
		expect(refusal?.message).toContain(observed);
		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"RestoreSecret",
			"DescribeSecret",
		]);
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

describe("the Secrets Manager directives", () => {
	it("are forceDelete and restoreScheduled, and no other AWS resolver reads any", () => {
		const resolvers = awsResolvers({
			region: REGION,
			nowMs: NOW_MS,
			resolveCredential: async () => ({
				accessKeyId: "AKIAHOBOFAKEKEYID001",
				secretAccessKey: "n0tARealSecretAccessKey0000000000000000x",
			}),
		});

		const declared = resolvers
			.filter((resolver) => resolver.directives !== undefined)
			.map((resolver) => [resolver.productId, resolver.directives]);
		expect(declared).toEqual([
			[AWS_SECRETS_MANAGER_PRODUCT_ID, ["forceDelete", "restoreScheduled"]],
		]);
	});
});

// A directive is a boolean flag. Read loosely, "true" would be "not true": a
// forceDelete: "true" plan would preview clean and then delete without force.
// So any other value is refused at the resolver boundary, before any call.
describe("a directive that is not a boolean", () => {
	it.each([
		["forceDelete", "true"],
		["restoreScheduled", "true"],
		["forceDelete", 1],
		["restoreScheduled", null],
	] as const)("%s: %o is refused by read, reconcile and delete, before any call", async (name, value) => {
		const runner = harness(scheduledSecret());
		const desired: JsonObject = { [name]: value };

		for (const call of [
			runner.read(desired),
			runner.reconcile(desired),
			runner.remove(desired),
		]) {
			const refusal = await refusalOf(call);
			expect(refusal).toBeInstanceOf(ResolverError);
			expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
				"RESOLVER_PROVIDER_REJECTED",
			);
			expect(refusal?.message).toContain(
				`${name} is a directive and must be a boolean (true or false)`,
			);
			expect(refusal?.message).toContain(JSON.stringify(value));
		}
		expect(runner.aws.targets()).toEqual([]);
		expect(runner.secrets.get(NAME)?.deletedDate).toBeDefined();
	});

	it("false is off: an unforced delete, and a refused reconcile", async () => {
		const runner = harness(scheduledSecret());

		await runner.remove({ forceDelete: false });
		const refusal = await runner.reconcile({ restoreScheduled: false }).then(
			() => undefined,
			(error: Error) => error,
		);

		expect(runner.aws.targets()).toEqual(["DescribeSecret", "DescribeSecret"]);
		expect(refusal?.message).toContain("apply refuses it");
	});
});

// The options a Yard row declares are the realization parameters the resolver
// is handed, so each directive the refusal names must be declarable through the
// typed factory (a misspelt or missing field fails to compile here).
describe("the directives, declared through secretsManager()", () => {
	it("carries forceDelete: true to the resolver's delete", async () => {
		const binding = secretsManager({ forceDelete: true });
		const runner = harness(scheduledSecret());

		await runner.remove(binding.properties);

		expect(binding.properties).toEqual({ forceDelete: true });
		expect(runner.aws.targets()).toEqual(["DescribeSecret", "DeleteSecret"]);
		expect(runner.aws.calls[1]?.payload.ForceDeleteWithoutRecovery).toBe(true);
		expect(runner.secrets.has(NAME)).toBe(false);
	});

	it("carries restoreScheduled: true to the resolver's reconcile", async () => {
		const binding = secretsManager({ restoreScheduled: true });
		const runner = harness(scheduledSecret());

		const outcome = await runner.reconcile(binding.properties);

		expect(binding.properties).toEqual({ restoreScheduled: true });
		expect(outcome.action).toBe("update");
		expect(runner.aws.targets()).toContain("RestoreSecret");
		expect(runner.secrets.get(NAME)?.deletedDate).toBeUndefined();
	});
});

/** The refusal a call ended in, or undefined when it did not refuse (or was never made). */
async function refusalOf(
	call: Promise<unknown> | undefined,
): Promise<Error | undefined> {
	return (call ?? Promise.resolve()).then(
		() => undefined,
		(error: Error) => error,
	);
}

function scheduledWith(deletedDate: JsonValue): Map<string, FakeSecret> {
	return new Map([[NAME, { description: undefined, deletedDate }]]);
}

// DescribeSecret's DeletedDate is a Timestamp; AWS's JSON protocol answers it
// as epoch seconds, which may be fractional (the API reference's own example
// answers LastChangedDate as 1523477145.729). A provider that answers text
// (mirror.cloud's emulator writes "2026-11-30T05:30:25.033060027Z") must
// answer an RFC 3339 date-time. Either becomes one canonical instant: UTC,
// upper-case T and Z, a four-digit year, at least three fraction digits and at
// most nine, no trailing zero past the third, a leap second kept as 60. A null
// is the field's absence (Smithy's null-as-absent): not scheduled. Anything
// else leaves the secret's state unreadable, so it is refused.
describe("DeletedDate as a provider answers it", () => {
	it.each([
		[1523477145.729, "2018-04-11T20:05:45.729Z", "fractional seconds"],
		[1523477145.7296, "2018-04-11T20:05:45.730Z", "rounded to the millisecond"],
		[1764480625, "2025-11-30T05:30:25.000Z", "whole seconds"],
		[0, "1970-01-01T00:00:00.000Z", "the epoch"],
		[-62167219200, "0000-01-01T00:00:00.000Z", "the first instant of 0000"],
		[
			253402300799.999,
			"9999-12-31T23:59:59.999Z",
			"the last millisecond of 9999",
		],
	])("reads epoch seconds %o (%s) as %s", async (seconds, instant) => {
		const runner = harness(scheduledWith(seconds));

		const observed = await runner.read();

		expect(observed?.action).toBe("delete");
		expect(observed?.outputs.deletedDate).toBe(instant);
		expect(observed?.diagnostics.join(" ")).toContain(
			`(DeletedDate ${instant})`,
		);
	});

	it.each([
		[
			"2026-11-30T05:30:25.033060027Z",
			"2026-11-30T05:30:25.033060027Z",
			"nanoseconds, as the emulator writes it",
		],
		["2026-11-30T05:30:25Z", "2026-11-30T05:30:25.000Z", "whole seconds"],
		["2026-11-30T05:30:25.5000Z", "2026-11-30T05:30:25.500Z", "trailing zeros"],
		[
			"2026-11-30T05:30:25.0330600271Z",
			"2026-11-30T05:30:25.033060027Z",
			"ten fraction digits, kept to the nanosecond",
		],
		["2026-11-30t05:30:25z", "2026-11-30T05:30:25.000Z", "lower-case t and z"],
		["2026-11-30T05:30:25-00:00", "2026-11-30T05:30:25.000Z", "-00:00"],
		["2026-11-30T05:30:25+00:00", "2026-11-30T05:30:25.000Z", "+00:00"],
		[
			"2026-11-30T07:30:25.5+02:00",
			"2026-11-30T05:30:25.500Z",
			"an offset east",
		],
		[
			"2026-11-30T23:30:00-01:00",
			"2026-12-01T00:30:00.000Z",
			"an offset across midnight",
		],
		["2028-02-29T00:00:00Z", "2028-02-29T00:00:00.000Z", "a leap day"],
		[
			"2000-02-29T00:00:00Z",
			"2000-02-29T00:00:00.000Z",
			"a leap day in a year divisible by 400",
		],
		["2016-12-31T23:59:60Z", "2016-12-31T23:59:60.000Z", "a leap second"],
		[
			"2017-01-01T08:59:60.5+09:00",
			"2016-12-31T23:59:60.500Z",
			"a leap second at an offset",
		],
		[
			"0000-01-01T00:00:00Z",
			"0000-01-01T00:00:00.000Z",
			"the first instant of 0000",
		],
		[
			"9999-12-31T23:59:59.999999999Z",
			"9999-12-31T23:59:59.999999999Z",
			"the last nanosecond of 9999",
		],
	])("reads the RFC 3339 date-time %s as %s (%s)", async (text, instant) => {
		const runner = harness(scheduledWith(text));

		const observed = await runner.read();

		expect(observed?.action).toBe("delete");
		expect(observed?.outputs.deletedDate).toBe(instant);
		expect(observed?.diagnostics.join(" ")).toContain(
			`(DeletedDate ${instant})`,
		);
	});

	it("reads a null DeletedDate as not scheduled, in read, reconcile and delete", async () => {
		const runner = harness(scheduledWith(null));

		const observed = await runner.read();
		const reconciled = await runner.reconcile();
		await runner.remove();

		expect(observed?.action).toBe("adopt");
		expect(observed?.outputs.deletedDate).toBeUndefined();
		expect(reconciled.action).toBe("adopt");
		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"DescribeSecret",
			"DescribeSecret",
			"DeleteSecret",
		]);
	});

	it.each([
		["soon", "text that is not a date"],
		["", "an empty string"],
		["2026-11-30", "a date with no time"],
		["2026-11-30T05:30:25", "a time with no zone"],
		["2026-11-30 05:30:25Z", "a space for T"],
		["2026-11-30T05:30:25.Z", "an empty fraction"],
		["2026-11-30T05:30:25+0530", "an offset with no colon"],
		["2026-00-01T00:00:00Z", "month 00"],
		["2026-13-01T00:00:00Z", "month 13"],
		["2026-11-00T05:30:25Z", "day 00"],
		["2026-11-31T05:30:25Z", "November 31"],
		["2026-02-29T00:00:00Z", "February 29 in a common year"],
		["1900-02-29T00:00:00Z", "February 29 in a century not divisible by 400"],
		["2026-11-30T24:00:00Z", "hour 24"],
		["2026-11-30T05:60:25Z", "minute 60"],
		["2026-11-30T05:30:61Z", "second 61"],
		["2026-11-30T05:30:60Z", "a leap second that does not end a UTC day"],
		["2026-11-30T05:30:25+24:00", "offset hour 24"],
		["2026-11-30T05:30:25+05:60", "offset minute 60"],
		["0000-01-01T00:30:00+01:00", "an instant before 0000 in UTC"],
		["9999-12-31T23:30:00-01:00", "an instant after 9999 in UTC"],
		["1523477145.729", "epoch seconds written as text"],
		[8.64e12, "epoch seconds in the year 275760"],
		[3e11, "epoch seconds in the year 11476"],
		[253402300800, "epoch seconds in the year 10000"],
		[-62167219201, "epoch seconds before 0000"],
		[true, "a boolean"],
		[[], "an array"],
		[{ seconds: 1523477145 }, "an object"],
	])("refuses %o (%s) in read, reconcile and an unforced delete", async (deletedDate: JsonValue, _why: string) => {
		const runner = harness(scheduledWith(deletedDate));

		for (const refusal of [
			await refusalOf(runner.read()),
			await refusalOf(runner.reconcile({ restoreScheduled: true })),
			await refusalOf(runner.remove()),
		]) {
			expect(refusal).toBeInstanceOf(ResolverError);
			expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
				"RESOLVER_OUTPUT_UNPARSEABLE",
			);
			expect(refusal?.message).toContain(
				`AWS returned a DeletedDate (${JSON.stringify(deletedDate)})`,
			);
		}
		expect(runner.aws.targets()).toEqual([
			"DescribeSecret",
			"DescribeSecret",
			"DescribeSecret",
		]);
	});

	// A forced delete ends the recovery window whatever the date is, and the
	// describe before it chooses nothing: both calls name the secret by
	// SecretId. So an unreadable DeletedDate does not stop it.
	it.each([
		["soon"],
		[1e13],
		[true],
	])("lets a forced delete go ahead when DeletedDate is %o", async (deletedDate) => {
		const runner = harness(scheduledWith(deletedDate));

		await runner.remove({ forceDelete: true });

		expect(runner.aws.targets()).toEqual(["DescribeSecret", "DeleteSecret"]);
		expect(runner.aws.calls[1]?.payload).toEqual({
			SecretId: NAME,
			ForceDeleteWithoutRecovery: true,
		});
		expect(runner.secrets.has(NAME)).toBe(false);
	});

	it("quotes a DeletedDate JSON cannot hold (1e400) as it was written, not as null", async () => {
		const runner = harness(scheduledWith(0), { rawDeletedDate: "1e400" });

		const refusal = await refusalOf(runner.read());

		expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
			"RESOLVER_OUTPUT_UNPARSEABLE",
		);
		expect(refusal?.message).toContain("AWS returned a DeletedDate (1e400)");
		expect(refusal?.message).not.toContain("(null)");
	});

	it("quotes an unreadable DeletedDate only bounded and redacted", async () => {
		const leaked = "n0tARealSecretAccessKey0000000000000000x";
		const runner = harness(
			scheduledWith(`expires ${leaked} ${"later ".repeat(500)}`),
		);

		const refusal = await refusalOf(runner.read());

		expect(refusal instanceof ResolverError ? refusal.code : "").toBe(
			"RESOLVER_OUTPUT_UNPARSEABLE",
		);
		expect(refusal?.message).not.toContain(leaked);
		expect(refusal?.message).toContain("[redacted]");
		expect(refusal?.message.length).toBeLessThan(500);
	});
});
