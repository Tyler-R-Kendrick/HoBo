import { bindleScope } from "@hobo/bindles/topology";
import { camp, providerSelection } from "@hobo/camps";
import { type Yard, yard } from "@hobo/yards";

export function makeYard(name: string, providerId: string): Yard {
	const app = bindleScope("shop", (collector) => {
		collector.use({
			kind: "service",
			name: "api",
			stableId: "service:api",
			portRef: ["wasi:http"],
		});
	});
	const dev = camp("dev", {
		bindle: app,
		runtime: { kind: "runtime", id: "runtime-local" },
		defaultProvider: providerSelection(providerId),
	});
	return yard(name, { camps: [dev] });
}
