import { UsageError } from "../shell/errors.js";
import type { ParsedTemplateId, ProjectName } from "../types/scaffold.js";
import { VALID_TEMPLATES } from "../types/scaffold.js";

export function buildProjectFiles(input: {
	readonly name: ProjectName;
	readonly template: ParsedTemplateId;
}): Map<string, string> {
	return new Map([
		[".gitignore", ".hobo/\nnode_modules/\ndist/\n"],
		["app.test.ts", appTestSource(input)],
		["app.ts", appSource(input)],
		["hobo.bindle.json", `${JSON.stringify(bindle(input), null, 2)}\n`],
		["package.json", `${JSON.stringify(packageJson(input), null, 2)}\n`],
		["src/_generated/hobo.d.ts", hoboDeclarations()],
		["src/_generated/index.ts", generatedSource()],
		["tsconfig.json", `${JSON.stringify(tsconfig(), null, 2)}\n`],
	]);
}

function packageJson(input: { readonly name: ProjectName }) {
	return {
		name: input.name,
		private: true,
		type: "module",
		scripts: {
			dev: "hobo dev",
			test: "node --test",
			typecheck: "tsc --noEmit",
		},
		devDependencies: {
			typescript: "5.5.4",
		},
	};
}

function bindle(input: { readonly name: ProjectName; readonly template: ParsedTemplateId }) {
	return {
		schemaVersion: "hobo.bindle/v1",
		name: input.name,
		template: input.template,
		entrypoint: "app.ts",
		generated: "src/_generated/index.ts",
		resources: [
			{
				name: `${input.template}Store`,
				kind: "kv",
			},
		],
		handlers: [
			{
				name: "api",
				kind: "http",
			},
		],
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

function appSource(input: { readonly name: ProjectName; readonly template: ParsedTemplateId }) {
	const details = templateDetails(input.template);
	return `import { createHobo, create${details.runtimeName}Store } from "./src/_generated/index.js";

const hobo = createHobo({
  name: "${input.name}",
  template: "${input.template}"
});

export const resource = hobo.resource("${details.resourceName}", create${details.runtimeName}Store());

export const api = hobo.api("${details.route}", async (request) => {
  const record = await resource.put("${details.seedKey}", {
    message: "${details.message}"
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

function appTestSource(input: { readonly name: ProjectName; readonly template: ParsedTemplateId }) {
	const details = templateDetails(input.template);
	return `import { createTestRuntime } from "./src/_generated/index.js";
import { api, resource } from "./app.js";

const runtime = createTestRuntime({
  app: "${input.name}",
  template: "${input.template}"
});

await runtime.expectResource(resource, "${details.resourceName}");
await runtime.expectHandler(api, "${details.route}");
await runtime.expectResponse(api, {
  path: "${details.route}",
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

function templateDetails(template: ParsedTemplateId) {
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
		default:
			throw new UsageError(`Unknown template "${template}". Valid templates: ${VALID_TEMPLATES.join(", ")}.`);
	}
}
