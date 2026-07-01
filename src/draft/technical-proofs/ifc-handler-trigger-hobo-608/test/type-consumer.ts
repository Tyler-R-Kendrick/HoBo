import { api, kv, queue } from "../src/triggers.js";

async function assertHandlerContextTypes() {
  const todos = kv("todos");
  const orders = queue("orders");
  const app = api("api", { bind: { todos, orders } });

  app.get!("/todos/:id", async (ctx) => {
    const id: string = ctx.params.id;
    const item: unknown = await (ctx.bindings as { todos: { get: (k: string) => Promise<unknown> } }).todos.get(id);
    await (ctx.bindings as { orders: { enqueue: (m: unknown) => Promise<void> } }).orders.enqueue({ id, item });
  });
}

void assertHandlerContextTypes;
