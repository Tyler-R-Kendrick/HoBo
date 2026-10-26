import { fromJsonString } from "@bufbuild/protobuf";
import { type Configuration, ConfigurationSchema } from "./_generated/ci_pb.js";

export function parseConfiguration(json: string): Configuration {
	const config = fromJsonString(ConfigurationSchema, json);
	const accountIds = new Set<string>();
	const entitlements = new Set<string>();
	const repositories = new Set<number>();
	for (const account of config.accounts) {
		if (!/^[a-zA-Z0-9_-]{1,80}$/.test(account.id) || accountIds.has(account.id))
			throw new Error("invalid or duplicate account");
		accountIds.add(account.id);
		micros(account.budgetMicros, account.spentMicros);
		if (
			!Number.isInteger(account.maxRuntimeMinutes) ||
			account.maxRuntimeMinutes < 1 ||
			account.maxRuntimeMinutes > 330 ||
			account.startupMinutes < 1 ||
			account.startupMinutes > 20
		)
			throw new Error("invalid host timeout");
		const ids = new Set<string>();
		for (const offer of account.offers) {
			if (!/^[a-zA-Z0-9_-]{1,80}$/.test(offer.id) || ids.has(offer.id))
				throw new Error("invalid or duplicate offer");
			ids.add(offer.id);
			if (!["", "gh-actions", "dagger", "cf"].includes(offer.backend))
				throw new Error("unsupported execution backend");
			if (
				(offer.provider === "dagger" && offer.backend !== "dagger") ||
				(offer.provider === "cloudflare" && offer.backend !== "cf")
			)
				throw new Error(
					"native provider requires its matching execution backend",
				);
			if (
				![
					"github",
					"blacksmith",
					"depot",
					"warpbuild",
					"kubernetes",
					"dagger",
					"cloudflare",
				].includes(offer.provider)
			)
				throw new Error("unsupported provider");
			micros(offer.priceMicrosPerMinute, offer.budgetMicros, offer.spentMicros);
			const key = `${offer.provider}:${offer.providerAccountId}`;
			if (!offer.providerAccountId || entitlements.has(key))
				throw new Error(
					"provider account entitlement must have one owner and one offer",
				);
			entitlements.add(key);
			nonnegative(
				offer.freeMinutes,
				offer.priceMicrosPerMinute,
				offer.budgetMicros,
				offer.spentMicros,
			);
			if (
				offer.concurrency < 1 ||
				offer.concurrency > 1000 ||
				!Number.isFinite(Date.parse(offer.observedAt)) ||
				!Number.isFinite(Date.parse(offer.validUntil)) ||
				Date.parse(offer.validUntil) <= Date.parse(offer.observedAt)
			)
				throw new Error("invalid offer evidence");
			if (
				!/^[a-zA-Z0-9_.-]{1,100}$/.test(offer.runsOn) ||
				offer.runsOn.toLowerCase() === "hobo"
			)
				throw new Error("invalid bridge runner label");
			if (!offer.sourceUrl.startsWith("https://"))
				throw new Error("offer evidence source must use HTTPS");
		}
	}
	for (const connection of config.connections) {
		if (!connection.trustedRepositoryAcknowledged)
			throw new Error(
				"trusted repository acknowledgment required: all hobo workflows share runner access",
			);
		if (
			!accountIds.has(connection.accountId) ||
			repositories.has(connection.repositoryId)
		)
			throw new Error("repository must belong to one configured account");
		repositories.add(connection.repositoryId);
		if (
			!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(connection.repository) ||
			connection.repository.split("/").some((p) => p === "." || p === "..")
		)
			throw new Error("invalid repository");
		positiveId(
			connection.repositoryId,
			connection.installationId,
			connection.runnerGroupId,
			connection.dispatcherActorId,
		);
		if (!/^[a-zA-Z0-9_/-]{1,100}$/.test(connection.bridgeRef))
			throw new Error("protected bridge branch or tag ref required");
		if (
			!/^[a-zA-Z0-9_-]+\.ya?ml$/.test(connection.bridgeWorkflow) ||
			!/^[a-f0-9]{40}$/.test(connection.bridgeSha)
		)
			throw new Error("bridge workflow requires a pinned commit SHA");
		if (
			connection.allowedEvents.length === 0 ||
			connection.allowedEvents.some(
				(event) => !["push", "workflow_dispatch"].includes(event),
			) ||
			connection.allowedRefs.length === 0 ||
			connection.allowedRefs.some((ref) => !ref.startsWith("refs/heads/"))
		)
			throw new Error("explicit trusted branch and event allowlists required");
	}
	return config;
}

export function nonnegative(...values: number[]): void {
	if (
		values.some(
			(value) =>
				!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER,
		)
	)
		throw new Error("expected finite nonnegative quantity");
}
export function positiveId(...values: number[]): void {
	if (values.some((value) => !Number.isSafeInteger(value) || value <= 0))
		throw new Error("expected positive safe integer id");
}

function micros(...values: number[]): void {
	nonnegative(...values);
	if (values.some((value) => !Number.isSafeInteger(value)))
		throw new Error("cost must be integer USD microdollars");
}
