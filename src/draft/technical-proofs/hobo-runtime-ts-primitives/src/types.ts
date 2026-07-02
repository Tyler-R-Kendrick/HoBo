import type { Step } from "./step.js";
import type { Workflow } from "./workflow.js";

export type ArgsOf<W> = W extends Workflow<infer A, unknown> ? A : never;

export interface RunHandle {
  runId: string;
  readable: ReadableStream<unknown>;
}

export interface Message {
  type: string;
  payload: unknown;
  idempotencyKey?: string;
}

export type MessageMap<S> = Record<
  string,
  (state: S, message: Message, ctx: { emit: (type: string, data: unknown) => Promise<number> }) => S | Promise<S>
>;

export interface ActorKey {
  actor: string;
  id: string;
}

export interface StepOpts {
  retries?: number;
  timeout?: string;
  idempotencyKey?: string;
}

export interface Hook<T = unknown> {
  token: string;
  wait(): Promise<T>;
}

export interface Webhook {
  hook: Hook<unknown>;
  route: string;
}

export interface CronSchedule {
  expr: string;
}

export type StepFn<A extends unknown[], O> = (...args: A) => Promise<O>;

export interface StepRecord {
  stepKey: string;
  idempotencyKey: string;
  result?: unknown;
  failed?: { message: string; attempts: number };
}
