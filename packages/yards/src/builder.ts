/**
 * Builder authoring for Station, Yard and Camp — one verb per noun, matching
 * the shape `bindle(name, (b) => …)` already has.
 *
 * The problem this solves is not typing effort, it is that the old surface made
 * you learn four unrelated shapes to say one thing: an options object for a
 * Yard, a second options object for a Station, a free `camp()` call, and then
 * `attachCampToYard(c, { yardId, providerId })` — where the author had to hand
 * the Yard back its own two identifiers. Nesting is what removes that: a Camp
 * declared inside `y.camp(…)` cannot disagree with its Yard because it is never
 * told anything the Yard does not already know.
 *
 * The provider is an *argument*, not a builder call. `yard(azure, "prod-eu", …)`
 * establishes it before the callback runs, so there is no window in which slot
 * calls are written against a Yard that has no provider yet, and no way for
 * moving a line to change whether the code makes sense. Values authors would
 * otherwise spell as bare strings — capability profiles and Camp environment
 * types — come from the typed vocabulary in `@hobo/core` (`capability`,
 * `ENV_TYPES`) so a typo is a compile error rather than a row that matches
 * nothing.
 *
 * Three properties are load-bearing:
 *
 * 1. **It is a front end, not a second parser.** Every builder terminates in
 *    `defineYard` / `defineStation` / `camp()` — the code that already ships.
 *    `SLOT_KEY_MISMATCH`, `SLOT_PROFILE_MISMATCH`, `YARD_BINDING_DUPLICATE`,
 *    `YARD_BINDING_EMPTY_CONSTRAINT`, `SLOT_BINDING_CREDENTIAL_PROPERTY`,
 *    `STATION_NO_YARDS`, `STATION_DUPLICATE_YARD`,
 *    `camp-provider-selection-forbidden` and `camp-bindle-ownership-forbidden`
 *    all still fire, with their existing codes and existing messages. A second
 *    validation path that drifts from the first would be strictly worse than
 *    the verbose syntax it replaced.
 * 2. **Call order is not information.** Slots are emitted in the fixed
 *    `CAPABILITY_SLOTS` order rather than the order the author called them, and
 *    nested Camps are sorted by id before they reach `yard()` (registration is
 *    a set, exactly as `defineStation` already treats its Yards). Two builders
 *    that declare the same things in different orders are deep-equal.
 * 3. **Slots accumulate.** `y.web(a)` followed by `y.web(b)` declares two web
 *    offerings, never one: a Yard row set says what the provider is *able to*
 *    allocate, so silently dropping the first offering would be a portability
 *    lie rather than a last-write-wins convenience.
 *
 * Scope, honestly: the Yard builder has exactly `defineYard`'s expressive
 * range. `require` / `prefer` / `isolation` / `network` / `properties` /
 * `runtimeId` / `resolverDefaults` are Yard fields that `defineYard` does not
 * accept either; authoring those still goes through `yard()` directly. Widening
 * the builder past its compile target would mean bypassing it, which is the one
 * thing this module must not do.
 *
 * These are exported from `@hobo/yards` under `buildStation` / `buildYard` /
 * `buildCamp` because `yard` and `camp` are already taken here by the parse
 * boundaries the builder compiles into. `@hobo/cloud-providers` re-exports them
 * as `station` / `yard` / `camp`, which is the one-import authoring surface.
 */
import { type Camp, camp, type ProviderSelection } from "@hobo/camps";
import {
	CAPABILITY_SLOTS,
	type CapabilitySlot,
	ENV_TYPES,
	type EnvType,
	isEnvType,
	type SlotBinding,
} from "@hobo/core";
import {
	type DefineYardConfig,
	defineStation,
	defineYard,
	type StationManifest,
} from "./define.js";
import type { Yard } from "./yard.js";

export type BuilderErrorCode =
	| "ENV_TYPE_UNKNOWN"
	| "PROVIDER_REF_UNRESOLVED"
	| "SLOT_CALL_EMPTY";

/**
 * Refusal from the builder front end itself — a call the builder can see is
 * wrong before it has anything to hand to a parse boundary. Everything the
 * existing parsers can judge is left to them, so this list stays short.
 */
export class BuilderError extends Error {
	readonly code: BuilderErrorCode;
	readonly remediation: string;

	constructor(code: BuilderErrorCode, message: string, remediation: string) {
		super(message);
		this.name = "BuilderError";
		this.code = code;
		this.remediation = remediation;
	}
}

/**
 * A provider namespace object (`aws`, `azure`, …) states its own id. It is read
 * and never inferred: deriving a provider from a Yard name, a product id
 * prefix, or a catalog row would make a naming convention load-bearing, which
 * ADR-0144 forbids.
 */
