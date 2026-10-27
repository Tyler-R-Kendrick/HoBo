import { clone, create, toJsonString } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
	AccountSchema,
	ConfigurationSchema,
	ConnectionSchema,
	LeaseSchema,
	OfferSchema,
} from "../src/_generated/ci_pb.js";
import { parseConfiguration } from "../src/config.js";
import { route } from "../src/routing.js";

function present<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("missing fixture value");
	return value;
}

const now = "2026-10-26T12:00:00Z";
function offer(id: string, free = 0, price = 1000) {
	return create(OfferSchema, {
		id,
		provider: id === "gh" ? "github" : "blacksmith",
		providerAccountId: id,
		enabled: true,
		runsOn: "ubuntu-24.04",
		freeMinutes: free,
		priceMicrosPerMinute: price,
		budgetMicros: 1000000,
		concurrency: 2,
		observedAt: "2026-10-26T00:00:00Z",
		validUntil: "2026-11-01T00:00:00Z",
		sourceUrl: "https://example.test/usage",
		bridgeAcknowledged: true,
	});
}
function account() {
	return create(AccountSchema, {
		id: "a",
		budgetMicros: 1000000,
		maxRuntimeMinutes: 9,
		startupMinutes: 1,
		offers: [
			offer("gh", 10, 6000),
			offer("blacksmith", 10, 4000),
			offer("depot", 0, 1000),
		],
	});
}
function lease(offerId: string, free: number, paid = 0) {
	return create(LeaseSchema, {
		accountId: "a",
		offerId,
		state: "running",
		reservedMinutes: 10,
		reservedFreeMinutes: free,
		reservedPaidMicros: paid,
	});
}

