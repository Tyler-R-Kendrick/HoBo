import { describe, expect, it } from "vitest";
import { vercelImpedanceFindings } from "../src/impedance.js";
import {
	createVercelProvider,
	supportsAnonymousTemporaryDeploy,
	vercelNativePorts,
} from "../src/index.js";
import {
	parseVercelDropDeployOutput,
	provisionTemporaryEnvironmentStation,
	sanitizeVercelDropProjectName,
	VERCEL_DROP_URL,
	type VercelDropTransport,
} from "../src/temporary-station.js";

describe("@hobo/provider-vercel", () => {
	it("exposes Matching-honest native ports", () => {
		const provider = createVercelProvider();
		expect(vercelNativePorts().length).toBeGreaterThan(0);
		expect(provider.capabilities.length).toBe(vercelNativePorts().length);
		const compute = provider.capabilities.find((c) => c.port === "compute");
		expect(compute?.satisfies({ port: "compute" }).kind).toBe("full");
	});

	it("supports Vercel Drop temporary deploy", () => {
		expect(supportsAnonymousTemporaryDeploy).toBe(true);
		expect(VERCEL_DROP_URL).toBe("https://vercel.com/drop");
	});

	it("records queue impedance (prefer degrade / other provider)", () => {
		const findings = vercelImpedanceFindings({ features: ["queue"] });
		expect(findings.some((f) => f.code === "no-native-queue")).toBe(true);
	});

	it("parses Drop / vercel deploy output", () => {
		expect(
			parseVercelDropDeployOutput(
				'{"url":"hobo-drop-x.vercel.app","id":"dpl_1","projectName":"hobo-drop-x"}\n',
			),
		).toEqual({
			stationUrl: "https://hobo-drop-x.vercel.app",
			deploymentId: "dpl_1",
			projectName: "hobo-drop-x",
		});
		const fromText = parseVercelDropDeployOutput(
			"Production: https://hobo-drop-y.vercel.app\n",
		);
		expect(fromText.stationUrl).toBe("https://hobo-drop-y.vercel.app");
	});

	it("provisions via injectable Drop transport (no VERCEL_TOKEN)", async () => {
		const transport: VercelDropTransport = {
			async deployDrop({ projectName, stationId }) {
				return {
					projectName,
					deploymentId: `dpl-${stationId}`,
					stationUrl: `https://${projectName}.vercel.app`,
					claimUrl: `https://vercel.com/${projectName}`,
				};
			},
		};
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "st:vercel:1",
			transport,
		});
		expect(result.providerId).toBe("vercel");
		expect(result.anonymous).toBe(true);
		expect(result.temporary).toBe(true);
		expect(result.stationUrl).toContain(".vercel.app");
		expect(result.claimUrl).toContain("vercel.com");
		expect(sanitizeVercelDropProjectName("st:vercel:1")).toMatch(/^hobo-drop-/);
	});
});