export interface ProviderNamespaceRef {
	readonly PROVIDER_ID: string;
}

export type ProviderRef =
	| string
	| { readonly id: string }
	| ProviderNamespaceRef;

/** Resolves the three accepted spellings of "which provider" to a provider id. */
export function providerIdOf(provider: ProviderRef): string {
	if (typeof provider === "string" && provider.length > 0) return provider;
	if (provider !== null && typeof provider === "object") {
		const namespaceId = (provider as Partial<ProviderNamespaceRef>).PROVIDER_ID;
		if (typeof namespaceId === "string" && namespaceId.length > 0) {
			return namespaceId;
		}
		const objectId = (provider as Partial<{ id: string }>).id;
		if (typeof objectId === "string" && objectId.length > 0) return objectId;
	}
	throw new BuilderError(
		"PROVIDER_REF_UNRESOLVED",
		`cannot resolve a provider id from ${JSON.stringify(provider)} — a provider is stated, never inferred`,
		'Pass the provider as the first argument to yard(): yard(azure, "prod-eu", …). A namespace object is preferred; a provider id string or { id } is accepted for providers with no namespace package.',
	);
}

/** One variadic method per capability slot, generated from `CAPABILITY_SLOTS`. */
export type YardSlotMethods = {
	readonly [K in CapabilitySlot]: (...bindings: SlotBinding[]) => YardBuilder;
};

export interface YardBuilder extends YardSlotMethods {
	region(...regions: string[]): YardBuilder;
	residency(...residency: string[]): YardBuilder;
	componentHost(...hosts: string[]): YardBuilder;
	label(key: string, value: string): YardBuilder;
	/** Slot-name-as-data form of the generated slot methods. */
	slot(slot: CapabilitySlot, ...bindings: SlotBinding[]): YardBuilder;
	/** Declares a Camp inside this Yard; yardId and providerId are derived. */
	camp(name: string, build?: (builder: CampBuilder) => unknown): YardBuilder;
	camp(existing: Camp): YardBuilder;
	/** The provider id this Yard was opened with. Read-only: set at the call. */
	readonly providerId: string;
}

export interface CampBuilder {
	envType(envType: EnvType): CampBuilder;
	production(): CampBuilder;
	staging(): CampBuilder;
	preview(): CampBuilder;
	development(): CampBuilder;
	require(...requirements: string[]): CampBuilder;
	prefer(...preferences: string[]): CampBuilder;
	label(key: string, value: string): CampBuilder;
	runtime(...requirements: string[]): CampBuilder;
	pin(slot: CapabilitySlot, resolverId: string): CampBuilder;
	/**
	 * Refused by `camp()` with `camp-provider-selection-forbidden`. It exists so
	 * the mistake it names gets the existing remediation instead of an
	 * "unknown method" — provider belongs on the enclosing Yard's `on()`.
	 */
	provider(selection: unknown): CampBuilder;
	/**
	 * Refused by `camp()` with `camp-bindle-ownership-forbidden`. Camps do not
	 * own Bindles; a Bindle reaches a Camp through a deployment request.
	 */
	bindle(owned: unknown): CampBuilder;
}

export interface StationBuilder {
	tenant(tenant: string): StationBuilder;
	residency(residency: string): StationBuilder;
	trustDomain(trustDomain: string): StationBuilder;
	airgap(airgap?: boolean): StationBuilder;
	/**
	 * Builds and registers a Yard on a provider. The provider comes first
	 * because it is the fact that determines what every later call may mean.
	 */
	yard(
		provider: ProviderRef,
		name: string,
		build: (builder: YardBuilder) => unknown,
	): StationBuilder;
	/** Registers a Yard that already exists, e.g. `cloudflare.Yard()`. */
	yard(existing: Yard): StationBuilder;
}

/** Authors an unattached Camp. Attachment happens via `y.camp(…)`. */
export function buildCamp(
	name: string,
	build?: (builder: CampBuilder) => unknown,
): Camp {
	const draft = new CampDraft();
	build?.(draft);
	return draft.compile(name);
}

/**
 * Authors a Yard on a provider. Compiles to `defineYard`, which compiles to
 * `yard()`.
 *
 * The provider is an argument, not a builder call, because it is not one
 * setting among many: it decides which offerings are even nameable in the
 * callback. `y.on(azure)` let a Yard exist, briefly, with no provider — every
 * slot call before it was written against nothing, and moving the line changed
 * whether the code was sensible without changing the record. As an argument the
 * provider is established before the callback can run, so that window closes.
 */
