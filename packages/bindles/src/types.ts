export const CATALOG_ROWS = [
	{ factory: "api", portRef: ["wasi:http", "hobo:http"], allowVerbs: [] },
	{
		factory: "kv",
		portRef: ["wasi:keyvalue"],
		allowVerbs: ["get", "set", "delete"],
	},
	{
		factory: "bucket",
		portRef: ["wasi:blobstore", "hobo:blob-events"],
		allowVerbs: ["read", "write", "delete"],
	},
	{
		factory: "queue",
		portRef: ["hobo:queue"],
		allowVerbs: ["enqueue", "dequeue"],
	},
	{
		factory: "topic",
		portRef: ["wasi:messaging"],
		allowVerbs: ["publish", "subscribe"],
	},
	{
		factory: "secret",
		portRef: ["wasi:config", "hobo:secrets"],
		allowVerbs: ["put", "access"],
	},
	{
		factory: "data",
		portRef: ["hobo:data"],
		allowVerbs: ["read", "write", "query", "admin"],
	},
	{ factory: "schedule", portRef: ["hobo:scheduler"], allowVerbs: [] },
	{
		factory: "websocket",
		portRef: ["wasi:websocket", "hobo:websocket"],
		allowVerbs: ["accept", "connect", "send", "broadcast", "subscribe"],
	},
	{ factory: "job", portRef: ["hobo:job"], allowVerbs: ["submit"] },
	{ factory: "web", portRef: ["wasi:http"], allowVerbs: [] },
	{ factory: "service", portRef: ["wasi:http"], allowVerbs: [] },
	/**
	 * External BYO dependency (SaaS / brownfield). No provision; Camp injects
	 * connection strings / endpoint URLs. Aspire: AddConnectionString / external.
	 */
	{ factory: "external", portRef: ["hobo:external"], allowVerbs: [] },
	/**
	 * Container image dependency. Requires oci Camp host runtime on the broker.
	 * Aspire: AddContainer.
	 */
	{ factory: "container", portRef: ["hobo:container"], allowVerbs: [] },
	/**
	 * Wasm component dependency (wasi:http or other). Requires wasm Camp host.
	 */
	{
		factory: "wasm-component",
		portRef: ["wasi:http", "hobo:wasm-component"],
		allowVerbs: [],
	},
	{
		factory: "flag",
		portRef: ["hobo:feature-flag"],
		allowVerbs: ["eval", "change"],
	},
	{
		factory: "auth",
		portRef: ["hobo:auth"],
		allowVerbs: ["verify", "session"],
	},
	{
		factory: "crypto",
		portRef: ["hobo:crypto"],
		allowVerbs: ["encrypt", "decrypt", "sign", "verify"],
	},
	{ factory: "notify", portRef: ["hobo:notify"], allowVerbs: ["send"] },
	{ factory: "guardrail", portRef: ["hobo:guardrail"], allowVerbs: ["check"] },
	{
		factory: "ui",
		portRef: ["hobo:ui-render"],
		allowVerbs: ["render", "drive"],
	},
	{ factory: "golden", portRef: ["hobo:golden"], allowVerbs: ["run", "bless"] },
	{
		factory: "experiment",
		portRef: ["hobo:experiment"],
		allowVerbs: ["assign", "expose", "analyze"],
	},
	{
		factory: "rollout",
		portRef: ["hobo:delivery"],
		allowVerbs: ["start", "step", "promote", "rollback"],
	},
] as const;

export type ResourceKind = (typeof CATALOG_ROWS)[number]["factory"];

export type AllowVerbsByKind = {
	api: never;
	kv: "get" | "set" | "delete";
	bucket: "read" | "write" | "delete";
	queue: "enqueue" | "dequeue";
	topic: "publish" | "subscribe";
	secret: "put" | "access";
	data: "read" | "write" | "query" | "admin";
	schedule: never;
	websocket: "accept" | "connect" | "send" | "broadcast" | "subscribe";
	job: "submit";
	web: never;
	service: never;
	external: never;
	container: never;
	"wasm-component": never;
	flag: "eval" | "change";
	auth: "verify" | "session";
	crypto: "encrypt" | "decrypt" | "sign" | "verify";
	notify: "send";
	guardrail: "check";
	ui: "render" | "drive";
	golden: "run" | "bless";
	experiment: "assign" | "expose" | "analyze";
	rollout: "start" | "step" | "promote" | "rollback";
};

export type AllowVerbsFor<K extends ResourceKind> = AllowVerbsByKind[K];

export interface ResourceCatalogEntry {
	readonly factory: ResourceKind;
	readonly portRef: readonly string[];
	readonly allowVerbs: readonly string[];
}

// domain-view: branded parse-don't-validate view over the generated wire form.
export interface LoweringDescriptor {
	readonly lowersTo: "hobo:sdk";
	readonly kind: ResourceKind;
	readonly name: string;
	readonly handleStableId: string;
	readonly portRef: readonly string[];
	readonly verb: string;
	readonly args: readonly unknown[];
}

// domain-view: generic, branded stableId view over the generated wire form.
export interface ResourceDescriptor<K extends ResourceKind = ResourceKind> {
	readonly kind: K;
	readonly name: string;
	readonly stableId: `${K}:${string}`;
	readonly portRef: readonly string[];
	readonly allowVerbs: readonly string[];
	readonly declaredAllow: readonly string[];
}

type VerbMethodsFor<K extends ResourceKind> = {
	[V in AllowVerbsFor<K>]: (...args: unknown[]) => LoweringDescriptor;
};

