import type { ProviderPort } from "@hobo/core";
import { createPortDescriptor } from "@hobo/core";

// The subscription-gateway port a transport (WebSocket/SSE, backed by the
// Streamer) satisfies to carry reactive pushes to clients (data-plane.md Plan 32
// §Transport). The kernel depends inward on the @hobo/core port vocabulary only.
export const SUBSCRIPTION_GATEWAY_INTERFACE = "hobo:subscription/gateway";

export const SUBSCRIPTION_GATEWAY_PORT: ProviderPort = createPortDescriptor({
	kind: "provider",
	name: "subscription-gateway",
	interface: SUBSCRIPTION_GATEWAY_INTERFACE,
	stability: "preview",
}) as ProviderPort;
