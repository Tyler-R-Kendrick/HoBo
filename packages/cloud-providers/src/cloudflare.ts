/**
 * Cloudflare: the default Yard, plus the slot factories for authoring your own.
 *
 * `Yard()` returns everything Cloudflare *can* allocate — a catalog, not a
 * selection. Which offering a given resource gets is decided later, by ADR-0151
 * selection, against the requirements the app actually states.
 *
 * SCOPE: Cloudflare is one of the two providers that ships HTTP deployment
 * resolvers (`cloudflareResolverRegistry`), so this catalog is backed by real
 * `api.cloudflare.com/client/v4` drivers. Those drivers are proven against an
 * injected fake transport; a live deploy additionally needs real credentials
 * and network egress, which no test here supplies.
 */
import {
	type CloudflareYardOptions as CloudflareCatalogOptions,
	cloudflareYardSpec,
} from "@hobo/provider-cloudflare";
import type { Yard as ParsedYard } from "@hobo/yards";

import {
	type ComposedYardOptions,
	composeYard,
	regionOption,
} from "./compose.js";

export {
	type D1Options,
	d1,
	type KvOptions,
	kv,
	type PagesOptions,
	pages,
	type QueuesOptions,
	queues,
	R2_JURISDICTIONS,
	type R2Jurisdiction,
	type R2Options,
	r2,
	type WorkersOptions,
	workers,
} from "@hobo/provider-cloudflare";

/** Yard name used when the caller does not supply one. */
// public-contract: the name every default Cloudflare Yard is registered under; changing it renames them all.
export const DEFAULT_CLOUDFLARE_YARD_NAME = "cloudflare";

export interface CloudflareYardOptions
	extends ComposedYardOptions,
		Omit<CloudflareCatalogOptions, "name"> {}

/** The default Cloudflare Yard: the full allocatable catalog, canonicalized. */
export function Yard(options: CloudflareYardOptions = {}): ParsedYard {
	return composeYard(
		DEFAULT_CLOUDFLARE_YARD_NAME,
		cloudflareYardSpec(regionOption(options.regions)),
		options,
	);
}
