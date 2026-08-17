/**
 * `@hobo/cloud-providers` — one import for every cloud's default Yard.
 *
 * The authoring shape this package exists to serve:
 *
 * ```ts
 * import { aws, azure, cloudflare } from "@hobo/cloud-providers";
 * import { defineStation } from "@hobo/yards";
 *
 * export default defineStation("acme", {
 *   yards: [aws.Yard(), azure.Yard(), cloudflare.Yard({ regions: ["weur"] })],
 * });
 * ```
 *
 * Each namespace exposes `Yard()` — the provider's full allocatable catalog,
 * parsed into a real `Yard` — alongside that provider's slot factories, so
 * narrowing or re-parameterizing a catalog uses the same typed vocabulary the
 * default is built from:
 *
 * ```ts
 * import { defineYard } from "@hobo/yards";
 * import { azure } from "@hobo/cloud-providers";
 *
 * // Only the offerings this team is willing to run.
 * export const prod = defineYard("prod-eu", {
 *   provider: "azure",
 *   region: "westeurope",
 *   web: [azure.containerApps({ ingress: "external" }), azure.aks({ replicas: 3 })],
 *   data: azure.postgresFlexible({ tier: "GeneralPurpose" }),
 * });
 * ```
 *
 * A Yard is a **catalog, not an inventory** (ADR-0157 decision 1): its rows say
 * what the provider *is able to* allocate, so several entries per capability is
 * the normal case and declaring one allocates nothing. Selection among them
 * happens at resolution time under ADR-0151's hard gates and lexicographic
 * ranking — never here.
 *
 * HONEST SCOPE, per provider:
 *   - **cloudflare**, **vercel** — ship HTTP deployment resolvers, exercised in
 *     tests against an injected fake transport. No live deploy is proven here:
 *     that additionally needs real credentials and network egress.
 *   - **aws**, **azure**, **gcp** — catalog only. No resolvers and no
 *     registered Resource Definitions for their product ids, so a deploy
 *     against these Yards fails closed at resolution rather than half-applying.
 */
export * as aws from "./aws.js";
export * as azure from "./azure.js";
export {
	BuilderError,
	type BuilderErrorCode,
	type CampBuilder,
	camp,
	type ProviderNamespaceRef,
	type ProviderRef,
	providerIdOf,
	type StationBuilder,
	type StationManifest,
	station,
	type YardBuilder,
	type YardSlotMethods,
	yard,
} from "./builders.js";
export * as cloudflare from "./cloudflare.js";

export {
	type CatalogRow,
	type ComposedYardOptions,
	composeYard,
	type YardSpecLike,
} from "./compose.js";
export * as gcp from "./gcp.js";
export * as vercel from "./vercel.js";
