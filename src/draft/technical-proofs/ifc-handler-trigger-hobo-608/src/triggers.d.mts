export interface TriggerEdge {
  readonly id: string;
  readonly kind:
    | "http.route"
    | "topic.subscribe"
    | "bucket.on"
    | "schedule.cron"
    | "schedule.every"
    | "queue.worker";
  readonly resource: string;
  readonly event?: string;
  readonly cron?: string;
  readonly every?: string;
  readonly method?: string;
  readonly path?: string;
  readonly batch?: number;
  readonly exportInterface: string;
  readonly handler: string;
  readonly inferredPermissions?: readonly string[];
  readonly durableRuntime?: {
    readonly primitive: "workflow";
    readonly interface: "hobo:runtime/workflow@0.1.0";
    readonly handler: string;
  };
}

export interface ResourceHandle<Kind extends string = string, Client = unknown> {
  readonly kind: Kind;
  readonly name: string;
  readonly stableId: `${Kind}:${string}`;
  readonly port: string;
  readonly clientType?: string;
  readonly triggers: readonly TriggerEdge[];
  readonly bindings: Readonly<Record<string, BindingDescriptor>>;
}

export interface BindingDescriptor {
  readonly port: string;
  readonly resource: string;
  readonly clientType: string;
}

export interface KvClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface QueueClient {
  enqueue(message: unknown): Promise<void>;
  dequeue(): Promise<unknown>;
}

export interface TopicClient {
  publish(message: unknown): Promise<void>;
}

export interface BucketClient {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export type BindingMap = Record<string, ResourceHandle<string, unknown>>;

export type BindingClients<Bindings extends BindingMap> = {
  readonly [Key in keyof Bindings]: Bindings[Key] extends ResourceHandle<string, infer Client>
    ? Client
    : never;
};

export interface HandlerContext<Bindings extends BindingMap = {}> {
  readonly params: Readonly<Record<string, string>>;
  json<T = unknown>(): Promise<T>;
  readonly body: unknown;
  readonly bindings: BindingClients<Bindings>;
  readonly config: Readonly<Record<string, string>>;
  readonly user?: unknown;
  readonly identity?: unknown;
}

export type Handler<Bindings extends BindingMap = {}> = (
  ctx: HandlerContext<Bindings>,
) => unknown | Promise<unknown>;

export interface ApiHandle<Bindings extends BindingMap = {}> extends ResourceHandle<"api", never> {
  get(path: string, handler: Handler<Bindings>): TriggerEdge;
  post(path: string, handler: Handler<Bindings>): TriggerEdge;
  put(path: string, handler: Handler<Bindings>): TriggerEdge;
  patch(path: string, handler: Handler<Bindings>): TriggerEdge;
  delete(path: string, handler: Handler<Bindings>): TriggerEdge;
}

export interface TopicHandle extends ResourceHandle<"topic", TopicClient> {
  subscribe(eventType: string, handler: Handler | WorkflowHandler): TriggerEdge;
}

export interface ScheduleHandle extends ResourceHandle<"schedule", never> {
  cron(expression: string, handler: Handler | WorkflowHandler): TriggerEdge;
  every(spec: string, handler: Handler | WorkflowHandler): TriggerEdge;
}

export interface QueueHandle extends ResourceHandle<"queue", QueueClient> {
  worker(handler: Handler, opts?: { batch?: number }): TriggerEdge;
}

export interface BucketHandle extends ResourceHandle<"bucket", BucketClient> {
  on(event: string, handler: Handler | WorkflowHandler): TriggerEdge;
}

export interface WorkflowHandler {
  readonly kind: "workflow";
  readonly name: string;
  readonly handler: (...args: unknown[]) => unknown;
}

export class TriggerContractError extends Error {
  readonly path: string;
  constructor(path: string, message: string);
}

export function api<Bindings extends BindingMap = {}>(
  name: string,
  options?: { bind?: Bindings },
): ApiHandle<Bindings>;

export function kv(name: string): ResourceHandle<"kv", KvClient>;
export function queue(name: string): ResourceHandle<"queue", QueueClient>;
export function topic(name: string, options?: { durableEvents?: boolean }): TopicHandle;
export function schedule(name: string, options?: { durableEvents?: boolean }): ScheduleHandle;
export function bucket(name: string, options?: { durableEvents?: boolean }): BucketHandle;
export function workflow(name: string, handler: (...args: unknown[]) => unknown): WorkflowHandler;

export function compileHandlerManifest(
  resources: readonly ResourceHandle<string, unknown>[],
  options?: {
    readonly triggers?: readonly TriggerEdge[];
    readonly componentHost?: {
      readonly kind: string;
      readonly version: string;
    };
  },
): {
  readonly schema: "hobo.manifest/v1";
  readonly componentHost: {
    readonly kind: string;
    readonly version: string;
  };
  readonly resources: Record<string, unknown>;
  readonly triggerEdges?: readonly TriggerEdge[];
};

export interface TriggerFiredEvent {
  readonly type: "trigger.Fired";
  readonly triggerId: string;
  readonly kind: string;
  readonly resource: string;
  readonly handler: string;
  readonly success: boolean;
}

export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly params?: Record<string, string>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface RuntimeLocalPorts {
  readonly http: {
    register(method: string, path: string, handler: (req: HttpRequest) => Promise<HttpResponse>): void;
    handle(req: HttpRequest): Promise<HttpResponse>;
  };
  readonly scheduler: {
    scheduleEvery(resource: string, spec: string, handler: () => Promise<void> | void): void;
    scheduleCron(resource: string, expression: string, handler: () => Promise<void> | void): void;
    tick(resource: string): Promise<void>;
  };
  readonly messaging: {
    subscribe(resource: string, eventType: string, handler: (payload: unknown) => Promise<void> | void): void;
    publish(resource: string, eventType: string, payload: unknown): Promise<void>;
  };
  readonly blobStore: {
    on(resource: string, event: string, handler: (key: string) => Promise<void> | void): void;
    write(resource: string, key: string, value: unknown): Promise<void>;
  };
  readonly queue: {
    worker(resource: string, handler: (message: { messageId: string; body: unknown }) => Promise<void> | void): void;
    enqueue(resource: string, body: unknown): Promise<void>;
    readonly completed: readonly string[];
  };
}

export interface LocalEventStore {
  append(event: TriggerFiredEvent): void;
  readonly events: readonly TriggerFiredEvent[];
}

export function createLocalEventStore(): LocalEventStore;
export function createRuntimeLocalPorts(): RuntimeLocalPorts;

export interface ParsedManifest {
  readonly schema: "hobo.manifest/v1";
  readonly triggerEdges?: readonly TriggerEdge[];
}

export interface HandlerRegistry {
  readonly get: (name: string) => ((ctx: unknown) => unknown | Promise<unknown>) | undefined;
}

export class TriggerDispatcher {
  constructor(options: {
    readonly manifest: ParsedManifest;
    readonly ports: RuntimeLocalPorts;
    readonly eventStore: LocalEventStore;
    readonly handlers: HandlerRegistry;
  });
  wire(): void;
  handleHttp(request: HttpRequest): Promise<HttpResponse>;
  tickSchedule(resource: string): Promise<void>;
  publishTopic(resource: string, eventType: string, payload: unknown): Promise<void>;
  writeBucket(resource: string, key: string, value: unknown): Promise<void>;
  enqueueQueue(resource: string, body: unknown): Promise<void>;
  readonly firedEvents: readonly TriggerFiredEvent[];
}