export function buildYard(
	provider: ProviderRef,
	name: string,
	build: (builder: YardBuilder) => unknown,
): Yard {
	const draft = new YardDraft(providerIdOf(provider));
	// The ten slot methods are installed on the prototype from CAPABILITY_SLOTS,
	// so they exist at runtime but not in the class declaration.
	build(draft as unknown as YardBuilder);
	return draft.compile(name);
}

/**
 * Authors a Station's registration manifest. A Station never parents a Yard
 * (ADR-0131) — `s.yard(…)` registers, it does not contain — so this returns the
 * same `StationManifest` `defineStation` returns, for the composition root to
 * hand to `station()` in `@hobo/stations`.
 */
export function buildStation(
	name: string,
	build: (builder: StationBuilder) => unknown,
): StationManifest {
	const draft = new StationDraft();
	build(draft);
	return draft.compile(name);
}

class CampDraft implements CampBuilder {
	#envType: string | undefined;
	readonly #require: string[] = [];
	readonly #prefer: string[] = [];
	readonly #labels = new Map<string, string>();
	readonly #runtime: string[] = [];
	readonly #pins = new Map<string, string>();
	#provider: unknown;
	#bindle: unknown;
	#providerAuthored = false;
	#bindleAuthored = false;

	envType(envType: EnvType): CampBuilder {
		// Typed at the signature, checked at runtime too: a JS caller, a JSON
		// config, or an `as` cast all reach here, and a Camp whose envType is a
		// typo silently loses every policy keyed on the real value.
		if (!isEnvType(envType)) {
			throw new BuilderError(
				"ENV_TYPE_UNKNOWN",
				`camp envType ${JSON.stringify(envType)} is not a declared environment type`,
				`Use one of: ${ENV_TYPES.join(", ")} — or the named methods production() / staging() / preview() / development().`,
			);
		}
		this.#envType = envType;
		return this;
	}

	production(): CampBuilder {
		return this.envType("production");
	}

	staging(): CampBuilder {
		return this.envType("staging");
	}

	preview(): CampBuilder {
		return this.envType("ephemeral");
	}

	development(): CampBuilder {
		return this.envType("development");
	}

	require(...requirements: string[]): CampBuilder {
		this.#require.push(...requirements);
		return this;
	}

	prefer(...preferences: string[]): CampBuilder {
		this.#prefer.push(...preferences);
		return this;
	}

	label(key: string, value: string): CampBuilder {
		this.#labels.set(key, value);
		return this;
	}

	runtime(...requirements: string[]): CampBuilder {
		this.#runtime.push(...requirements);
		return this;
	}

	pin(slot: string, resolverId: string): CampBuilder {
		this.#pins.set(slot, resolverId);
		return this;
	}

	provider(selection: unknown): CampBuilder {
		this.#provider = selection;
		this.#providerAuthored = true;
		return this;
	}

	bindle(owned: unknown): CampBuilder {
		this.#bindle = owned;
		this.#bindleAuthored = true;
		return this;
	}

