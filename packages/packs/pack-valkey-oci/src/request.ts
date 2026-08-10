/**
 * The one parse boundary for a deployment request.
 *
 * A Yard hands this pack whatever a manifest, a CLI flag, or an HTTP body
 * contained: `unknown`. `parseValkeyDeploymentRequest` is where that stops being
 * unknown. It returns a `ValkeyDeploymentRequest` whose `resourceRef` is branded
 * and whose configuration has already been checked against the verified
 * manifest, and `buildValkeyDeployment` accepts nothing else — so there is no
 * path from raw input to a container spec that skips the check, and no function
 * downstream re-tests what was already decided here.
 *
 * What this parser refuses is as much the point as what it accepts: a values map
 * holding a nested object (a config key silently becoming `[object Object]`), a
 * volume binding with no storage, a resource ref that is a free-form label. Each
 * of those is a `PACK_CONFIGURATION_INVALID` at the boundary rather than a
 * surprise in a rendered config file.
 */
import {
	type PackConfigurationInputValue,
	PackError,
	type PackVolumeBinding,
	type ParsedPackConfiguration,
	parsePackConfiguration,
	type VerifiedPackManifest,
} from "@hobo/pack-framework";

import {
	buildValkeyContainerSpec,
	type ValkeyContainerSpec,
} from "./deployment.js";

declare const resourceRefBrand: unique symbol;

/**
 * `resource:<yard>/<name>`.
 *
 * Branded because this string ends up in a receipt, an event body, and a
 * container label. A parsed ref is one that can be compared to another ref
 * without wondering whether either one is a display name.
 */
export type ValkeyResourceRef = string & {
	readonly [resourceRefBrand]: "ValkeyResourceRef";
};

const RESOURCE_REF = /^resource:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;

function configurationInvalid(detail: string): never {
	throw new PackError("PACK_CONFIGURATION_INVALID", detail);
}

export function parseValkeyResourceRef(input: unknown): ValkeyResourceRef {
	if (typeof input !== "string" || !RESOURCE_REF.test(input)) {
		configurationInvalid("resourceRef must be shaped resource:<yard>/<name>");
	}
	return input as ValkeyResourceRef;
}

/** A deployment request that has crossed the parse boundary. */
export type ValkeyDeploymentRequest = {
	readonly resourceRef: ValkeyResourceRef;
	readonly config: ParsedPackConfiguration;
};

/** The rendered plan a Yard executor runs. */
export type ValkeyDeploymentPlan = {
	readonly resourceRef: ValkeyResourceRef;
	readonly spec: ValkeyContainerSpec;
};

function asRecord(
	input: unknown,
	what: string,
): Readonly<Record<string, unknown>> {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		configurationInvalid(`${what} must be an object`);
	}
	return input as Readonly<Record<string, unknown>>;
}

/**
 * Configuration values are scalars.
 *
 * A nested object here would reach `parsePackConfiguration` as something its
 * `integer`/`enum` parsers cannot describe, and the failure would name the
 * wrong culprit.
 */
function parseValues(
	input: unknown,
): Readonly<Record<string, PackConfigurationInputValue>> {
	const raw = asRecord(input, "values");
	const values: Record<string, PackConfigurationInputValue> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (
			typeof value !== "string" &&
			typeof value !== "number" &&
			typeof value !== "boolean"
		) {
			configurationInvalid(
				`configuration ${key} must be a string, number, or boolean`,
			);
		}
		values[key] = value;
	}
	return values;
}

function parseVolumeBinding(input: unknown, index: number): PackVolumeBinding {
	const raw = asRecord(input, `volumeBindings[${index}]`);
	const volumeName = raw.volumeName;
	if (typeof volumeName !== "string" || volumeName.length === 0) {
		configurationInvalid(
			`volumeBindings[${index}].volumeName must be a non-empty string`,
		);
	}
	const storage = asRecord(raw.storage, `volumeBindings[${index}].storage`);
	if (storage.kind === "local-volume") {
		if (typeof storage.volumeId !== "string" || storage.volumeId.length === 0) {
			configurationInvalid(
				`volumeBindings[${index}].storage.volumeId must be a non-empty string`,
			);
		}
		return {
			volumeName,
			storage: { kind: "local-volume", volumeId: storage.volumeId },
		};
	}
	if (storage.kind === "external-storage") {
		if (
			typeof storage.storageRef !== "string" ||
			storage.storageRef.length === 0
		) {
			configurationInvalid(
				`volumeBindings[${index}].storage.storageRef must be a non-empty string`,
			);
		}
		return {
			volumeName,
			storage: { kind: "external-storage", storageRef: storage.storageRef },
		};
	}
	configurationInvalid(
		`volumeBindings[${index}].storage.kind must be local-volume or external-storage`,
	);
}

function parseVolumeBindings(input: unknown): readonly PackVolumeBinding[] {
	if (input === undefined) return [];
	if (!Array.isArray(input))
		configurationInvalid("volumeBindings must be an array");
	return input.map((binding, index) => parseVolumeBinding(binding, index));
}

/**
 * Untrusted deployment input in, refined request out.
 *
 * The configuration is parsed against the **verified** manifest, so a request
 * cannot name a config key the pack does not declare, omit one it requires, or
 * pass a plaintext password where a locator belongs.
 */
export function parseValkeyDeploymentRequest(
	manifest: VerifiedPackManifest,
	input: unknown,
): ValkeyDeploymentRequest {
	const raw = asRecord(input, "deployment request");
	const resourceRef = parseValkeyResourceRef(raw.resourceRef);
	const volumeBindings = parseVolumeBindings(raw.volumeBindings);
	const config = parsePackConfiguration(manifest, {
		values: parseValues(raw.values),
		volumeBindings,
	});
	return { resourceRef, config };
}

/**
 * The pack's deployment entry point.
 *
 * Takes the refined request rather than raw input: everything this function
 * would otherwise have to check has already been decided, and the type system
 * is what says so.
 */
export function buildValkeyDeployment(
	manifest: VerifiedPackManifest,
	request: ValkeyDeploymentRequest,
): ValkeyDeploymentPlan {
	return {
		resourceRef: request.resourceRef,
		spec: buildValkeyContainerSpec(manifest, request.config),
	};
}