describe("account allocation routing", () => {
	it("uses remaining free providers before cheapest paid provider", () => {
		const a = account();
		expect(route(a, [], now)?.offer.id).toBe("blacksmith");
		expect(route(a, [lease("blacksmith", 10)], now)?.offer.id).toBe("gh");
		const selected = route(a, [lease("blacksmith", 10), lease("gh", 10)], now);
		expect(selected?.offer.id).toBe("depot");
		expect(selected?.paidMicros).toBe(10000);
	});
	it("chooses the cheaper total reservation over a more expensive partial free allocation", () => {
		const a = account();
		a.offers = [offer("gh", 1, 1000), offer("blacksmith", 0, 100)];
		const choice = route(a, [], now);
		expect(choice?.offer.id).toBe("blacksmith");
		expect(choice?.paidMicros).toBe(1000);
	});
	it("prefers usable free allocation when total projected charges tie", () => {
		const a = account();
		a.offers = [offer("a", 0, 90), offer("z", 1, 100)];
		const choice = route(a, [], now);
		expect(choice?.offer.id).toBe("z");
		expect(choice?.paidMicros).toBe(900);
		expect(choice?.freeMinutes).toBe(1);
	});
	it("prefers a fully free allocation over a higher-priced provider", () => {
		const a = account();
		a.offers = [offer("gh", 10, 9999), offer("blacksmith", 0, 1)];
		expect(route(a, [], now)?.offer.id).toBe("gh");
		expect(route(a, [], now)?.paidMicros).toBe(0);
	});
	it("prices fractional allocation exactly at a microdollar boundary", () => {
		const a = account();
		a.offers = [offer("a", 9.1, 1001), offer("z", 9.1, 1000)];
		a.budgetMicros = 899;
		expect(route(a, [], now)).toBeUndefined();
		a.budgetMicros = 900;
		const choice = route(a, [], now);
		expect(choice?.offer.id).toBe("z");
		expect(choice?.freeMinutes).toBe(9.1);
		expect(choice?.paidMicros).toBe(900);
	});
	it("subtracts fractional active and settled free usage with decimal arithmetic", () => {
		const a = account();
		a.offers = [offer("gh", 0.3, 1000)];
		const held = lease("gh", 0.1, 9900);
		const heldChoice = route(a, [held], now);
		expect(heldChoice?.freeMinutes).toBe(0.2);
		expect(heldChoice?.paidMicros).toBe(9800);
		const settled = lease("gh", 0);
		Object.assign(settled, {
			state: "completed",
			billedFreeMinutes: 0.1,
			settledAt: now,
		});
		const settledChoice = route(a, [settled], now);
		expect(settledChoice?.freeMinutes).toBe(0.2);
		expect(settledChoice?.paidMicros).toBe(9800);
		settled.billedFreeMinutes = 0.2;
		expect(route(a, [held, settled], now)?.freeMinutes).toBe(0);
	});
	it("accounts for scientific-notation free minutes without under-reserving", () => {
		const a = account();
		const o = offer("gh", 1e-7, 10000000);
		a.offers = [o];
		a.budgetMicros = 100000000;
		o.budgetMicros = 100000000;
		expect(route(a, [], now)?.paidMicros).toBe(99999999);
	});
	it("never rounds an unrepresentable remaining free balance upward when persisting it", () => {
		const a = account();
		a.offers = [offer("gh", 0.1, 1000)];
		const held = lease("gh", 1e-18, 10000);
		const choice = route(a, [held], now);
		expect(choice?.freeMinutes).toBeLessThan(0.1);
		expect(choice?.paidMicros).toBe(9901);
	});
	it("selects the cheapest affordable offer after accounting for outstanding free reservations", () => {
		const a = account();
		a.offers = [offer("gh", 10, 1000), offer("blacksmith", 0, 100)];
		const existing = lease("gh", 9, 1000);
		expect(route(a, [existing], now)?.offer.id).toBe("blacksmith");
		a.budgetMicros = 1999;
		expect(route(a, [existing], now)).toBeUndefined();
	});
	it("rejects every candidate when hard budgets are exhausted", () => {
		const a = account();
		a.budgetMicros = 0;
		a.offers.forEach((o) => {
			o.freeMinutes = 0;
		});
		expect(route(a, [], now)).toBeUndefined();
	});
	it("can use a free allocation with a zero paid budget", () => {
		const a = account();
		a.budgetMicros = 0;
		expect(route(a, [], now)?.paidMicros).toBe(0);
	});
	it("moves away from provider budget limits", () => {
		const a = account();
		a.offers = [offer("gh", 0, 1), offer("blacksmith", 0, 2)];
		present(a.offers[0]).budgetMicros = 0;
		expect(route(a, [], now)?.offer.id).toBe("blacksmith");
	});
	it("subtracts pending paid reservations from account budgets", () => {
		const a = account();
		a.budgetMicros = 10000;
		a.offers = [offer("gh", 0, 1000)];
		expect(route(a, [lease("other", 0, 10000)], now)).toBeUndefined();
	});
	it("does not pool tenant headroom", () => {
		const a = account();
		const foreign = lease("blacksmith", 10);
		foreign.accountId = "other";
		expect(route(a, [foreign], now)?.offer.id).toBe("blacksmith");
	});
	it("counts settled usage, and resets free balances only on new measured evidence", () => {
		const a = account();
		const done = lease("blacksmith", 10);
		Object.assign(done, {
			state: "completed",
			billedMinutes: 10,
			billedFreeMinutes: 10,
			settledAt: now,
		});
		expect(route(a, [done], now)?.offer.id).toBe("gh");
		present(a.offers.find((o) => o.id === "blacksmith")).observedAt =
			"2026-10-26T13:00:00Z";
		expect(route(a, [done], "2026-10-26T14:00:00Z")?.offer.id).toBe(
			"blacksmith",
		);
	});
	it.each([
		"expired",
		"future",
		"disabled",
		"unacknowledged",
		"concurrency",
	])("excludes %s offerings", (condition) => {
		const a = account();
		a.offers = [offer("gh", 10)];
		let leases: ReturnType<typeof lease>[] = [];
		if (condition === "expired") present(a.offers[0]).validUntil = now;
		if (condition === "future")
			present(a.offers[0]).observedAt = "2026-10-27T00:00:00Z";
		if (condition === "disabled") present(a.offers[0]).enabled = false;
		if (condition === "unacknowledged")
			present(a.offers[0]).bridgeAcknowledged = false;
		if (condition === "concurrency") leases = [lease("gh", 0), lease("gh", 0)];
		expect(route(a, leases, now)).toBeUndefined();
	});
	it("ranks deterministically independent of configuration order", () => {
		const a = account();
		a.offers = [offer("b", 10), offer("a", 10)];
		expect(route(a, [], now)?.offer.id).toBe("a");
		a.offers.reverse();
		expect(route(a, [], now)?.offer.id).toBe("a");
	});
});

