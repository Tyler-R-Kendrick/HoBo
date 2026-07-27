/** Single source of truth for header and sidebar navigation. */

export type NavItem = { label: string; slug: string };
export type NavGroup = { label: string; slug: string; items: NavItem[] };

export const nav: NavGroup[] = [
	{
		label: "Guide",
		slug: "/guide/",
		items: [
			{ label: "What is HoBo?", slug: "/guide/" },
			{ label: "Getting started", slug: "/guide/getting-started/" },
			{ label: "Core concepts", slug: "/guide/concepts/" },
			{ label: "Architecture", slug: "/guide/architecture/" },
			{ label: "The Conductor", slug: "/guide/broker/" },
			{ label: "The hobo CLI", slug: "/guide/cli/" },
			{ label: "Custom providers", slug: "/guide/custom-providers/" },
			{ label: "The Bridge", slug: "/guide/bridge/" },
			{ label: "The trail map", slug: "/guide/status/" },
		],
	},
	{
		label: "Primitives",
		slug: "/primitives/",
		items: [
			{ label: "Meet the primitives", slug: "/primitives/" },
			{ label: "Bindles", slug: "/primitives/bindles/" },
			{ label: "Camps", slug: "/primitives/camps/" },
			{ label: "Yards", slug: "/primitives/yards/" },
			{ label: "Junctions", slug: "/primitives/junctions/" },
		],
	},
	{
		label: "Testing",
		slug: "/testing/",
		items: [
			{ label: "Testing overview", slug: "/testing/" },
			{ label: "Unit tests & boundaries", slug: "/testing/unit/" },
			{ label: "Contracts & PACT", slug: "/testing/contracts/" },
			{ label: "Effect-aware isolation", slug: "/testing/effects/" },
			{ label: "Durable EventStore", slug: "/testing/durability/" },
			{ label: "Deployment rehearsal", slug: "/testing/deployment/" },
			{ label: "Bridge modes", slug: "/testing/bridge-modes/" },
			{ label: "Chaos & availability", slug: "/testing/chaos/" },
			{ label: "Conformance & golden", slug: "/testing/conformance/" },
		],
	},
	{
		label: "Reference",
		slug: "/reference/",
		items: [
			{ label: "Reference overview", slug: "/reference/" },
			{ label: "Package map", slug: "/reference/packages/" },
			{ label: "EventStore & journal", slug: "/reference/eventstore/" },
			{ label: "Contracts & Gatekeeper", slug: "/reference/contracts/" },
			{ label: "Effects & resiliency", slug: "/reference/effects/" },
			{ label: "Event families", slug: "/reference/events/" },
			{ label: "CLI surface", slug: "/reference/cli/" },
			{ label: "Runtime ports", slug: "/reference/runtime-ports/" },
			{ label: "WIT & storage", slug: "/reference/wit-storage/" },
			{ label: "Glossary", slug: "/reference/glossary/" },
		],
	},
	{
		label: "The Crew",
		slug: "/crew/",
		items: [
			{ label: "Meet the Crew", slug: "/crew/" },
			{ label: "SRE", slug: "/crew/sre/" },
			{ label: "Endpoint Monitor", slug: "/crew/endpoint-monitor/" },
			{ label: "GitOps", slug: "/crew/gitops/" },
			{ label: "Platform Engineer", slug: "/crew/platform-engineer/" },
			{ label: "SWE", slug: "/crew/swe/" },
			{ label: "UX Designer", slug: "/crew/ux-designer/" },
			{ label: "FinOps", slug: "/crew/finops/" },
			{ label: "Shared model", slug: "/crew/shared-model/" },
		],
	},
	{
		label: "Roles",
		slug: "/roles/",
		items: [
			{ label: "Who writes what", slug: "/roles/" },
			{ label: "HoBo for Developers", slug: "/roles/developers/" },
			{ label: "HoBo for Platform Engineers", slug: "/roles/platform-engineers/" },
			{ label: "HoBo for DevSecOps", slug: "/roles/devsecops/" },
			{ label: "HoBo for Agents", slug: "/agents/" },
			{ label: "The MCP surface", slug: "/agents/mcp/" },
		],
	},
];
