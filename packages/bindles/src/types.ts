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
	flag: "eval" | "change";
	auth: "verify" | "session";
	crypto: "encrypt" | "decrypt" | "sign" | "verify";
	notify: "send";
	guardrail: "check";
	ui: "render" | "drive";
	golden: "run" | "bless";
	experiment: "assign" | "expose" | "analyze";
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
	allow(...verbs: AllowVerbsFor<K>[]): BindleResource<K>;
	with(...annotations: ProviderAnnotation[]): BindleResource<K>;
}

export interface BindleDefinition {
	readonly name: string;
	readonly resources: Readonly<Record<string, BindleResourceRecord>>;
	readonly edges: readonly BindleEdge[];
	/**
	 * Returns the app-host entrypoint handler bound to a resource via
	 * `b.api(handler)` / `b.web(handler)`, or `undefined` when none was bound.
	 * Non-enumerable, so it never appears in the serialized manifest graph.
	 */
	entrypoint(name: string): (() => unknown) | undefined;
}

export interface BindleBuilder {
	api(handler?: () => unknown): BindleResource<"api">;
	web(handler?: () => unknown): BindleResource<"web">;
	kv(): BindleResource<"kv">;
	bucket(): BindleResource<"bucket">;
	queue<T = unknown>(): BindleResource<"queue">;
	topic<T = unknown>(): BindleResource<"topic">;
	secret(): BindleResource<"secret">;
	data(): BindleResource<"data">;
	service(): BindleResource<"service">;
}