describe("configuration boundary", () => {
	function config() {
		return create(ConfigurationSchema, {
			accounts: [account()],
			connections: [
				create(ConnectionSchema, {
					accountId: "a",
					repository: "org/repo",
					repositoryId: 101,
					installationId: 10,
					bridgeWorkflow: "host.yml",
					bridgeSha: "a".repeat(40),
					runnerGroupId: 1,
					allowedEvents: ["push"],
					allowedRefs: ["refs/heads/main"],
					trustedRepositoryAcknowledged: true,
					bridgeRef: "hobo-ci-v1",
					dispatcherActorId: 123,
				}),
			],
		});
	}
	it("accepts the canonical protobuf JSON representation", () => {
		expect(
			parseConfiguration(toJsonString(ConfigurationSchema, config()))
				.accounts[0]?.id,
		).toBe("a");
	});
	it("rejects duplicated provider-account allowances even inside an account", () => {
		const c = config();
		present(c.accounts[0]).offers.push({
			...present(present(c.accounts[0]).offers[0]),
			id: "duplicate",
		});
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow(/one owner/);
	});
	it("rejects unknown provider and unpinned bridge refs", () => {
		const c = config();
		present(c.connections[0]).bridgeSha = "main";
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow(/pinned/);
	});
	it("permits an isolated-only connection without a workflow bridge", () => {
		const c = config();
		const connection = present(c.connections[0]);
		connection.isolatedOnly = true;
		connection.acceptAllMatchingRepositoryJobs = true;
		connection.publicRepositoryAcknowledged = true;
		connection.allowedEvents = [];
		connection.allowedRefs = [];
		connection.bridgeWorkflow = "";
		connection.bridgeSha = "";
		connection.bridgeRef = "";
		connection.dispatcherActorId = 0;
		expect(
			parseConfiguration(toJsonString(ConfigurationSchema, c)).connections[0]
				?.isolatedOnly,
		).toBe(true);
		for (const mutate of [
			() => (connection.bridgeWorkflow = "host.yml"),
			() => (connection.bridgeSha = "a".repeat(40)),
			() => (connection.bridgeRef = "main"),
			() => (connection.dispatcherActorId = 123),
		]) {
			mutate();
			expect(() =>
				parseConfiguration(toJsonString(ConfigurationSchema, c)),
			).toThrow(/isolated connection/);
			connection.bridgeWorkflow = "";
			connection.bridgeSha = "";
			connection.bridgeRef = "";
			connection.dispatcherActorId = 0;
		}
		for (const [key, value] of [
			["acceptAllMatchingRepositoryJobs", false],
			["publicRepositoryAcknowledged", false],
			["allowAllPullRequests", true],
			["allowedEvents", ["push"]],
			["allowedRefs", ["refs/heads/main"]],
		] as const) {
			const modified = clone(ConfigurationSchema, c);
			Object.assign(present(modified.connections[0]), { [key]: value });
			expect(() =>
				parseConfiguration(toJsonString(ConfigurationSchema, modified)),
			).toThrow(/consent/);
		}
		connection.isolatedOnly = false;
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow();
	});
	it("requires acknowledgment of the shared label trust boundary", () => {
		const c = config();
		present(c.connections[0]).trustedRepositoryAcknowledged = false;
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow(/trusted/);
	});
	it("rejects invalid entitlement expiration dates", () => {
		const c = config();
		present(present(c.accounts[0]).offers[0]).validUntil = "garbage";
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow(/evidence/);
	});
	it("rejects negative and nonfinite budgets", () => {
		const c = config();
		present(c.accounts[0]).budgetMicros = -1;
		expect(() =>
			parseConfiguration(toJsonString(ConfigurationSchema, c)),
		).toThrow(/nonnegative/);
	});
});
