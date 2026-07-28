/**
 * Actor placement mode selection (ADR-0138).
 * Same defineActor / activateActor surface; host injection chooses native vs dapr.
 */

import type { ActorPlacementMode } from "@hobo/core";
import { parseActorPlacementMode } from "@hobo/core";

import type { ActorHost } from "./ports.js";

export interface PlacementResolved {
	readonly mode: ActorPlacementMode;
	readonly host: ActorHost;
	readonly source: "explicit" | "camp-runtime" | "default";
}

export interface ResolveActorPlacementInput {
	readonly explicit?: unknown;
	readonly campRuntimeRequirements?: readonly string[];
	readonly nativeHost: ActorHost;
	readonly daprHost?: ActorHost;
}

/**
 * Resolve which ActorHost backs defineActor for this Camp.
 * Default: native (ADR-0031). Dapr only when Camp asks for it or explicit mode.
 */
export function resolveActorPlacement(
	input: ResolveActorPlacementInput,
): PlacementResolved {
	if (input.explicit !== undefined) {
		const mode = parseActorPlacementMode(input.explicit);
		if (mode === "dapr") {
			if (!input.daprHost) {
				throw new Error(
					"actor placement mode 'dapr' requires a Dapr-backed ActorHost",
				);
			}
			return { mode: "dapr", host: input.daprHost, source: "explicit" };
		}
		return { mode: "native", host: input.nativeHost, source: "explicit" };
	}

	const wantsDapr = (input.campRuntimeRequirements ?? []).some(
		(r) => r === "dapr" || r === "runtime-dapr" || r.startsWith("dapr:"),
	);
	if (wantsDapr) {
		if (!input.daprHost) {
			throw new Error(
				"Camp runtimeRequirements include dapr but no Dapr ActorHost was injected",
			);
		}
		return {
			mode: "dapr",
			host: input.daprHost,
			source: "camp-runtime",
		};
	}

	return { mode: "native", host: input.nativeHost, source: "default" };
}

/**
 * Signal an actor via the messaging surface (queue signal or topic).
 * Keeps actor messaging on the unified Messaging plane when a bus is present.
 */
export async function signalActor(
	messaging: {
		publish: (
			topic: string & { readonly __brand: "TopicName" },
			body: unknown,
			options?: { key?: string },
		) => Promise<unknown>;
	},
	actorType: string,
	actorKey: string,
	message: unknown,
): Promise<void> {
	const topic = `actors.${actorType}` as string & {
		readonly __brand: "TopicName";
	};
	await messaging.publish(topic, message, { key: actorKey });
}
