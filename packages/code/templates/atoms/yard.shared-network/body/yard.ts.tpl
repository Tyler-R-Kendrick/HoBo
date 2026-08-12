import { camp } from "@hobo/camps";
import { yard } from "@hobo/yards";

/* @hobo.entity yard:{{name}} */
export const topology = yard("{{name}}-yard", {
	provider: /* @hobo.slot provider strategy=once */"{{provider}}"/* @hobo.end */,
	network: [
/* @hobo.slot network strategy=append */
		"{{network}}",
/* @hobo.end */
	],
	camps: [
/* @hobo.slot camps strategy=append */
		camp("{{campName}}"),
/* @hobo.end */
	],
});