	compile(name: string): Camp {
		// Pins are sorted so the pin list cannot record call order; every other
		// list is canonicalized by camp() itself.
		const pins = [...this.#pins.entries()]
			.sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1))
			.map(([slot, resolverId]) => ({ slot, resolverId }));
		return camp(name, {
			...(this.#envType !== undefined ? { envType: this.#envType } : {}),
			require: [...this.#require],
			prefer: [...this.#prefer],
			labels: sortedRecord(this.#labels),
			runtimeRequirements: [...this.#runtime],
			...(pins.length > 0 ? { resolverConfig: { pins } } : {}),
			// Forwarded untouched so camp() issues its own refusal for each.
			...(this.#providerAuthored
				? { defaultProvider: this.#provider as ProviderSelection }
				: {}),
			...(this.#bindleAuthored ? { bindle: this.#bindle } : {}),
		});
	}
}

class YardDraft {
	// Set once, at construction, from the provider argument. There is no setter:
	// a Yard's provider is not a thing the callback may change midway.
	readonly #provider: string;
	readonly #regions: string[] = [];
	readonly #residency: string[] = [];
	readonly #componentHosts: string[] = [];
	readonly #labels = new Map<string, string>();
	readonly #slots = new Map<CapabilitySlot, SlotBinding[]>();
	readonly #camps: Camp[] = [];

	constructor(providerId: string) {
		this.#provider = providerId;
	}

	/** Readable inside the callback, so a slot method can reason about it. */
	get providerId(): string {
		return this.#provider;
	}

	region(...regions: string[]): this {
		this.#regions.push(...regions);
		return this;
	}

	residency(...residency: string[]): this {
		this.#residency.push(...residency);
		return this;
	}

	componentHost(...hosts: string[]): this {
		this.#componentHosts.push(...hosts);
		return this;
	}

	label(key: string, value: string): this {
		this.#labels.set(key, value);
		return this;
	}

	slot(slot: CapabilitySlot, ...bindings: SlotBinding[]): this {
		if (bindings.length === 0) {
			throw new BuilderError(
				"SLOT_CALL_EMPTY",
				`slot ${slot} was declared with no offerings — a slot that names nothing constrains nothing`,
				`Pass at least one offering (y.${slot}(azure.…())) or omit the call.`,
			);
		}
		// Accumulate: a second call adds offerings, it never replaces them.
		const existing = this.#slots.get(slot);
		if (existing === undefined) {
			this.#slots.set(slot, [...bindings]);
		} else {
			existing.push(...bindings);
		}
		return this;
	}

	camp(
		nameOrCamp: string | Camp,
		build?: (builder: CampBuilder) => unknown,
	): this {
		this.#camps.push(
			typeof nameOrCamp === "string"
				? buildCamp(nameOrCamp, build)
				: nameOrCamp,
		);
		return this;
	}

	compile(name: string): Yard {
		// Fixed CAPABILITY_SLOTS order, never Map insertion order: authoring
		// order must not be able to reach the record.
		const slots: Record<string, readonly SlotBinding[]> = {};
		for (const slot of CAPABILITY_SLOTS) {
			const bindings = this.#slots.get(slot);
			if (bindings !== undefined) slots[slot] = bindings;
		}
		return defineYard(name, {
			...slots,
			provider: this.#provider,
			regions: [...this.#regions],
			residency: [...this.#residency],
			componentHosts: [...this.#componentHosts],
			labels: sortedRecord(this.#labels),
			// Sorted for the same reason defineStation sorts its Yards:
			// registration is a set, and declaration order is not information.
			camps: [...this.#camps].sort(compareCampIds),
		} as DefineYardConfig);
	}
}

// One method per capability slot, installed from the vocabulary itself so the
// authoring surface cannot drift from `CAPABILITY_SLOTS`.
for (const slot of CAPABILITY_SLOTS) {
	Object.defineProperty(YardDraft.prototype, slot, {
		configurable: true,
		writable: true,
		value: function slotMethod(
			this: YardDraft,
			...bindings: SlotBinding[]
		): YardDraft {
			return this.slot(slot, ...bindings);
		},
	});
}

class StationDraft implements StationBuilder {
	#tenant: string | undefined;
	#residency: string | undefined;
	#trustDomain: string | undefined;
	#airgap = false;
	readonly #yards: Yard[] = [];

	tenant(tenant: string): StationBuilder {
		this.#tenant = tenant;
		return this;
	}

	residency(residency: string): StationBuilder {
		this.#residency = residency;
		return this;
	}

	trustDomain(trustDomain: string): StationBuilder {
		this.#trustDomain = trustDomain;
		return this;
	}

	airgap(airgap = true): StationBuilder {
		this.#airgap = airgap;
		return this;
	}

	yard(
		providerOrYard: ProviderRef | Yard,
		name?: string,
		build?: (builder: YardBuilder) => unknown,
	): StationBuilder {
		// Both spellings register through one path: a prebuilt catalog Yard and
		// a hand-authored one are the same kind of registration. A prebuilt Yard
		// is the one-argument form, so the presence of a name is what tells the
		// two apart — never the shape of the first argument, which a Yard and a
		// provider-id string could both satisfy.
		if (name === undefined) {
			this.#yards.push(providerOrYard as Yard);
			return this;
		}
		this.#yards.push(
			buildYard(
				providerOrYard as ProviderRef,
				name,
				build ?? (() => undefined),
			),
		);
		return this;
	}

	compile(name: string): StationManifest {
		return defineStation(name, {
			isolation: {
				...(this.#tenant !== undefined ? { tenant: this.#tenant } : {}),
				...(this.#residency !== undefined
					? { residency: this.#residency }
					: {}),
				...(this.#trustDomain !== undefined
					? { trustDomain: this.#trustDomain }
					: {}),
				airgap: this.#airgap,
			},
			// defineStation sorts and de-duplicates registration itself.
			yards: this.#yards,
		});
	}
}

function sortedRecord(
	entries: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [key, value] of [...entries.entries()].sort(([a], [b]) =>
		a === b ? 0 : a < b ? -1 : 1,
	)) {
		out[key] = value;
	}
	return out;
}

function compareCampIds(a: Camp, b: Camp): number {
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}
