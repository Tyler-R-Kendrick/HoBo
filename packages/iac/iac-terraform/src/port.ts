import type { ProviderPort } from "@hobo/core";
import { createPortDescriptor } from "@hobo/core";
import { type JsonValue } from "./json.js";


// public-contract: the IaC provider port interface id this boundary serves.
export const IAC_TERRAFORM_INTERFACE = "hobo:iac/provider";

// domain-view: the IaC provider port shape adapters satisfy — the same
// boundary contract @hobo/iac-pulumi declares, so provisioning callers depend
// on the port rather than a concrete HCL binary.
export interface IacProvider {
	readonly id: string;
	readonly binary: string;
	readonly toolchainVersion: string;
	readonly stateBackend: JsonValue;
	preview(program: JsonValue): Promise<JsonValue>;
	apply(program: JsonValue): Promise<JsonValue>;
	refresh(program: JsonValue): Promise<JsonValue>;
	destroy(program: JsonValue): Promise<JsonValue>;
}

// The provider-port descriptor for this boundary, built through @hobo/core so
// the adapter's only inward dependency is the shared port vocabulary.
const terraformPortDescriptor = createPortDescriptor({
	kind: "provider",
	name: "iac-terraform",
	interface: IAC_TERRAFORM_INTERFACE,
	stability: "preview",
});
if (terraformPortDescriptor.kind !== "provider") {
	throw new Error("iac-terraform port must be a provider port");
}
export const IAC_TERRAFORM_PORT: ProviderPort = terraformPortDescriptor;