export type ResourceHandle<K extends ResourceKind, A = never> = {
	readonly kind: K;
	readonly name: string;
	readonly stableId: `${K}:${string}`;
	readonly portRef: readonly string[];
	readonly identity: {
		readonly kind: K;
		readonly name: string;
		readonly stableId: string;
	};
	readonly declaredAllow: readonly A[];
	allow<V extends AllowVerbsFor<K>>(...verbs: V[]): ResourceHandle<K, V>;
	toDescriptor(): ResourceDescriptor<K>;
} & VerbMethodsFor<K>;

export interface SecretRef {
	readonly kind: "secret-ref";
	readonly ref: string;
	readonly stableId: `secret-ref:${string}`;
	readonly lowersTo: "hobo:sdk";
}

// domain-view: readonly parse-don't-validate view over the generated wire form.
export interface ProviderAnnotation {
	readonly provider: string;
	readonly option: string;
	readonly config: Record<string, unknown>;
}

// domain-view: readonly parse-don't-validate view over the generated wire form.
export interface BindleEdge {
	readonly from: string;
	readonly to: string;
}

// domain-view: generic, branded parse-don't-validate view over the wire form.
export interface BindleResourceRecord<K extends ResourceKind = ResourceKind> {
	readonly kind: K;
	readonly name: string;
	readonly stableId: `${K}:${string}`;
	readonly declaredAllow: readonly string[];
	readonly annotations: readonly ProviderAnnotation[];
	readonly dependsOn: readonly string[];
}

export interface BindleResource<K extends ResourceKind = ResourceKind> {
	readonly kind: K;
	dependsOn(...deps: BindleResource[]): BindleResource<K>;
	/** Aspire-style WithReference — alias of dependsOn. */
	withReference(...deps: BindleResource[]): BindleResource<K>;
	allow(...verbs: AllowVerbsFor<K>[]): BindleResource<K>;
	with(...annotations: ProviderAnnotation[]): BindleResource<K>;
}

/**
 * Provider-neutral Bindle workload requirements (not provider resolver control).
 * See packages/bindles/src/requirements.ts for the parse boundary.
 */
export interface BindleRequirements {
	readonly require: readonly string[];
	readonly prefer: readonly string[];
	readonly runtimes: readonly string[];
	readonly labels: Readonly<Record<string, string>>;
}

export interface BindleDefinition {
	readonly name: string;
	readonly resources: Readonly<Record<string, BindleResourceRecord>>;
	readonly edges: readonly BindleEdge[];
	/** Provider-neutral requirements only — never provider pins or resolver IDs. */
	readonly requirements: BindleRequirements;
	/**
	 * Returns the app-host entrypoint handler bound to a resource via
	 * `b.api(handler)` / `b.web(handler)`, or `undefined` when none was bound.
	 * Non-enumerable, so it never appears in the serialized manifest graph.
	 */
	entrypoint(name: string): (() => unknown) | undefined;
}

/**
 * A `@component`-decorated class (Plan 2 Syntax 0): its `@operation`
 * methods declare shape + intent (+ optional rubric) and lower to
 * trainable manifest facts. Detected structurally via `Symbol.metadata`
 * (`Symbol.for("hobo.component.metadata")`) — no runtime import needed at
 * the manifest layer.
 */
export type DeclaredComponent = new () => object;

/** What binds an app-shaped resource: a handler thunk or a declared component. */
export type ComponentBinding = (() => unknown) | DeclaredComponent;

/** Options for BYO external dependencies (no provision). */
export interface ExternalDependencyOptions {
	readonly connectionString?: string;
	readonly endpoints?: Readonly<Record<string, string>>;
}

/** Options for container image dependencies (requires oci runtime). */
export interface ContainerDependencyOptions {
	readonly image: string;
	readonly endpoints?: Readonly<
		Record<string, { readonly port: number; readonly external?: boolean }>
	>;
	readonly env?: Readonly<Record<string, string>>;
}

/** Options for wasm component dependencies (requires wasm runtime). */
export interface WasmComponentDependencyOptions {
	readonly source: string;
	readonly witWorld?: string;
	readonly endpoints?: Readonly<Record<string, { readonly port?: number }>>;
}

export interface BindleBuilder {
	api(binding?: ComponentBinding): BindleResource<"api">;
	web(binding?: ComponentBinding): BindleResource<"web">;
	kv(): BindleResource<"kv">;
	bucket(): BindleResource<"bucket">;
	queue<T = unknown>(): BindleResource<"queue">;
	topic<T = unknown>(): BindleResource<"topic">;
	secret(): BindleResource<"secret">;
	data(): BindleResource<"data">;
	schedule(): BindleResource<"schedule">;
	websocket(binding?: ComponentBinding): BindleResource<"websocket">;
	job(binding?: ComponentBinding): BindleResource<"job">;
	service(binding?: ComponentBinding): BindleResource<"service">;
	flag(): BindleResource<"flag">;
	auth(): BindleResource<"auth">;
	crypto(): BindleResource<"crypto">;
	notify(): BindleResource<"notify">;
	guardrail(): BindleResource<"guardrail">;
	ui(binding?: ComponentBinding): BindleResource<"ui">;
	golden(): BindleResource<"golden">;
	experiment(): BindleResource<"experiment">;
	rollout(): BindleResource<"rollout">;
	/** BYO external service (connection string / URL). No host runtime required. */
	external(options?: ExternalDependencyOptions): BindleResource<"external">;
	/** Container image dependency — requires `hobo add runtime-oci`. */
	container(options: ContainerDependencyOptions): BindleResource<"container">;
	/** Wasm component dependency — requires `hobo add runtime-wasm`. */
	wasmComponent(
		options: WasmComponentDependencyOptions,
	): BindleResource<"wasm-component">;
}
