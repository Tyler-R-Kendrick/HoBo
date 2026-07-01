import { runCreateHook } from "./step.js";
import type { Webhook } from "./types.js";

export function createHook<T>(name?: string) {
  return runCreateHook<T>(name);
}

export function createWebhook(): Webhook {
  const hook = createHook<unknown>("webhook");
  return {
    hook,
    route: `/hooks/${hook.token}`,
  };
}
