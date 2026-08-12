import { loadPatternCatalog } from "./catalog.js";
import { PatternParseError } from "./parse.js";

export const CLI_STARTER_ALIASES = [
	"todo",
	"api",
	"agent",
	"fullstack",
] as const;
export type CliStarterAlias = (typeof CLI_STARTER_ALIASES)[number];

export function catalogStarterId(template: CliStarterAlias): string {
	return `starter.cli.${template}`;
}

export function assertCatalogStarter(template: CliStarterAlias): void {
	const catalog = loadPatternCatalog();
	const id = catalogStarterId(template);
	if (!catalog.patterns.some((item) => item.id === id)) {
		throw new PatternParseError(`catalog missing ${id}`);
	}
}

function details(template: CliStarterAlias) {
	switch (template) {
		case "todo":
			return {
				runtimeName: "Todo",
				resourceName: "todoStore",
				route: "/todos",
				seedKey: "first-task",
				message: "Track a first HoBo task",
			};
		case "api":
			return {
				runtimeName: "Api",
				resourceName: "apiStore",
				route: "/api/hello",
				seedKey: "hello",
				message: "Hello from HoBo",
			};
		case "agent":
			return {
				runtimeName: "Agent",
				resourceName: "agentStore",
				route: "/agent/run",
				seedKey: "first-run",
				message: "Agent handler ready",
			};
		case "fullstack":
			return {
				runtimeName: "Fullstack",
				resourceName: "fullstackStore",
				route: "/app",
				seedKey: "home",
				message: "Fullstack shell ready",
			};
	}
}

export function renderCliStarterFiles(input: {
	readonly name: string;
	readonly template: CliStarterAlias;
}): Map<string, string> {
	assertCatalogStarter(input.template);
	const spec = details(input.template);
	return new Map([
		[".gitignore", ".hobo/\nnode_modules/\ndist/\n"],
		["app.test.ts", appTestSource(input, spec)],
		["app.ts", appSource(input, spec)],
		["hobo.bindle.json", `${JSON.stringify(bindle(input), null, 2)}\n`],
		["package.json", `${JSON.stringify(packageJson(input.name), null, 2)}\n`],
		["src/_generated/hobo.d.ts", hoboDeclarations()],
		["src/_generated/index.ts", generatedSource()],
		["tsconfig.json", `${JSON.stringify(tsconfig(), null, 2)}\n`],
	]);
}

function packageJson(name: string) {
	return {
		name,
		private: true,
		type: "module",
		scripts: {
			dev: "hobo dev",
			test: "node --experimental-strip-types --test app.test.ts",
			typecheck: "tsc --noEmit",
		},
		devDependencies: {
			typescript: "5.5.4",
		},
	};
}

function bindle(input: {
	readonly name: string;
	readonly template: CliStarterAlias;
}) {
	return {
		schemaVersion: "hobo.bindle/v1",
		name: input.name,
		template: input.template,
		entrypoint: "app.ts",
		generated: "src/_generated/index.ts",
		resources: [{ name: `${input.template}Store`, kind: "kv" }],
		handlers: [{ name: "api", kind: "http" }],
	};
}

function tsconfig() {
	return {
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "Bundler",
			strict: true,
			noEmit: true,
			allowImportingTsExtensions: true,
			types: [],
		},
		include: ["app.ts", "app.test.ts", "src/_generated/**/*.ts"],
	};
}

function appSource(
	input: { readonly name: string; readonly template: CliStarterAlias },
	spec: ReturnType<typeof details>,
) {
	return `import { createHobo, create${spec.runtimeName}Store } from "./src/_generated/index.ts";

const hobo = createHobo({
  name: "${input.name}",
  template: "${input.template}"
});

export const resource = hobo.resource("${spec.resourceName}", create${spec.runtimeName}Store());

export const api = hobo.api("${spec.route}", async (request) => {
  const record = await resource.put("${spec.seedKey}", {
    message: "${spec.message}"
  });

  return {
    status: 200,
    body: {
      template: "${input.template}",
      path: request.path,
      record
    }
  };
});
`;
}

