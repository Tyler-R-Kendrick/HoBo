export const HELLO_BINDLE_CAPABILITY = "hobo:examples/health-capability@0.1.0";

export const helloBindleComponent = {
	id: "hello-bindle",
	imports: [HELLO_BINDLE_CAPABILITY],
	exports: {
		"wasi:http/incoming-handler@0.2.0": {
			handle: async (
				request: { method: string; path: string },
				context: {
					callImport: (
						importInterface: string,
						operation: string,
						payload?: unknown,
					) => Promise<unknown>;
				},
			) => {
				if (request.path === "/health") {
					const capability = (await context.callImport(
						HELLO_BINDLE_CAPABILITY,
						"health",
					)) as { status: number; body: string };
					return {
						status: capability.status,
						headers: [] as [string, string][],
						body: capability.body,
					};
				}
				return { status: 404, headers: [], body: "not-found" };
			},
		},
	},
};

export const helloBindleProvider = {
	id: "hello-bindle-capability",
	exports: {
		[HELLO_BINDLE_CAPABILITY]: {
			health: () => ({ status: 200, body: "hello-bindle:ok" }),
		},
	},
};