function appTestSource(
	input: { readonly name: string; readonly template: CliStarterAlias },
	spec: ReturnType<typeof details>,
) {
	return `import { createTestRuntime } from "./src/_generated/index.ts";
import { api, resource } from "./app.ts";

const runtime = createTestRuntime({
  app: "${input.name}",
  template: "${input.template}"
});

await runtime.expectResource(resource, "${spec.resourceName}");
await runtime.expectHandler(api, "${spec.route}");
await runtime.expectResponse(api, {
  path: "${spec.route}",
  body: {
    template: "${input.template}"
  }
});
`;
}

function generatedSource() {
	return `// generated hobo new bindings seed
// Checked in by hobo new so hobo dev can start before real codegen runs.

type Template = "todo" | "api" | "agent" | "fullstack";
type StoreValue = Record<string, string>;
type StoreRecord = { key: string; value: StoreValue };

interface Store {
  kind: string;
  put(key: string, value: StoreValue): Promise<StoreRecord>;
  get(key: string): Promise<StoreValue | null>;
}

interface Resource {
  name: string;
  store: Store;
  put(key: string, value: StoreValue): Promise<StoreRecord>;
  get(key: string): Promise<StoreValue | null>;
}

interface HandlerRequest {
  path: string;
}

interface HandlerResponse {
  status: number;
  body: {
    template: Template;
    path: string;
    [key: string]: unknown;
  };
}

interface Handler {
  route: string;
  run(request: HandlerRequest): Promise<HandlerResponse>;
}

interface Hobo {
  resource(name: string, store: Store): Resource;
  api(route: string, handler: (request: HandlerRequest) => Promise<HandlerResponse>): Handler;
}

export function createHobo(options: { name: string; template: Template }): Hobo {
  void options;

  return {
    resource(name: string, store: Store): Resource {
      return {
        name,
        store,
        put: store.put.bind(store),
        get: store.get.bind(store)
      };
    },
    api(route: string, handler: (request: HandlerRequest) => Promise<HandlerResponse>): Handler {
      return {
        route,
        run: handler
      };
    }
  };
}

export function createApiStore(): Store {
  return createMemoryStore("api");
}

export function createTodoStore(): Store {
  return createMemoryStore("todo");
}

export function createAgentStore(): Store {
  return createMemoryStore("agent");
}

export function createFullstackStore(): Store {
  return createMemoryStore("fullstack");
}

export function createTestRuntime({ app, template }: { app: string; template: Template }) {
  return {
    app,
    template,
    async expectResource(resource: Resource, name: string) {
      if (resource.name !== name) {
        throw new Error(\`Expected resource \${name}, got \${resource.name}\`);
      }
    },
    async expectHandler(handler: Handler, route: string) {
      if (handler.route !== route) {
        throw new Error(\`Expected route \${route}, got \${handler.route}\`);
      }
    },
    async expectResponse(handler: Handler, request: { path: string; body: { template: Template } }) {
      const response = await handler.run({ path: request.path });
      if (response.body.template !== request.body.template) {
        throw new Error(\`Expected template \${request.body.template}, got \${response.body.template}\`);
      }
    }
  };
}

function createMemoryStore(kind: string): Store {
  const values = new Map<string, StoreValue>();
  return {
    kind,
    async put(key: string, value: StoreValue): Promise<StoreRecord> {
      values.set(key, value);
      return { key, value };
    },
    async get(key: string): Promise<StoreValue | null> {
      return values.get(key) ?? null;
    }
  };
}
`;
}

function hoboDeclarations() {
	return `declare module "@hobo/sdk" {
  export interface HoboOptions {
    name: string;
    template: "todo" | "api" | "agent" | "fullstack";
  }

  export interface HoboRequest {
    path: string;
  }

  export interface HoboResponse {
    status: number;
    body: Record<string, unknown>;
  }

  export interface HoboResource<TStore> {
    name: string;
    store: TStore;
  }

  export interface HoboHandler {
    route: string;
    run(request: HoboRequest): Promise<HoboResponse>;
  }

  export interface Hobo {
    resource<TStore>(name: string, store: TStore): HoboResource<TStore>;
    api(route: string, handler: (request: HoboRequest) => Promise<HoboResponse>): HoboHandler;
  }

  export function createHobo(options: HoboOptions): Hobo;
}
`;
}
